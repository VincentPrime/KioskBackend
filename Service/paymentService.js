import { Op } from 'sequelize';
import { sequelize, Branch, DepositAccount, Payment, Ticket, User } from '../Models/index.js';
import { env } from '../Config/env.js';
import { ApiError } from '../Utils/ApiError.js';
import { dateInTz, timeInTz } from '../Utils/time.js';
import { ticketDto } from '../Utils/serialize.js';
import { emitToRoom } from '../Utils/socket.js';
import { broadcastQueue, lockBranch, logEvent } from './queueService.js';
import { issueTicketTx } from './ticketService.js';
import { createQr, gcashAvailable, retrieveIntent, verifyWebhookSignature } from './paymongoClient.js';

const MIN_POLL_MS = 3000;          // never ask PayMongo about the same payment more than once per 3 s
const EXPIRE_GRACE_MS = 30_000;    // wait a little past the QR expiry before calling it expired

const receiptOf = (p, ticket, branch) => ({
  receiptNo: p.receiptNo, ticketNumber: ticket.number, branchName: branch.name, accountType: p.accountType,
  amount: Number(p.amount), paidAt: p.paidAt, method: 'GCash (QR Ph)', reference: p.providerRef,
});

async function paidResult(p) {
  const [ticket, branch] = await Promise.all([Ticket.findByPk(p.ticketId), Branch.findByPk(p.branchId)]);
  return { status: 'paid', paymentId: p.id, ticket: ticketDto(ticket), receipt: receiptOf(p, ticket, branch) };
}

/** Used by admin "Reprint": a GCash ticket is reprinted together with its receipt. */
export async function receiptForTicket(ticketId) {
  const p = await Payment.findOne({ where: { ticketId, status: 'paid' } });
  if (!p) return null;
  return receiptOf(p, await Ticket.findByPk(ticketId), await Branch.findByPk(p.branchId));
}

/** Kiosk: member entered an amount -> create the payment and the QR Ph code. */
export async function createQrPayment(device, { category, accountTypeId, amount }) {
  if (!gcashAvailable()) throw ApiError.notImplemented('GCash is not available right now', 'PAYMENTS_NOT_CONFIGURED');
  const branch = await Branch.findByPk(device.branchId);
  if (branch.ticketCutoff && timeInTz(branch.timezone) > branch.ticketCutoff) throw ApiError.forbidden('Tickets are no longer being issued today', 'KIOSK_CLOSED');

  const min = Number(branch.gcashMin); const max = Number(branch.gcashMax);
  if (Math.round(amount * 100) / 100 !== amount || amount < min || amount > max) {
    throw ApiError.badRequest(`Amount must be between ${min} and ${max} pesos`, 'AMOUNT_OUT_OF_RANGE');
  }
  const account = await DepositAccount.findOne({ where: { id: accountTypeId, branchId: branch.id } });
  if (!account) throw ApiError.badRequest('That deposit account is not available', 'UNKNOWN_ACCOUNT');

  const expiresAt = new Date(Date.now() + branch.qrExpirySeconds * 1000);
  const payment = await Payment.create({
    branchId: branch.id, deviceId: device.id, category, accountType: account.name, accountTypeId: account.id, amount,
    provider: env.paymongo.mock ? 'mock' : 'paymongo', expiresAt, serviceDate: dateInTz(branch.timezone),
  });
  try {
    const qr = await createQr({
      amountPesos: amount, description: `Deposit - ${account.name}`, expirySeconds: branch.qrExpirySeconds,
      metadata: { payment_id: payment.id, branch: branch.name },
    });
    await payment.update({ providerRef: qr.intentId });
    return { paymentId: payment.id, qrImage: qr.qrImage, amount, expiresAt, status: 'pending' };
  } catch (e) {
    await payment.update({ status: 'failed' });
    throw e;
  }
}

/** Kiosk polling (fallback if the webhook is late or not set up). */
export async function getPaymentStatus(device, id) {
  let p = await Payment.findOne({ where: { id, branchId: device.branchId } });
  if (!p) throw ApiError.notFound('Payment not found');
  if (p.status === 'pending') p = await reconcilePayment(p);
  if (p.status === 'paid') return paidResult(p);
  return { status: p.status, expiresAt: p.expiresAt };
}

/** Ask PayMongo whether this payment succeeded; finalize it, or expire it. */
export async function reconcilePayment(p, { force = false, strict = false } = {}) {
  if (p.status !== 'pending') return p;
  const now = Date.now();
  if (!force && p.lastCheckedAt && now - new Date(p.lastCheckedAt).getTime() < MIN_POLL_MS) return p;
  await Payment.update({ lastCheckedAt: new Date() }, { where: { id: p.id } });

  if (!env.paymongo.mock && p.providerRef) {
    const intent = await retrieveIntent(p.providerRef).catch((e) => { if (strict) throw e; return null; });
    if (intent?.status === 'succeeded') return finalizePaid(p.id, { providerPaymentId: intent.paymentId, intentAmount: intent.amount });
  }
  if (new Date(p.expiresAt).getTime() + EXPIRE_GRACE_MS < now) {
    await Payment.update({ status: 'expired' }, { where: { id: p.id, status: 'pending' } });
    return Payment.findByPk(p.id);
  }
  return p;
}

/**
 * Money received -> create the ticket + receipt number, exactly once.
 * Safe to call from the webhook, kiosk polling and the background job at the same time.
 */
export async function finalizePaid(paymentId, { providerPaymentId = null, intentAmount = null } = {}) {
  const out = await sequelize.transaction(async (t) => {
    const pre = await Payment.findByPk(paymentId, { transaction: t });
    if (!pre) throw ApiError.notFound('Payment not found');
    const branch = await lockBranch(pre.branchId, t);                         // same lock as every queue change
    const payment = await Payment.findByPk(paymentId, { transaction: t, lock: t.LOCK.UPDATE });
    if (payment.status === 'paid') return { payment, fresh: false };

    const ymd = dateInTz(branch.timezone).replaceAll('-', '');
    const todayCount = await Payment.count({ where: { branchId: branch.id, receiptNo: { [Op.like]: `GC-${ymd}-%` } }, transaction: t });
    const receiptNo = `GC-${ymd}-${String(todayCount + 1).padStart(4, '0')}`;

    // The customer already paid, so the ticket is issued even after the daily cutoff or if the account was deleted meanwhile.
    const ticket = await issueTicketTx(branch, {
      category: payment.category, txn: 'deposit', accountTypeId: payment.accountTypeId, accountName: payment.accountType,
      paymentMethod: 'gcash', amount: payment.amount,
    }, t, { ignoreCutoff: true });

    const mismatch = intentAmount != null && intentAmount !== Math.round(Number(payment.amount) * 100);
    await payment.update({
      status: 'paid', paidAt: new Date(), ticketId: ticket.id, receiptNo, providerPaymentId, needsReview: payment.needsReview || mismatch,
    }, { transaction: t });
    await logEvent({ branchId: branch.id, ticketId: ticket.id, event: 'payment_paid', detail: { receiptNo, amount: Number(payment.amount), mismatch } }, t);
    return { payment, ticket, branch, fresh: true };
  });

  if (out.fresh) {
    const { payment, ticket, branch } = out;
    if (payment.deviceId) {
      await emitToRoom(`device:${payment.deviceId}`, 'payment:paid', { paymentId: payment.id, ticket: ticketDto(ticket), receipt: receiptOf(payment, ticket, branch) });
    }
    await emitToRoom(`staff:${branch.id}`, 'payments:changed', { paymentId: payment.id });   // staff only; never the public TV
    await broadcastQueue(branch.id);
  }
  return out.payment;
}

function findIntentId(o) {
  if (!o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && (k === 'payment_intent_id' || k === 'id') && /^pi_\w+$/.test(v)) return v;
    const r = findIntentId(v);
    if (r) return r;
  }
  return null;
}

/** PayMongo webhook. Signature is checked, then the payment is CONFIRMED with PayMongo before anything is issued. */
export async function handleWebhook(rawBody, signature) {
  if (!verifyWebhookSignature(rawBody, signature)) throw ApiError.badRequest('Invalid webhook signature', 'BAD_SIGNATURE');
  const event = JSON.parse(rawBody.toString('utf8'));
  const type = event.data?.attributes?.type;
  if (type !== 'payment.paid') return { received: true, ignored: type };

  const intentId = findIntentId(event.data.attributes.data);
  const payment = intentId && await Payment.findOne({ where: { providerRef: intentId } });
  if (!payment) return { received: true, ignored: 'unknown payment' };
  await Payment.update({ rawWebhook: event }, { where: { id: payment.id } });
  await reconcilePayment(payment, { force: true, strict: true });   // strict: if PayMongo can't be reached we answer 500 so it retries
  return { received: true };
}

/** Background job: catches payments whose webhook never arrived, and expires old QR codes. */
export async function reconcilePending() {
  const pending = await Payment.findAll({ where: { status: 'pending', providerRef: { [Op.ne]: null }, createdAt: { [Op.gt]: new Date(Date.now() - 3 * 3600_000) } } });
  for (const p of pending) await reconcilePayment(p, { force: true }).catch(() => {});
  return pending.length;
}

// ---------------- Supervisor / admin ----------------
export const paymentDto = (p) => ({
  id: p.id, status: p.status, amount: Number(p.amount), accountType: p.accountType,
  ticketNumber: p.Ticket?.number || null, receiptNo: p.receiptNo, reference: p.providerRef, providerPaymentId: p.providerPaymentId,
  createdAt: p.createdAt, paidAt: p.paidAt, needsReview: p.needsReview,
  verifyStatus: p.verifyStatus, verifiedAt: p.verifiedAt, verifiedBy: p.verifier?.fullName || null, verifyNote: p.verifyNote,
});

export const ARCHIVE_AFTER_DAYS = 7;

/**
 * Payments for the admin / supervisor screens.
 *  - Normal view: payments from the last 7 days. Older ones are in the ARCHIVE (automatic, nothing is deleted).
 *  - A From/To date range searches everything, archive included.
 *  - status filters paid / pending / expired / failed (admin). Supervisors are always limited to PAID.
 */
export async function listPayments(branchId, { from, to, view = 'active', status = 'all', paidOnly = false } = {}) {
  const branch = await Branch.findByPk(branchId);
  const weekAgo = dateInTz(branch.timezone, new Date(Date.now() - ARCHIVE_AFTER_DAYS * 86400_000));
  const custom = !!(from || to);

  const where = { branchId };
  if (custom) where.serviceDate = { ...(from ? { [Op.gte]: from } : {}), ...(to ? { [Op.lte]: to } : {}) };
  else where.serviceDate = view === 'archive' ? { [Op.lt]: weekAgo } : { [Op.gte]: weekAgo };
  if (paidOnly) where.status = 'paid';

  const LIMIT = 2000;
  const rows = await Payment.findAll({
    where, order: [['createdAt', 'DESC']], limit: LIMIT,
    include: [{ model: Ticket, attributes: ['number'] }, { model: User, as: 'verifier', attributes: ['fullName'] }],
  });
  const count = (s) => rows.filter((p) => p.status === s).length;
  const counts = { all: rows.length, paid: count('paid'), pending: count('pending'), expired: count('expired'), failed: count('failed') };
  const shown = paidOnly || status === 'all' ? rows : rows.filter((p) => p.status === status);

  const paid = rows.filter((p) => p.status === 'paid');
  const sum = (arr) => arr.reduce((acc, p) => acc + Number(p.amount), 0);
  // paid but never checked and already hidden in the archive: so they are not forgotten
  const archivedWaitingCheck = custom || view === 'archive' ? 0
    : await Payment.count({ where: { branchId, status: 'paid', verifyStatus: 'unverified', serviceDate: { [Op.lt]: weekAgo } } });

  return {
    payments: shown.map(paymentDto), counts,
    totals: {
      count: paid.length, amount: sum(paid), verifiedAmount: sum(paid.filter((p) => p.verifyStatus === 'verified')),
      waitingCheck: paid.filter((p) => p.verifyStatus === 'unverified').length, problems: paid.filter((p) => p.verifyStatus === 'problem').length,
    },
    view: custom ? 'range' : view, archiveAfterDays: ARCHIVE_AFTER_DAYS, archivedWaitingCheck, truncated: rows.length === LIMIT,
    simulation: env.allowPaymentSimulation,
  };
}

/** Supervisor confirms the money was really received (or reports a problem). */
export async function verifyPayment(actor, branchId, id, { status, note }) {
  const p = await Payment.findOne({ where: { id, branchId } });
  if (!p) throw ApiError.notFound('Payment not found');
  if (p.status !== 'paid') throw ApiError.conflict('Only paid payments can be checked', 'NOT_PAID');
  if (status === 'problem' && !note) throw ApiError.badRequest('Please describe the problem', 'NOTE_REQUIRED');
  await p.update({ verifyStatus: status, verifiedAt: new Date(), verifiedBy: actor.id, verifyNote: note || null });
  await logEvent({ branchId, ticketId: p.ticketId, userId: actor.id, event: `payment_${status}`, detail: { receiptNo: p.receiptNo, note } });
  await emitToRoom(`staff:${branchId}`, 'payments:changed', { paymentId: id });
}

/** TESTING ONLY (ALLOW_PAYMENT_SIMULATION=true): pretend a pending payment was paid. */
export async function simulatePaid(branchId, id) {
  if (!env.allowPaymentSimulation) throw ApiError.forbidden('Payment simulation is turned off', 'SIMULATION_OFF');
  const p = await Payment.findOne({ where: { id, branchId } });
  if (!p) throw ApiError.notFound('Payment not found');
  if (p.status !== 'pending') throw ApiError.conflict('Only pending payments can be simulated', 'NOT_PENDING');
  await finalizePaid(id, { providerPaymentId: `sim_${Date.now()}` });
}

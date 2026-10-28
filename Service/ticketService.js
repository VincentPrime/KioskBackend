import { sequelize, Branch, DepositAccount, DepositDetail, Ticket } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { timeInTz } from '../Utils/time.js';
import { ticketDto } from '../Utils/serialize.js';
import { broadcastQueue, enqueueTicket, lockBranch } from './queueService.js';
import { gcashAvailable } from './paymongoClient.js';

/** Public settings the kiosk needs (idle timeout, GCash limits, whether tickets are still being issued). */
export async function getKioskConfig(branchId) {
  const b = await Branch.findByPk(branchId);
  const open = !b.ticketCutoff || timeInTz(b.timezone) <= b.ticketCutoff;
  const accountTypes = (await DepositAccount.findAll({ where: { branchId }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] })).map((a) => ({ id: a.id, name: a.name }));
  return {
    accountTypes, gcashEnabled: gcashAvailable(), branchName: b.name, open, ticketCutoff: b.ticketCutoff, idleTimeoutSeconds: b.idleTimeoutSeconds,
    gcashMin: Number(b.gcashMin), gcashMax: Number(b.gcashMax), qrExpirySeconds: b.qrExpirySeconds,
  };
}

/** Create the ticket inside an open transaction (branch must already be locked). */
export async function issueTicketTx(branch, { category, txn, accountTypeId, accountName, paymentMethod, amount }, t, { ignoreCutoff = false } = {}) {
  if (!ignoreCutoff && branch.ticketCutoff && timeInTz(branch.timezone) > branch.ticketCutoff) {
    throw ApiError.forbidden('Tickets are no longer being issued today', 'KIOSK_CLOSED');
  }
  let account = null; let name = null;
  if (txn === 'deposit') {
    account = await DepositAccount.findOne({ where: { id: accountTypeId, branchId: branch.id }, transaction: t });
    name = account?.name ?? accountName ?? null;        // accountName = fallback for a paid GCash deposit whose account was deleted meanwhile
    if (!name) throw ApiError.badRequest('That deposit account is not available', 'UNKNOWN_ACCOUNT');
  }
  const created = await enqueueTicket(branch, { category, txn }, t);
  if (txn === 'deposit') {
    await DepositDetail.create({ ticketId: created.id, accountType: name, accountTypeId: account?.id ?? null, paymentMethod, amount: amount ?? null }, { transaction: t });
  }
  return created;
}

/** Cash deposits, withdrawals and loans: issued straight from the kiosk. */
export async function issueTicket(branchId, data) {
  const ticket = await sequelize.transaction(async (t) => issueTicketTx(await lockBranch(branchId, t), data, t));
  await broadcastQueue(branchId);
  return ticketDto(ticket);
}

/** The kiosk reports that it sent the ticket to the printer. */
export async function markPrinted(branchId, ticketId) {
  const t = await Ticket.findOne({ where: { id: ticketId, branchId } });
  if (!t) throw ApiError.notFound('Ticket not found');
  await t.update({ printCount: t.printCount + 1, lastPrintedAt: new Date() });
}

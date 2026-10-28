// GCash / QR Ph flow against a real Postgres + a fake PayMongo server. Needs TEST_DATABASE_URL (it WIPES that database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startFakePaymongo } from './helpers/fakePaymongo.js';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL && 'set TEST_DATABASE_URL to run';
const WHSEC = 'whsk_test_secret';
let fake, M, P, K, A, env, branch, device, acct, other;

before(async () => {
  if (skip) return;
  fake = await startFakePaymongo();
  Object.assign(process.env, { DATABASE_URL: URL, DB_SSL: 'false', JWT_SECRET: 't', PAYMONGO_SECRET_KEY: 'sk_test_x', PAYMONGO_PUBLIC_KEY: 'pk_test_x', PAYMONGO_WEBHOOK_SECRET: WHSEC, PAYMONGO_API_URL: fake.url });
  M = await import('../Models/index.js');
  P = await import('../Service/paymentService.js');
  K = await import('../Service/ticketService.js');
  A = await import('../Service/adminService.js');
  ({ env } = await import('../Config/env.js'));
  await M.sequelize.sync({ force: true });
  branch = await M.Branch.create({ name: 'Test', gcashMin: 100, gcashMax: 50000, qrExpirySeconds: 300 });
  device = await M.Device.create({ branchId: branch.id, kind: 'kiosk', name: 'K', tokenHash: 'x' });
  acct = await M.DepositAccount.create({ branchId: branch.id, name: 'Savings' });
  other = await M.User.create({ branchId: branch.id, username: 'sup', fullName: 'Super Visor', passwordHash: 'x', role: 'supervisor' });
});
after(async () => { if (!skip) { fake.close(); await M.sequelize.close(); } });

const start = (over = {}) => P.createQrPayment(device, { category: 'R', accountTypeId: acct.id, amount: 500, ...over });
const recheck = (id) => M.Payment.update({ lastCheckedAt: null }, { where: { id } });
const sign = (body, mode = 'te') => {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex');
  return `t=${t},te=${mode === 'te' ? sig : ''},li=${mode === 'li' ? sig : ''}`;
};
const event = (intent, { type = 'payment.paid', livemode = false } = {}) =>
  Buffer.from(JSON.stringify({ data: { id: 'evt_1', type: 'event', attributes: { type, livemode, data: { id: 'pay_1', type: 'payment', attributes: { payment_intent_id: intent, status: 'paid' } } } } }));

test('creates a QR Ph payment using the documented 3-step flow (amount in centavos)', { skip }, async () => {
  const r = await start();
  assert.equal(r.status, 'pending');
  assert.match(r.qrImage, /^data:image\/png;base64,/);
  const [intent, method, attach] = fake.state.calls.slice(-3);
  assert.equal(intent.url, '/payment_intents');
  assert.equal(intent.body.data.attributes.amount, 50000);
  assert.deepEqual(intent.body.data.attributes.payment_method_allowed, ['qrph']);
  assert.equal(intent.body.data.attributes.currency, 'PHP');
  assert.ok(intent.auth.startsWith('Basic '));
  assert.equal(method.body.data.attributes.type, 'qrph');
  assert.equal(method.body.data.attributes.expiry_seconds, 300);
  assert.match(attach.url, /\/attach$/);
  assert.equal(attach.body.data.attributes.payment_method, 'pm_fake');
  assert.ok(attach.body.data.attributes.client_key.endsWith('_client'));
  assert.equal((await M.Payment.findByPk(r.paymentId)).providerRef, 'pi_fake1');
});

test('rejects bad amounts and unknown accounts before calling PayMongo', { skip }, async () => {
  const calls = fake.state.calls.length;
  for (const amount of [50, 60000, 100.505]) await assert.rejects(start({ amount }), { code: 'AMOUNT_OUT_OF_RANGE' });
  await assert.rejects(start({ accountTypeId: '00000000-0000-4000-8000-000000000000' }), { code: 'UNKNOWN_ACCOUNT' });
  assert.equal(fake.state.calls.length, calls);
});

test('polling while unpaid keeps it pending and creates NO ticket', { skip }, async () => {
  const p = await M.Payment.findOne({ where: { providerRef: 'pi_fake1' } });
  await recheck(p.id);
  assert.equal((await P.getPaymentStatus(device, p.id)).status, 'pending');
  assert.equal(await M.Ticket.count(), 0);
});

test('when PayMongo says succeeded: ticket + receipt, exactly once', { skip }, async () => {
  const p = await M.Payment.findOne({ where: { providerRef: 'pi_fake1' } });
  fake.state.intents.get('pi_fake1').status = 'succeeded';
  await recheck(p.id);
  const r = await P.getPaymentStatus(device, p.id);
  assert.equal(r.status, 'paid');
  assert.equal(r.ticket.number, 'R-1');
  assert.match(r.receipt.receiptNo, /^GC-\d{8}-0001$/);
  assert.equal(r.receipt.amount, 500);
  assert.equal(r.receipt.accountType, 'Savings');
  const d = await M.DepositDetail.findByPk(r.ticket.id);
  assert.equal(d.paymentMethod, 'gcash');
  assert.equal(Number(d.amount), 500);
  assert.equal((await M.Ticket.findByPk(r.ticket.id)).status, 'waiting');     // in the shared line
  await recheck(p.id);
  assert.equal((await P.getPaymentStatus(device, p.id)).ticket.id, r.ticket.id);   // poll again: same ticket
  assert.equal(await M.Ticket.count(), 1);
});

test('5 simultaneous confirmations create ONE ticket', { skip }, async () => {
  const r = await start({ amount: 200 });
  const p = await M.Payment.findByPk(r.paymentId);
  await Promise.all(Array.from({ length: 5 }, () => P.finalizePaid(p.id)));
  assert.equal(await M.Ticket.count(), 2);
  assert.equal(await M.Payment.count({ where: { status: 'paid' } }), 2);
  assert.match((await M.Payment.findByPk(p.id)).receiptNo, /-0002$/);
});

test('webhook: bad / wrong-mode / missing signatures are rejected', { skip }, async () => {
  const body = event('pi_fake1');
  await assert.rejects(P.handleWebhook(body, 't=1,te=deadbeef,li='), { code: 'BAD_SIGNATURE' });
  await assert.rejects(P.handleWebhook(body, undefined), { code: 'BAD_SIGNATURE' });
  await assert.rejects(P.handleWebhook(body, sign(body.toString(), 'li')), { code: 'BAD_SIGNATURE' });   // test event signed as live
  const signed = sign(body.toString());
  const tampered = Buffer.from(body.toString().replace('pi_fake1', 'pi_fake2'));     // body changed after signing
  await assert.rejects(P.handleWebhook(tampered, signed), { code: 'BAD_SIGNATURE' });
});

test('webhook: valid signature -> PayMongo is asked to CONFIRM -> ticket issued', { skip }, async () => {
  const r = await start({ amount: 750, category: 'S' });
  fake.state.intents.get('pi_fake3').status = 'succeeded';
  const body = event('pi_fake3');
  assert.deepEqual(await P.handleWebhook(body, sign(body.toString())), { received: true });
  const p = await M.Payment.findByPk(r.paymentId);
  assert.equal(p.status, 'paid');
  assert.ok(p.rawWebhook);
  assert.equal((await M.Ticket.findByPk(p.ticketId)).number, 'S-1');
});

test('webhook claiming "paid" while PayMongo says otherwise does NOT issue a ticket', { skip }, async () => {
  const r = await start({ amount: 300 });                       // pi_fake4 stays awaiting_next_action
  const body = event('pi_fake4');
  await P.handleWebhook(body, sign(body.toString()));
  assert.equal((await M.Payment.findByPk(r.paymentId)).status, 'pending');
});

test('webhook: unknown intents and other event types are ignored with 200', { skip }, async () => {
  const b1 = event('pi_unknown');
  assert.equal((await P.handleWebhook(b1, sign(b1.toString()))).ignored, 'unknown payment');
  const b2 = event('pi_fake4', { type: 'qrph.expired' });
  assert.equal((await P.handleWebhook(b2, sign(b2.toString()))).ignored, 'qrph.expired');
});

test('webhook: if PayMongo cannot be reached the handler fails so PayMongo retries', { skip }, async () => {
  fake.state.failRetrieve = true;
  const body = event('pi_fake4');
  await assert.rejects(P.handleWebhook(body, sign(body.toString())), { code: 'PROVIDER_ERROR' });
  fake.state.failRetrieve = false;
});

test('an expired, unpaid QR becomes "expired"', { skip }, async () => {
  const p = await M.Payment.findOne({ where: { providerRef: 'pi_fake4' } });
  await p.update({ expiresAt: new Date(Date.now() - 120_000), lastCheckedAt: null });
  fake.state.intents.get('pi_fake4').status = 'awaiting_payment_method';
  assert.equal((await P.getPaymentStatus(device, p.id)).status, 'expired');
});

test('amount mismatch is still ticketed (money received) but flagged for review', { skip }, async () => {
  const r = await start({ amount: 400 });
  fake.state.intents.get('pi_fake5').status = 'succeeded';
  fake.state.intents.get('pi_fake5').amount = 12345;
  await P.reconcilePayment(await M.Payment.findByPk(r.paymentId), { force: true });
  const p = await M.Payment.findByPk(r.paymentId);
  assert.equal(p.status, 'paid');
  assert.equal(p.needsReview, true);
});

test('paid even after the daily cutoff: the customer already paid', { skip }, async () => {
  const r = await start({ amount: 150 });
  await branch.update({ ticketCutoff: '00:00:01' });            // already past
  await assert.rejects(K.issueTicket(branch.id, { category: 'R', txn: 'withdraw' }), { code: 'KIOSK_CLOSED' });
  await assert.rejects(start({ amount: 150 }), { code: 'KIOSK_CLOSED' });
  await P.finalizePaid(r.paymentId);
  assert.equal((await M.Payment.findByPk(r.paymentId)).status, 'paid');
  await branch.update({ ticketCutoff: null });
});

test('supervisor sees only PAID payments and can verify / report a problem', { skip }, async () => {
  const sup = await P.listPayments(branch.id, { paidOnly: true });
  assert.ok(sup.payments.length >= 3);
  assert.ok(sup.payments.every((p) => p.status === 'paid'));
  assert.ok(sup.payments.every((p) => p.ticketNumber && p.receiptNo));
  const all = await P.listPayments(branch.id, { paidOnly: false });
  assert.ok(all.payments.some((p) => p.status === 'expired' || p.status === 'pending'));
  assert.equal(sup.totals.count, sup.payments.length);
  assert.equal(sup.totals.waitingCheck, sup.payments.length);

  const first = sup.payments[0];
  await P.verifyPayment(other, branch.id, first.id, { status: 'verified' });
  await assert.rejects(P.verifyPayment(other, branch.id, sup.payments[1].id, { status: 'problem' }), { code: 'NOTE_REQUIRED' });
  await P.verifyPayment(other, branch.id, sup.payments[1].id, { status: 'problem', note: 'Not in bank yet' });
  const after = await P.listPayments(branch.id, { paidOnly: true });
  const v = after.payments.find((p) => p.id === first.id);
  assert.equal(v.verifyStatus, 'verified');
  assert.equal(v.verifiedBy, 'Super Visor');
  assert.equal(after.totals.problems, 1);
  const pending = (await P.listPayments(branch.id, { paidOnly: false })).payments.find((p) => p.status !== 'paid');
  await assert.rejects(P.verifyPayment(other, branch.id, pending.id, { status: 'verified' }), { code: 'NOT_PAID' });
});

test('simulate-paid is blocked unless explicitly enabled', { skip }, async () => {
  const r = await start({ amount: 120 });
  await assert.rejects(P.simulatePaid(branch.id, r.paymentId), { code: 'SIMULATION_OFF' });
  env.allowPaymentSimulation = true;
  await P.simulatePaid(branch.id, r.paymentId);
  assert.equal((await M.Payment.findByPk(r.paymentId)).status, 'paid');
  await assert.rejects(P.simulatePaid(branch.id, r.paymentId), { code: 'NOT_PENDING' });
  env.allowPaymentSimulation = false;
});

test('a payment from another branch is invisible to this kiosk', { skip }, async () => {
  const { createBranchWithDefaults } = await import('../Service/branchService.js');
  const b2 = await createBranchWithDefaults({ name: 'Other' });
  const d2 = await M.Device.create({ branchId: b2.id, kind: 'kiosk', name: 'K2', tokenHash: 'y' });
  const r = await start();
  await assert.rejects(P.getPaymentStatus(d2, r.paymentId), { status: 404 });
  assert.equal((await P.listPayments(b2.id, { paidOnly: true })).payments.length, 0);
});

test('reprint of a GCash ticket carries its receipt', { skip }, async () => {
  const paid = await M.Payment.findOne({ where: { status: 'paid' } });
  const rec = await P.receiptForTicket(paid.ticketId);
  assert.equal(rec.receiptNo, paid.receiptNo);
  assert.equal(await P.receiptForTicket('00000000-0000-4000-8000-000000000000'), null);
});

const dayAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const mk = (over) => M.Payment.create({ branchId: branch.id, category: 'R', accountType: 'Savings', amount: 100, provider: 'paymongo', expiresAt: new Date(), serviceDate: dayAgo(0), ...over });

test('status filter, counts, 1-week archive and date ranges', { skip }, async () => {
  await M.Payment.destroy({ where: {} });
  await mk({ status: 'paid', receiptNo: 'GC-T-1', verifyStatus: 'unverified' });
  await mk({ status: 'pending' });
  await mk({ status: 'expired' });
  await mk({ status: 'paid', receiptNo: 'GC-T-2', serviceDate: dayAgo(3) });                          // within the week
  await mk({ status: 'paid', receiptNo: 'GC-T-3', serviceDate: dayAgo(10), verifyStatus: 'unverified' });  // archived
  await mk({ status: 'expired', serviceDate: dayAgo(30) });                                             // archived
  await mk({ status: 'pending', serviceDate: dayAgo(8) });                                              // archived

  const act = await P.listPayments(branch.id, {});
  assert.equal(act.view, 'active');
  assert.deepEqual(act.counts, { all: 4, paid: 2, pending: 1, expired: 1, failed: 0 });
  assert.equal(act.payments.length, 4);
  assert.equal(act.archivedWaitingCheck, 1);                                   // the unchecked paid one hidden in the archive

  const paid = await P.listPayments(branch.id, { status: 'paid' });
  assert.ok(paid.payments.length === 2 && paid.payments.every((p) => p.status === 'paid'));
  assert.equal(paid.counts.all, 4);                                            // tab counts stay the same when a tab is picked
  for (const st of ['pending', 'expired']) assert.ok((await P.listPayments(branch.id, { status: st })).payments.every((p) => p.status === st));

  const arch = await P.listPayments(branch.id, { view: 'archive' });
  assert.equal(arch.payments.length, 3);
  assert.equal(arch.archivedWaitingCheck, 0);

  const range = await P.listPayments(branch.id, { from: dayAgo(12), to: dayAgo(2) });   // searches archive + recent
  assert.equal(range.view, 'range');
  assert.equal(range.payments.length, 3);                                              // 3 days ago, 10 days ago, 8 days ago
  assert.equal((await P.listPayments(branch.id, { from: dayAgo(0) })).payments.length, 3);
  assert.equal((await P.listPayments(branch.id, { to: dayAgo(20) })).payments.length, 1);
  assert.equal((await P.listPayments(branch.id, { from: dayAgo(12), to: dayAgo(2), status: 'paid' })).payments.length, 2);

  const sup = await P.listPayments(branch.id, { paidOnly: true, status: 'pending' });   // supervisor cannot widen beyond PAID
  assert.ok(sup.payments.every((p) => p.status === 'paid'));
  assert.equal(sup.counts.pending, 0);
});

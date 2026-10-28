// Integration test against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
// WARNING: it wipes the tables, so point it at a throwaway database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.TEST_DATABASE_URL;
const skip = !URL && 'set TEST_DATABASE_URL to run';
if (URL) {
  process.env.DATABASE_URL = URL;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = 'test-secret';
}

let M, Q, S, T, A;
let branch, w1, w2, emp1, emp2;

before(async () => {
  if (skip) return;
  M = await import('../Models/index.js');
  Q = await import('../Service/queueService.js');
  S = await import('../Service/sessionService.js');
  T = await import('../Service/ticketService.js');
  A = await import('../Service/adminService.js');
  await M.sequelize.sync({ force: true });
  branch = await M.Branch.create({ name: 'Test', maxRecalls: 2 });
  w1 = await M.Window.create({ branchId: branch.id, name: 'Window 1', sortOrder: 1 });
  w2 = await M.Window.create({ branchId: branch.id, name: 'Window 2', sortOrder: 2 });
  const mk = (username) => M.User.create({ branchId: branch.id, username, fullName: username, passwordHash: 'x', role: 'employee' });
  emp1 = await mk('emp1');
  emp2 = await mk('emp2');
});
after(async () => { if (!skip) await M.sequelize.close(); });

const issue = (category, txn = 'withdraw') => T.issueTicket(branch.id, { category, txn });
const waitingOrder = async () =>
  (await M.Ticket.findAll({ where: { branchId: branch.id, status: 'waiting' }, order: [['queuePos', 'ASC']] })).map((t) => t.number);

test('priority placement matches the spec (DB)', { skip }, async () => {
  for (const c of ['R', 'R', 'R']) await issue(c);
  await issue('S');
  assert.deepEqual(await waitingOrder(), ['R-1', 'S-1', 'R-2', 'R-3']);
  await issue('S');
  assert.deepEqual(await waitingOrder(), ['R-1', 'S-1', 'R-2', 'S-2', 'R-3']);
});

test('concurrent kiosk requests keep a consistent order and unique numbers', { skip }, async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => issue(i % 2 ? 'S' : 'R')));
  const all = await M.Ticket.findAll({ where: { branchId: branch.id } });
  assert.equal(new Set(all.map((t) => t.number)).size, all.length);
  const pos = (await M.Ticket.findAll({ where: { branchId: branch.id, status: 'waiting' } })).map((t) => t.queuePos);
  assert.equal(new Set(pos).size, pos.length, 'queue positions must be unique');
});

test('Next requires an open window, then follows the shared line', { skip }, async () => {
  await assert.rejects(Q.callNext(emp1), { code: 'NO_SESSION' });
  await S.openSession(emp1, w1.id);
  const first = await Q.callNext(emp1);
  assert.equal(first.number, 'R-1');
  assert.equal(first.window.name, 'Window 1');
});

test('Next is blocked until Done', { skip }, async () => {
  await assert.rejects(Q.callNext(emp1), { code: 'ALREADY_SERVING' });
  await Q.completeTicket(emp1);
  const second = await Q.callNext(emp1);
  assert.equal(second.number, 'S-1');
});

test('second window logging in simply starts pulling from the same line', { skip }, async () => {
  await S.openSession(emp2, w2.id);
  const t = await Q.callNext(emp2);
  assert.equal(t.window.name, 'Window 2');
  assert.notEqual(t.number, 'S-1');
  assert.equal((await M.Ticket.findOne({ where: { number: 'S-1', branchId: branch.id } })).status, 'serving');
});

test('cannot close or break while serving', { skip }, async () => {
  await assert.rejects(S.closeSession(emp2), { code: 'FINISH_SERVING' });
  await assert.rejects(S.setBreak(emp2, true), { code: 'FINISH_SERVING' });
});

test('no-show only after the required recalls', { skip }, async () => {
  await assert.rejects(Q.markNoShow(emp2), { code: 'RECALL_FIRST' });
  await Q.recallTicket(emp2);
  await Q.recallTicket(emp2);
  const r = await Q.markNoShow(emp2);
  assert.equal(r.status, 'no_show');
});

test('break stops a window from calling', { skip }, async () => {
  await S.setBreak(emp2, true);
  await assert.rejects(Q.callNext(emp2), { code: 'ON_BREAK' });
  await S.setBreak(emp2, false);
});

test('a window cannot be opened by two employees', { skip }, async () => {
  const emp3 = await M.User.create({ branchId: branch.id, username: 'emp3', fullName: 'emp3', passwordHash: 'x' });
  await assert.rejects(S.openSession(emp3, w1.id), { code: 'WINDOW_IN_USE' });
});

test('stale session is swept and its ticket returns to the FRONT of the line', { skip }, async () => {
  const before = await waitingOrder();
  const serving = await M.Ticket.findOne({ where: { branchId: branch.id, status: 'serving', windowId: w1.id } });
  assert.ok(serving, 'window 1 should be serving someone');
  await M.WindowSession.update({ lastSeenAt: new Date(Date.now() - 10 * 60_000) }, { where: { userId: emp1.id, endedAt: null } });
  const closed = await S.sweepStaleSessions();
  assert.equal(closed, 1);
  const after = await waitingOrder();
  assert.equal(after[0], serving.number);
  assert.equal(after.length, before.length + 1);
  assert.equal(await M.WindowSession.count({ where: { userId: emp1.id, endedAt: null } }), 0);
});

test('priority rule still applies after a release', { skip }, async () => {
  const q = await waitingOrder();
  await issue('S');
  const q2 = await waitingOrder();
  assert.equal(q2.length, q.length + 1);
  const regulars = q2.filter((n) => n.startsWith('R'));
  assert.deepEqual(regulars, q.filter((n) => n.startsWith('R')), 'regulars keep their order');
});

test('display state never exposes the waiting line', { skip }, async () => {
  const d = await Q.getDisplayState(branch.id);
  assert.deepEqual(Object.keys(d).sort(), ['recent', 'serving']);
});

test('deposit details store the account NAME; deleting the account keeps old records', { skip }, async () => {
  const acc = await M.DepositAccount.create({ branchId: branch.id, name: 'Share Capital' });
  const t = await T.issueTicket(branch.id, { category: 'R', txn: 'deposit', accountTypeId: acc.id, paymentMethod: 'cash' });
  assert.equal((await M.DepositDetail.findByPk(t.id)).accountType, 'Share Capital');
  await A.removeDepositAccount(branch.id, acc.id);
  assert.equal((await M.DepositDetail.findByPk(t.id)).accountType, 'Share Capital');
  await assert.rejects(T.issueTicket(branch.id, { category: 'R', txn: 'deposit', accountTypeId: acc.id, paymentMethod: 'cash' }), { code: 'UNKNOWN_ACCOUNT' });
});

test('windows with history are disabled, not deleted', { skip }, async () => {
  await S.closeSession(emp2).catch(() => {});
  assert.equal((await A.removeWindow(branch.id, w2.id)).disabled, true);
});

test('a second branch has its own line, numbering, windows and accounts', { skip }, async () => {
  const { createBranchWithDefaults } = await import('../Service/branchService.js');
  const b2 = await createBranchWithDefaults({ name: 'Second Branch' });
  assert.equal(await M.Window.count({ where: { branchId: b2.id } }), 2);
  assert.deepEqual((await A.listDepositAccounts(b2.id)).map((a) => a.name), ['Savings', 'Special', 'Share Capital']);
  const t1 = await T.issueTicket(b2.id, { category: 'R', txn: 'withdraw' });
  const t2 = await T.issueTicket(b2.id, { category: 'S', txn: 'loan' });
  assert.equal(t1.number, 'R-1');
  assert.equal(t2.number, 'S-1');
  const line2 = (await M.Ticket.findAll({ where: { branchId: b2.id, status: 'waiting' }, order: [['queuePos', 'ASC']] })).map((t) => t.number);
  assert.deepEqual(line2, ['R-1', 'S-1']);
  // Admin of branch 1 cannot touch branch 2's data
  await assert.rejects(A.updateWindow(branch.id, (await M.Window.findOne({ where: { branchId: b2.id } })).id, { name: 'x' }), { status: 404 });
  // no kiosk device in the new branch
  await assert.rejects(A.reprintTicket(emp1, b2.id, (await M.Ticket.findOne({ where: { branchId: b2.id } })).id), { code: 'NO_KIOSK' });
});

test('reprint: needs an online kiosk; printed counter is tracked', { skip }, async () => {
  await A.createDevice(branch.id, { kind: 'kiosk', name: 'Kiosk 1' });
  const t = await M.Ticket.findOne({ where: { branchId: branch.id } });
  await assert.rejects(A.reprintTicket(emp1, branch.id, t.id), { code: 'KIOSK_OFFLINE' });   // nobody connected in tests
  assert.equal(t.printCount, 0);
  await T.markPrinted(branch.id, t.id);
  assert.equal((await M.Ticket.findByPk(t.id)).printCount, 1);
  const today = await A.listTodayTickets(branch.id);
  assert.ok(today.length > 0);
});

test('an employee with an assigned window cannot pick another one; "no default window" can choose', { skip }, async () => {
  const w3 = await M.Window.create({ branchId: branch.id, name: 'Window 3', sortOrder: 3 });
  const w4 = await M.Window.create({ branchId: branch.id, name: 'Window 4', sortOrder: 4 });
  const assigned = await M.User.create({ branchId: branch.id, username: 'assigned', fullName: 'Assigned', passwordHash: 'x', defaultWindowId: w3.id });
  await assert.rejects(S.openSession(assigned, w4.id), { code: 'WINDOW_LOCKED' });
  const s1 = await S.openSession(assigned, undefined);
  assert.equal(s1.window.name, 'Window 3');
  await S.closeSession(assigned);
  assert.equal((await S.openSession(assigned, w3.id)).window.name, 'Window 3');   // choosing their own is fine
  await S.closeSession(assigned);
  const free = await M.User.create({ branchId: branch.id, username: 'free', fullName: 'Free', passwordHash: 'x' });
  assert.equal((await S.openSession(free, w4.id)).window.name, 'Window 4');
  await S.closeSession(free);
});

test('revoked devices disappear from the device list (but their token stays dead)', { skip }, async () => {
  const d = await A.createDevice(branch.id, { kind: 'display', name: 'Old TV' });
  assert.ok((await A.listDevices(branch.id)).some((x) => x.id === d.id));
  await A.revokeDevice(branch.id, d.id);
  assert.ok(!(await A.listDevices(branch.id)).some((x) => x.id === d.id));
  const { hashToken } = await import('../Utils/token.js');
  assert.equal((await M.Device.findOne({ where: { tokenHash: hashToken(d.token), isActive: true } })), null);
});

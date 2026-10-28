import { Op } from 'sequelize';
import { sequelize, Branch, Ticket, Window, TicketEvent, WindowSession, User } from '../Models/index.js';
import { insertionIndex } from '../Utils/queueEngine.js';
import { ApiError } from '../Utils/ApiError.js';
import { dateInTz } from '../Utils/time.js';
import { emitToBranch } from '../Utils/socket.js';
import { ticketDto } from '../Utils/serialize.js';

/** Serialises every queue change for a branch (enqueue / call / release all take this lock). */
export const lockBranch = (branchId, t) =>
  Branch.findByPk(branchId, { transaction: t, lock: t.LOCK.UPDATE });

export const logEvent = ({ branchId, ticketId, userId, windowId, event, detail }, t) =>
  TicketEvent.create({ branchId, ticketId, userId, windowId, event, detail }, { transaction: t });

/** Tickets left waiting from a previous day are cancelled so yesterday never leaks into today. */
async function expireOldTickets(branch, t) {
  await Ticket.update(
    { status: 'cancelled', queuePos: null, finishedAt: new Date() },
    { where: { branchId: branch.id, status: 'waiting', serviceDate: { [Op.lt]: dateInTz(branch.timezone) } }, transaction: t },
  );
}

/**
 * Place a new ticket in the shared line. Must run inside a transaction with the branch locked.
 * The placement rule itself lives in Utils/queueEngine.js (unit tested).
 */
export async function enqueueTicket(branch, { category, txn }, t) {
  await expireOldTickets(branch, t);
  const serviceDate = dateInTz(branch.timezone);

  const waiting = await Ticket.findAll({
    where: { branchId: branch.id, status: 'waiting' },
    attributes: ['id', 'category', 'queuePos'],
    order: [['queuePos', 'ASC']],
    transaction: t,
  });

  const idx = insertionIndex(waiting, category);
  let pos;
  if (idx < waiting.length) {
    pos = waiting[idx].queuePos;           // take that slot, push everything from there back by one
    await Ticket.increment('queuePos', {
      by: 1,
      where: { branchId: branch.id, status: 'waiting', queuePos: { [Op.gte]: pos } },
      transaction: t,
    });
  } else {
    pos = waiting.length ? waiting[waiting.length - 1].queuePos + 1 : 1;
  }

  const maxSeq = await Ticket.max('seq', { where: { branchId: branch.id, serviceDate, category }, transaction: t });
  const seq = (Number(maxSeq) || 0) + 1;

  const ticket = await Ticket.create({
    branchId: branch.id, serviceDate, category, seq, number: `${category}-${seq}`, txn, queuePos: pos,
  }, { transaction: t });

  await logEvent({ branchId: branch.id, ticketId: ticket.id, event: 'created', detail: { category, txn, pos } }, t);
  return ticket;
}

/** Put a serving ticket back at the FRONT of the line (crashed PC, admin release). */
export async function releaseServingTicket(ticket, branch, t, { userId = null, reason = 'released' } = {}) {
  const first = await Ticket.min('queuePos', { where: { branchId: branch.id, status: 'waiting' }, transaction: t });
  const windowId = ticket.windowId;
  const head = first === null || first === undefined || Number.isNaN(Number(first)) ? 1 : Number(first);
  await ticket.update({
    status: 'waiting', queuePos: head - 1,
    windowId: null, servedBy: null, calledAt: null, recallCount: 0,
  }, { transaction: t });
  await logEvent({ branchId: branch.id, ticketId: ticket.id, userId, windowId, event: 'released', detail: { reason } }, t);
}

async function openSessionFor(user, t) {
  const session = await WindowSession.findOne({
    where: { userId: user.id, endedAt: null }, include: [{ model: Window, as: 'window' }], transaction: t,
  });
  if (!session) throw ApiError.badRequest('Open a window first', 'NO_SESSION');
  return session;
}

async function currentTicketFor(session, t) {
  const ticket = await Ticket.findOne({
    where: { windowId: session.windowId, status: 'serving' }, include: [{ model: Window, as: 'window' }], transaction: t,
  });
  if (!ticket) throw ApiError.conflict('No ticket is being served at your window', 'NOT_SERVING');
  return ticket;
}

/** NEXT: call the head of the shared line to this employee's window. */
export async function callNext(user) {
  const out = await sequelize.transaction(async (t) => {
    const session = await openSessionFor(user, t);
    if (session.onBreak) throw ApiError.conflict('Your window is on break', 'ON_BREAK');
    const branch = await lockBranch(session.window.branchId, t);
    await expireOldTickets(branch, t);

    const busy = await Ticket.findOne({ where: { windowId: session.windowId, status: 'serving' }, transaction: t });
    if (busy) throw ApiError.conflict('Press Done before calling the next number', 'ALREADY_SERVING');

    const ticket = await Ticket.findOne({
      where: { branchId: branch.id, status: 'waiting' }, order: [['queuePos', 'ASC']], transaction: t,
    });
    if (!ticket) return { branchId: branch.id, ticket: null };

    await ticket.update({
      status: 'serving', queuePos: null, windowId: session.windowId, servedBy: user.id, calledAt: new Date(), recallCount: 0,
    }, { transaction: t });
    await logEvent({ branchId: branch.id, ticketId: ticket.id, userId: user.id, windowId: session.windowId, event: 'called' }, t);
    ticket.window = session.window;
    return { branchId: branch.id, ticket };
  });

  if (out.ticket) {
    emitToBranch(out.branchId, 'ticket:called', {
      ticketNumber: out.ticket.number, windowName: out.ticket.window.name, recall: false,
    });
    await broadcastQueue(out.branchId);
  }
  return ticketDto(out.ticket);
}

/** DONE: finish the current transaction so Next can be pressed again. */
export async function completeTicket(user) {
  const out = await sequelize.transaction(async (t) => {
    const session = await openSessionFor(user, t);
    const branch = await lockBranch(session.window.branchId, t);
    const ticket = await currentTicketFor(session, t);
    await ticket.update({ status: 'done', finishedAt: new Date() }, { transaction: t });
    await logEvent({ branchId: branch.id, ticketId: ticket.id, userId: user.id, windowId: session.windowId, event: 'done' }, t);
    return { branchId: branch.id, ticket };
  });
  await broadcastQueue(out.branchId);
  return ticketDto(out.ticket);
}

/** RECALL: announce the current number again. */
export async function recallTicket(user) {
  const out = await sequelize.transaction(async (t) => {
    const session = await openSessionFor(user, t);
    const branch = await lockBranch(session.window.branchId, t);
    const ticket = await currentTicketFor(session, t);
    await ticket.increment('recallCount', { transaction: t });
    await ticket.reload({ transaction: t });
    await logEvent({ branchId: branch.id, ticketId: ticket.id, userId: user.id, windowId: session.windowId, event: 'recalled', detail: { count: ticket.recallCount } }, t);
    return { branch, ticket };
  });
  emitToBranch(out.branch.id, 'ticket:called', {
    ticketNumber: out.ticket.number, windowName: out.ticket.window.name, recall: true,
  });
  return { ...ticketDto(out.ticket), canMarkNoShow: out.ticket.recallCount >= out.branch.maxRecalls };
}

/** NO-SHOW: customer never came. Only allowed after the configured number of recalls. */
export async function markNoShow(user) {
  const out = await sequelize.transaction(async (t) => {
    const session = await openSessionFor(user, t);
    const branch = await lockBranch(session.window.branchId, t);
    const ticket = await currentTicketFor(session, t);
    if (ticket.recallCount < branch.maxRecalls) {
      throw ApiError.conflict(`Recall the number at least ${branch.maxRecalls} times first`, 'RECALL_FIRST');
    }
    await ticket.update({ status: 'no_show', finishedAt: new Date() }, { transaction: t });
    await logEvent({ branchId: branch.id, ticketId: ticket.id, userId: user.id, windowId: session.windowId, event: 'no_show' }, t);
    return { branchId: branch.id, ticket };
  });
  await broadcastQueue(out.branchId);
  return ticketDto(out.ticket);
}

/** Supervisor/admin: send a stuck serving ticket back to the front of the line. */
export async function releaseTicketById(actor, ticketId) {
  const branchId = actor.branchId;
  await sequelize.transaction(async (t) => {
    const branch = await lockBranch(branchId, t);
    const ticket = await Ticket.findOne({ where: { id: ticketId, branchId, status: 'serving' }, transaction: t });
    if (!ticket) throw ApiError.notFound('No serving ticket with that id', 'NOT_SERVING');
    await releaseServingTicket(ticket, branch, t, { userId: actor.id, reason: 'manual' });
  });
  await broadcastQueue(branchId);
}

/** Everything the TV needs: what each window is serving + the last few called numbers. Never the waiting list. */
export async function getDisplayState(branchId) {
  const branch = await Branch.findByPk(branchId);
  const include = [{ model: Window, as: 'window' }];
  const [serving, recent] = await Promise.all([
    Ticket.findAll({ where: { branchId, status: 'serving' }, include }),
    Ticket.findAll({
      where: { branchId, serviceDate: dateInTz(branch.timezone), calledAt: { [Op.ne]: null } },
      include, order: [['calledAt', 'DESC']], limit: 5,
    }),
  ]);
  return {
    serving: serving.map((t) => ({ ticketNumber: t.number, windowName: t.window.name })),
    recent: recent.map((t) => ({ ticketNumber: t.number, windowName: t.window.name, calledAt: t.calledAt })),
  };
}

/** Counts for employee/admin screens (staff only, never public). */
export async function getQueueSummary(branchId) {
  const waiting = await Ticket.findAll({ where: { branchId, status: 'waiting' }, attributes: ['category'] });
  const sessions = await WindowSession.findAll({
    where: { endedAt: null },
    include: [{ model: Window, as: 'window', where: { branchId } }, { model: User, as: 'user', attributes: ['id', 'fullName'] }],
  });
  const serving = await Ticket.findAll({ where: { branchId, status: 'serving' }, attributes: ['windowId', 'number'] });
  const byWindow = Object.fromEntries(serving.map((t) => [t.windowId, t.number]));
  return {
    waitingCount: waiting.length,
    waitingRegular: waiting.filter((t) => t.category === 'R').length,
    waitingPriority: waiting.filter((t) => t.category === 'S').length,
    windows: sessions.map((s) => ({
      windowId: s.windowId, name: s.window.name, employee: s.user.fullName,
      state: s.onBreak ? 'break' : 'open', current: byWindow[s.windowId] || null,
    })),
  };
}

export async function broadcastQueue(branchId) {
  emitToBranch(branchId, 'queue:updated', await getQueueSummary(branchId));
}

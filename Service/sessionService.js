import { Op } from 'sequelize';
import { sequelize, Window, WindowSession, Ticket, User } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { emitToBranch } from '../Utils/socket.js';
import { env } from '../Config/env.js';
import { ticketDto } from '../Utils/serialize.js';
import { broadcastQueue, lockBranch, releaseServingTicket } from './queueService.js';

const stateOf = (s) => (!s ? 'closed' : s.onBreak ? 'break' : 'open');

/** Windows the employee can pick from, with who (if anyone) already has each one open. */
export async function listWindows(branchId) {
  const windows = await Window.findAll({ where: { branchId, isEnabled: true }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
  const sessions = await WindowSession.findAll({
    where: { endedAt: null, windowId: windows.map((w) => w.id) },
    include: [{ model: User, as: 'user', attributes: ['id', 'fullName'] }],
  });
  const bySession = new Map(sessions.map((s) => [s.windowId, s]));
  return windows.map((w) => {
    const s = bySession.get(w.id);
    return { id: w.id, name: w.name, state: stateOf(s), occupiedBy: s ? s.user.fullName : null, occupiedByUserId: s?.userId || null };
  });
}

/** Log in to a window. This is what makes it "active" for the shared queue. */
export async function openSession(user, windowId) {
  // An employee the admin assigned to a window ALWAYS works at that window. Only "no default window" accounts may choose.
  if (user.defaultWindowId && windowId && windowId !== user.defaultWindowId) {
    throw ApiError.forbidden('Your account is assigned to a specific window', 'WINDOW_LOCKED');
  }
  const targetId = user.defaultWindowId || windowId;
  if (!targetId) throw ApiError.badRequest('Choose a window', 'WINDOW_REQUIRED');

  const window = await Window.findOne({ where: { id: targetId, branchId: user.branchId, isEnabled: true } });
  if (!window) throw ApiError.notFound('Window not found or disabled', 'WINDOW_NOT_FOUND');

  const existing = await WindowSession.findOne({ where: { userId: user.id, endedAt: null } });
  if (existing) {
    if (existing.windowId === window.id) return getMySession(user);
    throw ApiError.conflict('You already have another window open. Close it first.', 'SESSION_EXISTS');
  }

  try {
    await WindowSession.create({ windowId: window.id, userId: user.id });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') throw ApiError.conflict('That window is already in use', 'WINDOW_IN_USE');
    throw e;
  }
  emitToBranch(user.branchId, 'window:updated', { windowId: window.id, name: window.name, state: 'open', current: null });
  await broadcastQueue(user.branchId);
  return getMySession(user);
}

/** Close the window. Blocked while a customer is being served. */
export async function closeSession(user) {
  const session = await WindowSession.findOne({ where: { userId: user.id, endedAt: null }, include: [{ model: Window, as: 'window' }] });
  if (!session) return null;
  const serving = await Ticket.findOne({ where: { windowId: session.windowId, status: 'serving' } });
  if (serving) throw ApiError.conflict('Finish the current transaction before closing your window', 'FINISH_SERVING');
  await session.update({ endedAt: new Date() });
  emitToBranch(user.branchId, 'window:updated', { windowId: session.windowId, name: session.window.name, state: 'closed', current: null });
  await broadcastQueue(user.branchId);
  return null;
}

export async function setBreak(user, onBreak) {
  const session = await WindowSession.findOne({ where: { userId: user.id, endedAt: null }, include: [{ model: Window, as: 'window' }] });
  if (!session) throw ApiError.badRequest('Open a window first', 'NO_SESSION');
  if (onBreak) {
    const serving = await Ticket.findOne({ where: { windowId: session.windowId, status: 'serving' } });
    if (serving) throw ApiError.conflict('Finish the current transaction before going on break', 'FINISH_SERVING');
  }
  await session.update({ onBreak });
  emitToBranch(user.branchId, 'window:updated', { windowId: session.windowId, name: session.window.name, state: stateOf(session), current: null });
  await broadcastQueue(user.branchId);
  return getMySession(user);
}

export async function heartbeat(user) {
  const [n] = await WindowSession.update({ lastSeenAt: new Date() }, { where: { userId: user.id, endedAt: null } });
  if (!n) throw ApiError.badRequest('No open window', 'NO_SESSION');
}

/** Employee dashboard state: their window, whether on break, and who they're serving right now. */
export async function getMySession(user) {
  const session = await WindowSession.findOne({ where: { userId: user.id, endedAt: null }, include: [{ model: Window, as: 'window' }] });
  if (!session) return null;
  const current = await Ticket.findOne({ where: { windowId: session.windowId, status: 'serving' }, include: [{ model: Window, as: 'window' }] });
  return {
    window: { id: session.window.id, name: session.window.name },
    onBreak: session.onBreak,
    startedAt: session.startedAt,
    current: ticketDto(current),
    canNext: !session.onBreak && !current,
    canDone: !!current,
  };
}

/**
 * Close sessions whose employee stopped sending heartbeats (browser closed, PC crashed).
 * A ticket they were serving goes back to the FRONT of the line.
 */
export async function sweepStaleSessions(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.sessionStaleSeconds * 1000);
  const stale = await WindowSession.findAll({
    where: { endedAt: null, lastSeenAt: { [Op.lt]: cutoff } },
    include: [{ model: Window, as: 'window' }],
  });
  for (const session of stale) {
    const branchId = session.window.branchId;
    await sequelize.transaction(async (t) => {
      const branch = await lockBranch(branchId, t);
      const serving = await Ticket.findOne({ where: { windowId: session.windowId, status: 'serving' }, transaction: t });
      if (serving) await releaseServingTicket(serving, branch, t, { userId: session.userId, reason: 'session_timeout' });
      await session.update({ endedAt: now }, { transaction: t });
    });
    emitToBranch(branchId, 'window:updated', { windowId: session.windowId, name: session.window.name, state: 'closed', current: null });
    await broadcastQueue(branchId);
  }
  return stale.length;
}

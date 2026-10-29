import { Branch, Device, DepositAccount, Ticket, TicketEvent, User, Window, WindowSession } from '../Models/index.js';
import { createBranchWithDefaults } from './branchService.js';
import { receiptForTicket } from './paymentService.js';
import { dateInTz } from '../Utils/time.js';
import { ApiError } from '../Utils/ApiError.js';
import { generateDeviceToken, hashToken } from '../Utils/token.js';
import { hashPassword } from './authService.js';
import { emitToBranch, emitToRoom } from '../Utils/socket.js';

const uniqueToConflict = (e, message, code) => {
  if (e.name === 'SequelizeUniqueConstraintError') throw ApiError.conflict(message, code);
  throw e;
};

// ---------- Users (employees) ----------
export const listUsers = (branchId) => User.findAll({ where: { branchId }, order: [['fullName', 'ASC']] });

export async function createUser(branchId, { username, fullName, password, role, defaultWindowId }) {
  if (defaultWindowId) await assertWindow(branchId, defaultWindowId);
  try {
    return await User.create({
      branchId, username: username.trim().toLowerCase(), fullName, role,
      defaultWindowId: defaultWindowId ?? null, passwordHash: await hashPassword(password),
    });
  } catch (e) { return uniqueToConflict(e, 'That username is taken', 'USERNAME_TAKEN'); }
}

export async function updateUser(branchId, actor, id, patch) {
  const user = await User.findOne({ where: { id, branchId } });
  if (!user) throw ApiError.notFound('User not found');
  if (id === actor.id && (patch.isActive === false || (patch.role && patch.role !== 'admin'))) {
    throw ApiError.badRequest('You cannot deactivate or demote your own account', 'SELF_LOCKOUT');
  }
  if (patch.defaultWindowId) await assertWindow(branchId, patch.defaultWindowId);
  const { password, ...rest } = patch;
  const changes = { ...rest };
  if (password) changes.passwordHash = await hashPassword(password);
  await user.update(changes);
  if (patch.isActive === false) await WindowSession.update({ endedAt: new Date() }, { where: { userId: id, endedAt: null } });
  return user;
}

/** "Remove" = deactivate: keeps the audit trail intact for tickets they served. */
export const removeUser = (branchId, actor, id) => updateUser(branchId, actor, id, { isActive: false });

// ---------- Windows ----------
async function assertWindow(branchId, id) {
  if (!(await Window.findOne({ where: { id, branchId } }))) throw ApiError.badRequest('Unknown window', 'WINDOW_NOT_FOUND');
}

export const listAllWindows = (branchId) => Window.findAll({ where: { branchId }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });

export async function createWindow(branchId, { name, sortOrder }) {
  try {
    const count = await Window.count({ where: { branchId } });
    return await Window.create({ branchId, name, sortOrder: sortOrder ?? count + 1 });
  } catch (e) { return uniqueToConflict(e, 'A window with that name already exists', 'WINDOW_EXISTS'); }
}

export async function updateWindow(branchId, id, patch) {
  const window = await Window.findOne({ where: { id, branchId } });
  if (!window) throw ApiError.notFound('Window not found');
  if (patch.isEnabled === false) await assertNoOpenSession(id);
  try { return await window.update(patch); } catch (e) { return uniqueToConflict(e, 'A window with that name already exists', 'WINDOW_EXISTS'); }
}

/** Windows with history are disabled instead of deleted so old tickets keep their window name. */
export async function removeWindow(branchId, id) {
  const window = await Window.findOne({ where: { id, branchId } });
  if (!window) throw ApiError.notFound('Window not found');
  await assertNoOpenSession(id);
  const used = await Ticket.count({ where: { windowId: id } });
  if (used > 0) { await window.update({ isEnabled: false }); return { removed: false, disabled: true }; }
  await User.update({ defaultWindowId: null }, { where: { defaultWindowId: id } });
  await window.destroy();
  return { removed: true, disabled: false };
}

async function assertNoOpenSession(windowId) {
  if (await WindowSession.findOne({ where: { windowId, endedAt: null } })) {
    throw ApiError.conflict('That window is currently open. Ask the employee to close it first.', 'WINDOW_IN_USE');
  }
}

// ---------- Devices (kiosk / TV display) ----------
export const listDevices = (branchId) =>
  Device.findAll({ where: { branchId, isActive: true }, attributes: { exclude: ['tokenHash'] }, order: [['name', 'ASC']] });   // revoked devices are hidden (their token stays dead)

/** The token is returned ONCE. Only its hash is stored. */
export async function createDevice(branchId, { kind, name }) {
  const token = generateDeviceToken();
  const device = await Device.create({ branchId, kind, name, tokenHash: hashToken(token) });
  return { id: device.id, kind, name, token };
}

/** New token for an existing device. The old token stops working immediately. Shown ONCE. */
export async function rotateDevice(branchId, id) {
  const device = await Device.findOne({ where: { id, branchId, isActive: true } });
  if (!device) throw ApiError.notFound('Device not found');
  const token = generateDeviceToken();
  await device.update({ tokenHash: hashToken(token) });
  return { id: device.id, kind: device.kind, name: device.name, token };
}

export async function revokeDevice(branchId, id) {
  const device = await Device.findOne({ where: { id, branchId } });
  if (!device) throw ApiError.notFound('Device not found');
  await device.update({ isActive: false });
}

// ---------- Settings ----------
export const getSettings = (branchId) => Branch.findByPk(branchId);

export async function updateSettings(branchId, patch) {
  const branch = await Branch.findByPk(branchId);
  await branch.update(patch);
  emitToBranch(branchId, 'settings:updated', { idleTimeoutSeconds: branch.idleTimeoutSeconds });
  return branch;
}

// ---------- Branches ----------
export const listBranches = (user) =>
  Branch.findAll({ where: user.isSuper ? {} : { id: user.branchId }, attributes: ['id', 'name', 'timezone'], order: [['name', 'ASC']] });

export async function createBranch({ name, timezone }) {
  if (await Branch.findOne({ where: { name } })) throw ApiError.conflict('A branch with that name already exists', 'BRANCH_EXISTS');
  return createBranchWithDefaults({ name, timezone });
}

// ---------- Deposit accounts (kiosk choices) ----------
export const listDepositAccounts = (branchId) =>
  DepositAccount.findAll({ where: { branchId }, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });

export async function createDepositAccount(branchId, { name, sortOrder }) {
  try {
    const count = await DepositAccount.count({ where: { branchId } });
    return await DepositAccount.create({ branchId, name, sortOrder: sortOrder ?? count + 1 });
  } catch (e) { return uniqueToConflict(e, 'That account already exists', 'ACCOUNT_EXISTS'); }
}

export async function updateDepositAccount(branchId, id, patch) {
  const a = await DepositAccount.findOne({ where: { id, branchId } });
  if (!a) throw ApiError.notFound('Account not found');
  try { return await a.update(patch); } catch (e) { return uniqueToConflict(e, 'That account already exists', 'ACCOUNT_EXISTS'); }
}

/** Old deposit records keep the account name they were made with, so deleting is safe. */
export async function removeDepositAccount(branchId, id) {
  const a = await DepositAccount.findOne({ where: { id, branchId } });
  if (!a) throw ApiError.notFound('Account not found');
  await a.destroy();
}

// ---------- Tickets / reprint ----------
export async function listTodayTickets(branchId) {
  const branch = await Branch.findByPk(branchId);
  return Ticket.findAll({ where: { branchId, serviceDate: dateInTz(branch.timezone) }, order: [['createdAt', 'DESC']], limit: 200 });
}

/**
 * Ask a kiosk to print a ticket again (paper ran out, jam, ...).
 * The browser cannot know if a printer failed, so staff choose the ticket to reprint.
 */
export async function reprintTicket(actor, branchId, ticketId, deviceId) {
  const ticket = await Ticket.findOne({ where: { id: ticketId, branchId } });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  const branch = await Branch.findByPk(branchId);
  const kiosks = await Device.findAll({ where: { branchId, kind: 'kiosk', isActive: true, ...(deviceId ? { id: deviceId } : {}) } });
  if (!kiosks.length) throw ApiError.notFound('No kiosk device found. Create one in Devices.', 'NO_KIOSK');

  const receipt = await receiptForTicket(ticket.id);
  const payload = { receipt, id: ticket.id, number: ticket.number, txn: ticket.txn, createdAt: ticket.createdAt, branchName: branch.name, reprint: true };
  for (const k of kiosks) {
    if (await emitToRoom(`device:${k.id}`, 'print:ticket', payload)) {
      await TicketEvent.create({ branchId, ticketId, userId: actor.id, event: 'reprint', detail: { device: k.name } });
      return { sent: true, device: k.name };
    }
  }
  throw ApiError.conflict('The kiosk is offline or its page is closed. Open /kiosk on the kiosk computer and try again.', 'KIOSK_OFFLINE');
}

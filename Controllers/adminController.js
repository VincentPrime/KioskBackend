import { asyncHandler } from '../Utils/asyncHandler.js';
import { userDto } from '../Utils/serialize.js';
import * as admin from '../Service/adminService.js';
import { ticketDto } from '../Utils/serialize.js';

const branchOf = (req) => req.branchId;   // set by the resolveBranch middleware

// Users
export const listUsers = asyncHandler(async (req, res) => res.json({ users: (await admin.listUsers(branchOf(req))).map(userDto) }));
export const createUser = asyncHandler(async (req, res) => res.status(201).json({ user: userDto(await admin.createUser(branchOf(req), req.body)) }));
export const updateUser = asyncHandler(async (req, res) => res.json({ user: userDto(await admin.updateUser(branchOf(req), req.user, req.params.id, req.body)) }));
export const removeUser = asyncHandler(async (req, res) => { await admin.removeUser(branchOf(req), req.user, req.params.id); res.json({ ok: true }); });

// Windows
export const listWindows = asyncHandler(async (req, res) => res.json({ windows: await admin.listAllWindows(branchOf(req)) }));
export const createWindow = asyncHandler(async (req, res) => res.status(201).json({ window: await admin.createWindow(branchOf(req), req.body) }));
export const updateWindow = asyncHandler(async (req, res) => res.json({ window: await admin.updateWindow(branchOf(req), req.params.id, req.body) }));
export const removeWindow = asyncHandler(async (req, res) => res.json(await admin.removeWindow(branchOf(req), req.params.id)));

// Devices
export const listDevices = asyncHandler(async (req, res) => res.json({ devices: await admin.listDevices(branchOf(req)) }));
export const createDevice = asyncHandler(async (req, res) => res.status(201).json({ device: await admin.createDevice(branchOf(req), req.body) }));
export const revokeDevice = asyncHandler(async (req, res) => { await admin.revokeDevice(branchOf(req), req.params.id); res.json({ ok: true }); });

// Settings
export const getSettings = asyncHandler(async (req, res) => res.json({ settings: await admin.getSettings(branchOf(req)) }));
export const updateSettings = asyncHandler(async (req, res) => res.json({ settings: await admin.updateSettings(branchOf(req), req.body) }));

// Branches
export const listBranches = asyncHandler(async (req, res) => res.json({ branches: await admin.listBranches(req.user), currentBranchId: req.branchId }));
export const createBranch = asyncHandler(async (req, res) => res.status(201).json({ branch: await admin.createBranch(req.body) }));

// Deposit accounts
export const listAccounts = asyncHandler(async (req, res) => res.json({ accounts: await admin.listDepositAccounts(branchOf(req)) }));
export const createAccount = asyncHandler(async (req, res) => res.status(201).json({ account: await admin.createDepositAccount(branchOf(req), req.body) }));
export const updateAccount = asyncHandler(async (req, res) => res.json({ account: await admin.updateDepositAccount(branchOf(req), req.params.id, req.body) }));
export const removeAccount = asyncHandler(async (req, res) => { await admin.removeDepositAccount(branchOf(req), req.params.id); res.json({ ok: true }); });

// Tickets / reprint
export const todayTickets = asyncHandler(async (req, res) => res.json({ tickets: (await admin.listTodayTickets(branchOf(req))).map(ticketDto) }));
export const reprint = asyncHandler(async (req, res) => res.json(await admin.reprintTicket(req.user, branchOf(req), req.params.id, req.body.deviceId)));

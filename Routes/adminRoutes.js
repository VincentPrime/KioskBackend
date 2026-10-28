import { Router } from 'express';
import * as c from '../Controllers/adminController.js';
import { requireAuth, requireRole, requireSuper } from '../Middleware/auth.js';
import { resolveBranch } from '../Middleware/branch.js';
import { validate } from '../Middleware/validate.js';
import * as s from '../Utils/schemas.js';

const r = Router();
r.use(requireAuth, requireRole('admin'), resolveBranch);

r.get('/branches', c.listBranches);
r.post('/branches', requireSuper, validate(s.createBranchSchema), c.createBranch);

r.get('/users', c.listUsers);
r.post('/users', validate(s.createUserSchema), c.createUser);
r.patch('/users/:id', validate(s.updateUserSchema), c.updateUser);
r.delete('/users/:id', c.removeUser);

r.get('/windows', c.listWindows);
r.post('/windows', validate(s.createWindowSchema), c.createWindow);
r.patch('/windows/:id', validate(s.updateWindowSchema), c.updateWindow);
r.delete('/windows/:id', c.removeWindow);

r.get('/deposit-accounts', c.listAccounts);
r.post('/deposit-accounts', validate(s.createDepositAccountSchema), c.createAccount);
r.patch('/deposit-accounts/:id', validate(s.updateDepositAccountSchema), c.updateAccount);
r.delete('/deposit-accounts/:id', c.removeAccount);

r.get('/devices', c.listDevices);
r.post('/devices', validate(s.createDeviceSchema), c.createDevice);
r.delete('/devices/:id', c.revokeDevice);

r.get('/tickets', c.todayTickets);
r.post('/tickets/:id/reprint', validate(s.reprintSchema), c.reprint);

r.get('/settings', c.getSettings);
r.patch('/settings', validate(s.updateSettingsSchema), c.updateSettings);
export default r;

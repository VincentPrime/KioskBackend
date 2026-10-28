import { Router } from 'express';
import * as c from '../Controllers/paymentController.js';
import { requireAuth, requireRole } from '../Middleware/auth.js';
import { resolveBranch } from '../Middleware/branch.js';
import { validate } from '../Middleware/validate.js';
import { paymentsQuerySchema, verifyPaymentSchema } from '../Utils/schemas.js';

const r = Router();
r.use(requireAuth, requireRole('supervisor', 'admin'), resolveBranch);
r.get('/', validate(paymentsQuerySchema, 'query'), c.list);
r.post('/:id/verify', validate(verifyPaymentSchema), c.verify);
r.post('/:id/simulate-paid', requireRole('admin'), c.simulate);   // testing only, off unless ALLOW_PAYMENT_SIMULATION=true
export default r;

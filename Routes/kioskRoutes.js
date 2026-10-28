import { Router } from 'express';
import * as c from '../Controllers/kioskController.js';
import { requireDevice } from '../Middleware/device.js';
import { kioskLimiter } from '../Middleware/rateLimit.js';
import { validate } from '../Middleware/validate.js';
import { kioskPaymentSchema, kioskTicketSchema } from '../Utils/schemas.js';

const r = Router();
r.use(kioskLimiter, requireDevice('kiosk'));
r.get('/config', c.config);
r.post('/tickets', validate(kioskTicketSchema), c.createTicket);
r.post('/tickets/:id/printed', c.printed);
r.post('/payments', validate(kioskPaymentSchema), c.createPayment);   // phase 2
r.get('/payments/:id', c.getPayment);                                  // phase 2
export default r;

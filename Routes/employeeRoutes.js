import { Router } from 'express';
import * as c from '../Controllers/employeeController.js';
import { requireAuth, requireRole } from '../Middleware/auth.js';
import { validate } from '../Middleware/validate.js';
import { breakSchema, openWindowSchema } from '../Utils/schemas.js';

const r = Router();
r.use(requireAuth, requireRole('employee', 'admin'));

r.get('/windows', c.windows);
r.get('/session', c.me);
r.post('/session', validate(openWindowSchema), c.openWindow);   // open (log in to) a window
r.delete('/session', c.closeWindow);                              // close the window
r.post('/break', validate(breakSchema), c.setBreak);
r.post('/heartbeat', c.heartbeat);

r.post('/next', c.next);
r.post('/done', c.done);
r.post('/recall', c.recall);
r.post('/no-show', c.noShow);

r.get('/queue', c.summary);
r.post('/tickets/:id/release', requireRole('admin'), c.release);
export default r;

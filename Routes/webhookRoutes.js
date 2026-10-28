import { Router } from 'express';
import * as c from '../Controllers/webhookController.js';

const r = Router();
r.post('/paymongo', c.paymongo);
r.post('/payment', c.paymongo);   // alias
export default r;

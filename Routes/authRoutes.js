import { Router } from 'express';
import * as c from '../Controllers/authController.js';
import { requireAuth } from '../Middleware/auth.js';
import { loginLimiter } from '../Middleware/rateLimit.js';
import { validate } from '../Middleware/validate.js';
import { loginSchema } from '../Utils/schemas.js';

const r = Router();
r.post('/login', loginLimiter, validate(loginSchema), c.login);
r.post('/logout', requireAuth, c.logout);
r.get('/me', requireAuth, c.me);
export default r;

import { Router } from 'express';
import auth from './authRoutes.js';
import kiosk from './kioskRoutes.js';
import display from './displayRoutes.js';
import employee from './employeeRoutes.js';
import admin from './adminRoutes.js';
import webhooks from './webhookRoutes.js';
import payments from './paymentRoutes.js';

const r = Router();
r.get('/health', (_req, res) => res.json({ ok: true }));
r.use('/auth', auth);
r.use('/kiosk', kiosk);
r.use('/display', display);
r.use('/employee', employee);
r.use('/admin', admin);
r.use('/payments', payments);
r.use('/webhooks', webhooks);
export default r;

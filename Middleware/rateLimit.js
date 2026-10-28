import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message) => rateLimit({
  windowMs, limit, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message } },
});

export const apiLimiter = make(60_000, 300, 'Too many requests, slow down');
export const loginLimiter = make(15 * 60_000, 10, 'Too many login attempts, try again later');
export const kioskLimiter = make(60_000, 120, 'Too many requests');

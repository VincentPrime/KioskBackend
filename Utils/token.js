import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../Config/env.js';

// Staff login is a JWT sent in the "Authorization: Bearer <token>" header. No cookies are used anywhere.
export const signJwt = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn, algorithm: 'HS256' });

export const verifyJwt = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });

// Device tokens (kiosk / display): random, shown once, only the SHA-256 hash is stored
export const generateDeviceToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

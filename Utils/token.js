import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../Config/env.js';

export const COOKIE_NAME = 'qms_token';

export const signJwt = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyJwt = (token) => jwt.verify(token, env.jwtSecret);

// Device tokens (kiosk / display): random, shown once, only the SHA-256 hash is stored
export const generateDeviceToken = () => crypto.randomBytes(32).toString('hex');
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

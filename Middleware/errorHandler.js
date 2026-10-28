import { ZodError } from 'zod';
import { ApiError } from '../Utils/ApiError.js';
import { env } from '../Config/env.js';

export const notFound = (_req, _res, next) => next(ApiError.notFound('Route not found', 'ROUTE_NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'That record already exists' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: env.isProd ? 'Something went wrong' : err.message } });
};

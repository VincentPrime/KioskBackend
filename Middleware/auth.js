import { User } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { asyncHandler } from '../Utils/asyncHandler.js';
import { verifyJwt } from '../Utils/token.js';

/** Employee/admin/supervisor auth: JWT from the "Authorization: Bearer <token>" header. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw ApiError.unauthorized();

  let payload;
  try { payload = verifyJwt(token); } catch { throw ApiError.unauthorized('Session expired, please log in again', 'SESSION_EXPIRED'); }

  const user = await User.findByPk(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized();
  req.user = user;
  next();
});

export const requireSuper = (req, _res, next) =>
  req.user?.isSuper ? next() : next(ApiError.forbidden('Only a super admin can do this'));

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(ApiError.forbidden('You do not have access to this'));

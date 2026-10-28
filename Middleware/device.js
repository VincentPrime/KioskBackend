import { Device } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { asyncHandler } from '../Utils/asyncHandler.js';
import { hashToken } from '../Utils/token.js';

/** Kiosk / TV display auth via the `x-device-token` header. */
export const requireDevice = (...kinds) => asyncHandler(async (req, _res, next) => {
  const token = req.headers['x-device-token'];
  if (!token) throw ApiError.unauthorized('Device token required', 'DEVICE_TOKEN_REQUIRED');
  const device = await Device.findOne({ where: { tokenHash: hashToken(String(token)), isActive: true } });
  if (!device || (kinds.length && !kinds.includes(device.kind))) throw ApiError.unauthorized('Invalid device token', 'BAD_DEVICE_TOKEN');
  req.device = device;
  next();
});

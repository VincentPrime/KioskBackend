import { Server } from 'socket.io';
import { env } from '../Config/env.js';
import { Device, User } from '../Models/index.js';
import { hashToken, verifyJwt } from './token.js';

let io = null;

/**
 * Server -> client push only. Screens authenticate with a device token (kiosk/display)
 * or the employee's JWT, then join the room for their branch.
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.clientOrigins }, transports: ['websocket', 'polling'] });

  io.use(async (socket, next) => {
    try {
      const { deviceToken, token } = socket.handshake.auth || {};
      if (deviceToken) {
        const device = await Device.findOne({ where: { tokenHash: hashToken(deviceToken), isActive: true } });
        if (!device) throw new Error('bad device');
        socket.data.branchId = device.branchId;
        socket.data.deviceId = device.id;
      } else {
        const payload = verifyJwt(token);
        const user = await User.findByPk(payload.sub);
        if (!user || !user.isActive) throw new Error('bad user');
        socket.data.branchId = user.branchId;
        socket.data.staff = true;
      }
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`branch:${socket.data.branchId}`);
    if (socket.data.staff) socket.join(`staff:${socket.data.branchId}`);   // payment updates go to staff only
    if (socket.data.deviceId) socket.join(`device:${socket.data.deviceId}`);   // lets the admin target one kiosk (reprint)
  });
  return io;
}

/** Emit to a room and report how many screens received it (0 = nobody is connected). */
export async function emitToRoom(room, event, payload) {
  if (!io) return 0;
  const sockets = await io.in(room).fetchSockets();
  if (sockets.length) io.to(room).emit(event, payload);
  return sockets.length;
}

// No-op when sockets aren't initialised (e.g. in tests)
export const emitToBranch = (branchId, event, payload) => io?.to(`branch:${branchId}`).emit(event, payload);

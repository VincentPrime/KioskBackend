import http from 'http';
import { env } from './Config/env.js';
import app from './app.js';
import { sequelize } from './Models/index.js';
import { initSocket } from './Utils/socket.js';
import { sweepStaleSessions } from './Service/sessionService.js';
import { reconcilePending } from './Service/paymentService.js';

await sequelize.authenticate();

const server = http.createServer(app);
initSocket(server);

// Close windows whose employee vanished and put their customer back at the front of the line
const sweeper = setInterval(
  () => {
    sweepStaleSessions().catch((e) => console.error('Session sweep failed:', e.message));
    reconcilePending().catch((e) => console.error('Payment check failed:', e.message));   // catches payments whose webhook never arrived
  },
  env.sweepIntervalSeconds * 1000,
);

server.listen(env.port, () => console.log(`QMS server listening on :${env.port} (${env.nodeEnv})`));

const shutdown = async () => {
  clearInterval(sweeper);
  server.close();
  await sequelize.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

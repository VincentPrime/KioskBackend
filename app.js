import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './Config/env.js';
import routes from './Routes/index.js';
import { apiLimiter } from './Middleware/rateLimit.js';
import { errorHandler, notFound } from './Middleware/errorHandler.js';

const app = express();
app.set('trust proxy', 1);                                  // behind Render/Railway/etc.
app.use(helmet());
app.use(cors({ origin: env.clientOrigins, credentials: true }));
// Keep the raw body for webhooks: PayMongo's signature is calculated over the exact bytes it sent
app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks')) req.rawBody = buf; } }));
app.use(cookieParser());
app.use('/api', apiLimiter, routes);
app.use(notFound);
app.use(errorHandler);

export default app;

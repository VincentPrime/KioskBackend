import 'dotenv/config';

const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  return process.env[key];
};

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  dbSsl: process.env.DB_SSL !== 'false',
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()),
  sessionStaleSeconds: Number(process.env.SESSION_STALE_SECONDS) || 60,
  sweepIntervalSeconds: Number(process.env.SWEEP_INTERVAL_SECONDS) || 15,
  paymongo: {
    secretKey: process.env.PAYMONGO_SECRET_KEY || '',
    publicKey: process.env.PAYMONGO_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || '',
    apiUrl: process.env.PAYMONGO_API_URL || 'https://api.paymongo.com/v1',
    mock: process.env.PAYMONGO_MOCK === 'true',          // fake QR for testing without a PayMongo account
  },
  allowPaymentSimulation: process.env.ALLOW_PAYMENT_SIMULATION === 'true',   // admin "simulate paid" button (testing only!)
};

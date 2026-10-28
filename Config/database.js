import { Sequelize } from 'sequelize';
import { env } from './env.js';

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: env.dbSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  define: { underscored: true, timestamps: false },
  pool: { max: 10, min: 0, idle: 10000 },
});

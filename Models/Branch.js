import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('Branch', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  name: { type: T.STRING, allowNull: false },
  timezone: { type: T.STRING, allowNull: false, defaultValue: 'Asia/Manila' },
  ticketCutoff: { type: T.TIME },                                   // stop issuing tickets after this time
  maxRecalls: { type: T.INTEGER, allowNull: false, defaultValue: 2 },
  idleTimeoutSeconds: { type: T.INTEGER, allowNull: false, defaultValue: 30 },
  gcashMin: { type: T.DECIMAL(12, 2), allowNull: false, defaultValue: 100 },
  gcashMax: { type: T.DECIMAL(12, 2), allowNull: false, defaultValue: 100000 },
  qrExpirySeconds: { type: T.INTEGER, allowNull: false, defaultValue: 300 },
}, { tableName: 'branches' });

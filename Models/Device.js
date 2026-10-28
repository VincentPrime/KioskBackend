import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('Device', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  kind: { type: T.ENUM('kiosk', 'display'), allowNull: false },
  name: { type: T.STRING(100), allowNull: false },
  tokenHash: { type: T.STRING, allowNull: false },
  isActive: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'devices' });

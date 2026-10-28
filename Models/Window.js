import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('Window', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  name: { type: T.STRING(50), allowNull: false },
  sortOrder: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
  isEnabled: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
}, { tableName: 'windows', indexes: [{ unique: true, fields: ['branch_id', 'name'] }] });

import { DataTypes as T } from 'sequelize';

// The account choices shown on the kiosk after "Deposit". Each branch manages its own list.
export default (sequelize) => sequelize.define('DepositAccount', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  name: { type: T.STRING(100), allowNull: false },
  sortOrder: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'deposit_accounts', indexes: [{ unique: true, fields: ['branch_id', 'name'] }] });

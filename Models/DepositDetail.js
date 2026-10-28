import { DataTypes as T } from 'sequelize';

// Kept for receipts/audit. Deliberately NOT shown to the teller.
export default (sequelize) => sequelize.define('DepositDetail', {
  ticketId: { type: T.UUID, primaryKey: true },
  accountType: { type: T.STRING(100), allowNull: false },      // name at the time of the deposit
  accountTypeId: { type: T.UUID },
  paymentMethod: { type: T.ENUM('cash', 'gcash'), allowNull: false },
  amount: { type: T.DECIMAL(12, 2) },
}, { tableName: 'deposit_details' });

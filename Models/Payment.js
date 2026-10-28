import { DataTypes as T } from 'sequelize';

// One row per GCash / QR Ph attempt. The ticket is only created once status becomes 'paid'.
export default (sequelize) => sequelize.define('Payment', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  deviceId: { type: T.UUID },                                       // the kiosk that started it
  category: { type: T.ENUM('R', 'S'), allowNull: false },
  accountType: { type: T.STRING(100), allowNull: false },           // deposit account NAME at that time
  accountTypeId: { type: T.UUID },
  amount: { type: T.DECIMAL(12, 2), allowNull: false },
  provider: { type: T.STRING, allowNull: false },                   // 'paymongo' | 'mock'
  providerRef: { type: T.STRING, unique: true },                    // PayMongo payment intent id (pi_...)
  providerPaymentId: { type: T.STRING },                            // PayMongo payment id (pay_...)
  status: { type: T.ENUM('pending', 'paid', 'expired', 'failed', 'refunded'), allowNull: false, defaultValue: 'pending' },
  serviceDate: { type: T.DATEONLY },
  createdAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
  expiresAt: { type: T.DATE, allowNull: false },
  paidAt: { type: T.DATE },
  lastCheckedAt: { type: T.DATE },
  ticketId: { type: T.UUID },
  receiptNo: { type: T.STRING(30) },                                // GC-20261024-0001
  needsReview: { type: T.BOOLEAN, allowNull: false, defaultValue: false },   // e.g. amount mismatch
  // Supervisor check at the window
  verifyStatus: { type: T.STRING(12), allowNull: false, defaultValue: 'unverified' },   // unverified | verified | problem
  verifiedAt: { type: T.DATE },
  verifiedBy: { type: T.UUID },
  verifyNote: { type: T.STRING(255) },
  rawWebhook: { type: T.JSONB },
}, {
  tableName: 'payments',
  indexes: [
    { unique: true, fields: ['branch_id', 'receipt_no'] },
    { fields: ['branch_id', 'service_date', 'status'] },
  ],
});

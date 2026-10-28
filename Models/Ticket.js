import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('Ticket', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  serviceDate: { type: T.DATEONLY, allowNull: false },
  category: { type: T.ENUM('R', 'S'), allowNull: false },          // Regular / Senior-PWD
  seq: { type: T.INTEGER, allowNull: false },                      // resets daily per category
  number: { type: T.STRING(16), allowNull: false },                // "R-12" / "S-13"
  txn: { type: T.ENUM('deposit', 'withdraw', 'loan'), allowNull: false },
  status: { type: T.ENUM('waiting', 'serving', 'done', 'no_show', 'cancelled'), allowNull: false, defaultValue: 'waiting' },
  // Ordering key while waiting (lowest is served first). Gaps are fine; only the order matters.
  queuePos: { type: T.INTEGER },
  windowId: { type: T.UUID },
  servedBy: { type: T.UUID },
  recallCount: { type: T.INTEGER, allowNull: false, defaultValue: 0 },
  downgradedFrom: { type: T.ENUM('R', 'S') },
  createdAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
  calledAt: { type: T.DATE },
  finishedAt: { type: T.DATE },
  printCount: { type: T.INTEGER, allowNull: false, defaultValue: 0 },   // times the kiosk sent it to the printer
  lastPrintedAt: { type: T.DATE },
}, {
  tableName: 'tickets',
  indexes: [
    { unique: true, fields: ['branch_id', 'service_date', 'category', 'seq'] },
    { name: 'waiting_line', fields: ['branch_id', 'queue_pos'], where: { status: 'waiting' } },
    { name: 'one_serving_per_window', unique: true, fields: ['window_id'], where: { status: 'serving' } },
  ],
});

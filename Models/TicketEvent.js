import { DataTypes as T } from 'sequelize';

// Audit log: created, called, recalled, done, no_show, released, cancelled, ...
export default (sequelize) => sequelize.define('TicketEvent', {
  id: { type: T.BIGINT, autoIncrement: true, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  ticketId: { type: T.UUID },
  userId: { type: T.UUID },
  windowId: { type: T.UUID },
  event: { type: T.STRING(30), allowNull: false },
  detail: { type: T.JSONB },
  at: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
}, { tableName: 'ticket_events', indexes: [{ fields: ['branch_id', 'at'] }] });

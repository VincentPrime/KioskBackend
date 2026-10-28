import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('Feedback', {
  ticketId: { type: T.UUID, primaryKey: true },
  rating: { type: T.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  at: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
}, { tableName: 'feedback' });

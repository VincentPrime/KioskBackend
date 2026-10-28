import { DataTypes as T } from 'sequelize';

// A window is "open" while a session exists with ended_at IS NULL
export default (sequelize) => sequelize.define('WindowSession', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  windowId: { type: T.UUID, allowNull: false },
  userId: { type: T.UUID, allowNull: false },
  startedAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW },
  endedAt: { type: T.DATE },
  onBreak: { type: T.BOOLEAN, allowNull: false, defaultValue: false },
  lastSeenAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW },   // heartbeat
}, {
  tableName: 'window_sessions',
  indexes: [
    { name: 'one_open_session_per_window', unique: true, fields: ['window_id'], where: { ended_at: null } },
    { name: 'one_open_session_per_user', unique: true, fields: ['user_id'], where: { ended_at: null } },
  ],
});

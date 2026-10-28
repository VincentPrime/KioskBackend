import { DataTypes as T } from 'sequelize';

export default (sequelize) => sequelize.define('User', {
  id: { type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true },
  branchId: { type: T.UUID, allowNull: false },
  username: { type: T.STRING(50), allowNull: false, unique: true },
  fullName: { type: T.STRING(100), allowNull: false },
  passwordHash: { type: T.STRING, allowNull: false },
  role: { type: T.ENUM('admin', 'supervisor', 'employee'), allowNull: false, defaultValue: 'employee' },
  defaultWindowId: { type: T.UUID },
  isActive: { type: T.BOOLEAN, allowNull: false, defaultValue: true },
  isSuper: { type: T.BOOLEAN, allowNull: false, defaultValue: false },   // super admin: can create and switch between branches
}, {
  tableName: 'users',
  defaultScope: { attributes: { exclude: ['passwordHash'] } },   // never leak the hash by accident
  scopes: { withPassword: { attributes: { include: ['passwordHash'] } } },
});

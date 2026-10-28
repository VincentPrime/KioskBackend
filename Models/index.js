import { sequelize } from '../Config/database.js';
import defineBranch from './Branch.js';
import defineWindow from './Window.js';
import defineUser from './User.js';
import defineWindowSession from './WindowSession.js';
import defineTicket from './Ticket.js';
import defineDepositDetail from './DepositDetail.js';
import definePayment from './Payment.js';
import defineDevice from './Device.js';
import defineTicketEvent from './TicketEvent.js';
import defineFeedback from './Feedback.js';
import defineDepositAccount from './DepositAccount.js';

export const Branch = defineBranch(sequelize);
export const Window = defineWindow(sequelize);
export const User = defineUser(sequelize);
export const WindowSession = defineWindowSession(sequelize);
export const Ticket = defineTicket(sequelize);
export const DepositDetail = defineDepositDetail(sequelize);
export const Payment = definePayment(sequelize);
export const Device = defineDevice(sequelize);
export const TicketEvent = defineTicketEvent(sequelize);
export const Feedback = defineFeedback(sequelize);
export const DepositAccount = defineDepositAccount(sequelize);

// Associations
Branch.hasMany(DepositAccount, { foreignKey: 'branchId' });
Branch.hasMany(Window, { foreignKey: 'branchId' });
Window.belongsTo(Branch, { foreignKey: 'branchId' });

Branch.hasMany(User, { foreignKey: 'branchId' });
User.belongsTo(Branch, { foreignKey: 'branchId' });
User.belongsTo(Window, { as: 'defaultWindow', foreignKey: 'defaultWindowId' });

WindowSession.belongsTo(Window, { as: 'window', foreignKey: 'windowId' });
WindowSession.belongsTo(User, { as: 'user', foreignKey: 'userId' });
Window.hasMany(WindowSession, { foreignKey: 'windowId' });

Ticket.belongsTo(Window, { as: 'window', foreignKey: 'windowId' });
Ticket.belongsTo(User, { as: 'server', foreignKey: 'servedBy' });
Ticket.belongsTo(Branch, { foreignKey: 'branchId' });
Ticket.hasOne(DepositDetail, { as: 'deposit', foreignKey: 'ticketId' });
Ticket.hasOne(Feedback, { foreignKey: 'ticketId' });

Payment.belongsTo(Ticket, { foreignKey: 'ticketId' });
Payment.belongsTo(User, { as: 'verifier', foreignKey: 'verifiedBy' });
Device.belongsTo(Branch, { foreignKey: 'branchId' });

TicketEvent.belongsTo(Ticket, { foreignKey: 'ticketId' });

export { sequelize };

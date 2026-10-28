// Creates/updates tables from the Sequelize models. Use `npm run db:sync`.
// (For production changes later, switch to proper migrations.)
import { sequelize } from '../Models/index.js';

const force = process.argv.includes('--force');
if (force && !process.argv.includes('--yes')) { console.error('--force deletes ALL data. Add --yes to confirm.'); process.exit(1); }
await sequelize.sync({ alter: process.argv.includes('--alter'), force });
console.log('Database synced.');
await sequelize.close();

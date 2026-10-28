// First-time setup AND upgrade helper. Safe to run more than once.
// - creates the first branch (Window 1/2 + default deposit accounts) if none exists
// - makes sure the seed admin exists and is a SUPER admin (can create branches)
// - fills in default deposit accounts for branches that have none (after upgrading)
// - creates a kiosk + display device (token printed ONCE) if the first branch has none
import { sequelize, Branch, User, Device } from '../Models/index.js';
import { hashPassword } from '../Service/authService.js';
import { createBranchWithDefaults, ensureDefaultAccounts } from '../Service/branchService.js';
import { generateDeviceToken, hashToken } from './token.js';

const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

let branch = await Branch.findOne({ order: [['name', 'ASC']] });
if (!branch) branch = await createBranchWithDefaults({ name: 'Main Branch' });

for (const b of await Branch.findAll()) {
  if (await sequelize.transaction((t) => ensureDefaultAccounts(b.id, t))) console.log(`Added default deposit accounts to "${b.name}"`);
}

const [admin, created] = await User.findOrCreate({
  where: { username },
  defaults: { branchId: branch.id, fullName: 'Administrator', role: 'admin', isSuper: true, passwordHash: await hashPassword(password) },
});
if (created) console.log(`Super admin created: ${admin.username} / ${password}  (change this!)`);
else if (!admin.isSuper && admin.role === 'admin') { await admin.update({ isSuper: true }); console.log(`"${admin.username}" is now a super admin`); }
else console.log(`Admin "${admin.username}" already exists`);

if (!(await Device.count({ where: { branchId: branch.id } }))) {
  for (const [kind, name] of [['kiosk', 'Kiosk 1'], ['display', 'Queue TV']]) {
    const token = generateDeviceToken();
    await Device.create({ branchId: branch.id, kind, name, tokenHash: hashToken(token) });
    console.log(`${name} device token (shown once): ${token}`);
  }
}
await sequelize.close();

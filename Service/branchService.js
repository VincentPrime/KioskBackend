import { sequelize, Branch, Window, DepositAccount } from '../Models/index.js';

export const DEFAULT_ACCOUNTS = ['Savings', 'Special', 'Share Capital'];

/** Only fills in the defaults when a branch has no deposit accounts at all. */
export async function ensureDefaultAccounts(branchId, t) {
  if (await DepositAccount.count({ where: { branchId }, transaction: t })) return false;
  await DepositAccount.bulkCreate(DEFAULT_ACCOUNTS.map((name, i) => ({ branchId, name, sortOrder: i + 1 })), { transaction: t });
  return true;
}

/** A new branch starts with Window 1, Window 2 and the default deposit accounts. */
export function createBranchWithDefaults({ name, timezone = 'Asia/Manila' }) {
  return sequelize.transaction(async (t) => {
    const branch = await Branch.create({ name, timezone }, { transaction: t });
    await Window.bulkCreate(['Window 1', 'Window 2'].map((n, i) => ({ branchId: branch.id, name: n, sortOrder: i + 1 })), { transaction: t });
    await ensureDefaultAccounts(branch.id, t);
    return branch;
  });
}

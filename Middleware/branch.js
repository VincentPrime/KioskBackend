import { Branch } from '../Models/index.js';
import { ApiError } from '../Utils/ApiError.js';
import { asyncHandler } from '../Utils/asyncHandler.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Which branch is this admin request about?
 * Branch admins: always their own branch.
 * Super admins: their own, unless the x-branch-id header selects another one.
 */
export const resolveBranch = asyncHandler(async (req, _res, next) => {
  let id = req.user.branchId;
  const wanted = req.headers['x-branch-id'];
  if (wanted && req.user.isSuper && wanted !== id) {
    if (!UUID.test(wanted) || !(await Branch.findByPk(wanted))) throw ApiError.notFound('Branch not found', 'BRANCH_NOT_FOUND');
    id = wanted;
  }
  req.branchId = id;
  next();
});

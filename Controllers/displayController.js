import { asyncHandler } from '../Utils/asyncHandler.js';
import { getDisplayState } from '../Service/queueService.js';

export const state = asyncHandler(async (req, res) => res.json(await getDisplayState(req.device.branchId)));

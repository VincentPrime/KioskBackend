import { asyncHandler } from '../Utils/asyncHandler.js';
import * as payments from '../Service/paymentService.js';

// ?status=paid|pending|expired|failed|all  ?view=active|archive  ?from=YYYY-MM-DD&to=YYYY-MM-DD
export const list = asyncHandler(async (req, res) => {
  const paidOnly = req.user.role === 'supervisor';          // supervisors only ever see PAID payments
  res.json(await payments.listPayments(req.branchId, { ...req.query, paidOnly }));
});
export const verify = asyncHandler(async (req, res) => { await payments.verifyPayment(req.user, req.branchId, req.params.id, req.body); res.json({ ok: true }); });
export const simulate = asyncHandler(async (req, res) => { await payments.simulatePaid(req.branchId, req.params.id); res.json({ ok: true }); });

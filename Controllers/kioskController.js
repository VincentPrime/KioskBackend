import { asyncHandler } from '../Utils/asyncHandler.js';
import { ApiError } from '../Utils/ApiError.js';
import * as ticketService from '../Service/ticketService.js';
import * as paymentService from '../Service/paymentService.js';

export const config = asyncHandler(async (req, res) => {
  res.json(await ticketService.getKioskConfig(req.device.branchId));
});

// Withdraw, Loans, and Cash deposits. GCash deposits must go through the payment flow.
export const createTicket = asyncHandler(async (req, res) => {
  const { category, txn, accountTypeId, paymentMethod } = req.body;
  if (txn === 'deposit' && paymentMethod === 'gcash') {
    throw ApiError.badRequest('GCash deposits are ticketed after payment', 'USE_PAYMENT_FLOW');
  }
  const ticket = await ticketService.issueTicket(req.device.branchId, { category, txn, accountTypeId, paymentMethod });
  res.status(201).json({ ticket });
});

export const createPayment = asyncHandler(async (req, res) => res.status(201).json(await paymentService.createQrPayment(req.device, req.body)));
export const getPayment = asyncHandler(async (req, res) => res.json(await paymentService.getPaymentStatus(req.device, req.params.id)));

export const printed = asyncHandler(async (req, res) => { await ticketService.markPrinted(req.device.branchId, req.params.id); res.json({ ok: true }); });

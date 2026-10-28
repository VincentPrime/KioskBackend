import { z } from 'zod';

const uuid = z.string().uuid();

export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export const kioskTicketSchema = z.object({
  category: z.enum(['R', 'S']),
  txn: z.enum(['deposit', 'withdraw', 'loan']),
  accountTypeId: uuid.optional(),
  paymentMethod: z.enum(['cash', 'gcash']).optional(),
}).refine((v) => v.txn !== 'deposit' || (v.accountTypeId && v.paymentMethod), {
  message: 'Deposits need accountTypeId and paymentMethod',
});

export const kioskPaymentSchema = z.object({
  category: z.enum(['R', 'S']),
  accountTypeId: uuid,
  amount: z.number().positive(),
});

export const openWindowSchema = z.object({ windowId: uuid.optional() });
export const breakSchema = z.object({ onBreak: z.boolean() });

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  fullName: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
  role: z.enum(['admin', 'supervisor', 'employee']).default('employee'),
  defaultWindowId: uuid.nullable().optional(),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(100).optional(),
  password: z.string().min(8).max(100).optional(),
  role: z.enum(['admin', 'supervisor', 'employee']).optional(),
  defaultWindowId: uuid.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createWindowSchema = z.object({ name: z.string().min(1).max(50), sortOrder: z.number().int().optional() });
export const updateWindowSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().optional(),
  isEnabled: z.boolean().optional(),
});

export const createDeviceSchema = z.object({ kind: z.enum(['kiosk', 'display']), name: z.string().min(1).max(100) });

export const updateSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Invalid timezone').optional(),
  ticketCutoff: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  maxRecalls: z.number().int().min(0).max(10).optional(),
  idleTimeoutSeconds: z.number().int().min(10).max(600).optional(),
  gcashMin: z.number().nonnegative().optional(),
  gcashMax: z.number().positive().optional(),
  qrExpirySeconds: z.number().int().min(60).max(3600).optional(),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Invalid timezone').optional(),
});
export const createDepositAccountSchema = z.object({ name: z.string().trim().min(1).max(100), sortOrder: z.number().int().optional() });
export const updateDepositAccountSchema = z.object({ name: z.string().trim().min(1).max(100).optional(), sortOrder: z.number().int().optional() });
export const reprintSchema = z.object({ deviceId: uuid.optional() });

export const verifyPaymentSchema = z.object({ status: z.enum(['verified', 'problem']), note: z.string().trim().max(255).optional() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const paymentsQuerySchema = z.object({
  from: dateStr.optional(), to: dateStr.optional(),
  view: z.enum(['active', 'archive']).optional(),
  status: z.enum(['all', 'paid', 'pending', 'expired', 'failed']).optional(),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: '"From" must not be after "To"' });

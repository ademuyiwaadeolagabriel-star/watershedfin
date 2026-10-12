// ============================================================================
// v5 — Central Security Foundation: Validation (Zod)
// ============================================================================
// Reusable Zod schemas for common validation patterns.
// ============================================================================

import { z } from 'zod';

// Common field schemas
export const schemas = {
  // Nigerian NUBAN account number (10 digits)
  nuban: z.string().regex(/^\d{10}$/, 'NUBAN must be exactly 10 digits'),

  // BVN (11 digits)
  bvn: z.string().regex(/^\d{11}$/, 'BVN must be exactly 11 digits'),

  // NIN (11 digits)
  nin: z.string().regex(/^\d{11}$/, 'NIN must be exactly 11 digits'),

  // Email
  email: z.string().email('Invalid email format').toLowerCase().trim(),

  // Phone (at least 10 digits after stripping non-numeric)
  phone: z.string().refine((v) => v.replace(/\D/g, '').length >= 10, 'Phone must be at least 10 digits'),

  // Positive monetary amount
  positiveAmount: z.number().positive('Amount must be positive'),

  // Non-negative monetary amount
  nonNegativeAmount: z.number().min(0, 'Amount must be non-negative'),

  // Positive integer (for tenor, counts)
  positiveInt: z.number().int().positive('Must be a positive integer'),

  // Interest rate (0-100%)
  interestRate: z.number().min(0).max(100, 'Interest rate must be 0-100%'),

  // Percentage (0-100)
  percentage: z.number().min(0).max(100, 'Percentage must be 0-100'),

  // Cuid ID
  cuid: z.string().min(1, 'ID is required'),

  // Application reference
  applicationRef: z.string().regex(/^LN-\d{4}-\d{4}$/, 'Invalid application reference format'),

  // Payment reference
  paymentRef: z.string().min(5, 'Payment reference is required'),
};

// Request body schemas for common operations
export const loanApplicationSchema = z.object({
  amount: schemas.positiveAmount,
  duration: schemas.positiveInt,
  planId: z.string().optional(),
  purpose: z.string().optional(),
  hasExternalLoans: z.boolean().optional(),
});

export const paymentInitiateSchema = z.object({
  amount: schemas.positiveAmount,
  method: z.enum(['card', 'bank_transfer', 'ussd']),
  loanId: schemas.cuid.optional(),
  type: z.enum(['loan_repayment', 'wallet_funding']).optional(),
});

export const paymentVerifySchema = z.object({
  paymentRef: schemas.paymentRef,
});

export const otpVerifySchema = z.object({
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Email or username required'),
  password: z.string().min(1, 'Password required'),
});

export const onboardSchema = z.object({
  channel: z.enum(['self_onboard', 'desk_onboard', 'bm_onboard', 'field_onboard']),
  personal: z.object({
    firstName: z.string().min(1, 'First name required'),
    lastName: z.string().min(1, 'Last name required'),
    email: schemas.email.optional(),
    phone: schemas.phone,
    bvn: schemas.bvn.optional(),
    nin: schemas.nin.optional(),
  }),
  business: z.object({
    businessName: z.string().min(1, 'Business name required'),
    sectorId: z.string().min(1, 'Sector required'),
  }),
  consent: z.object({
    feeKey: z.string().min(1, 'Fee key required'),
  }),
});

/**
 * Validate a request body against a Zod schema.
 * Returns the parsed data or throws a formatted error.
 */
export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safely validate a request body. Returns a result object.
 */
export function safeValidateBody<T>(schema: z.ZodSchema<T>, data: unknown):
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  // Zod v4 stores issues in result.error.issues
  const issues = (result.error as any).issues || (result.error as any).errors || [];
  const firstError = issues[0];
  return {
    success: false,
    error: firstError ? `${firstError.path?.join('.') || ''}: ${firstError.message}` : 'Validation failed',
  };
}

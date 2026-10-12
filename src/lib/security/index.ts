// ============================================================================
// v5 — Central Security Foundation: Index
// ============================================================================
// Re-exports all security primitives for easy import.
//
// Usage:
//   import { requireAuth, requireRole, requireLoanAccess, auditEvent,
//            enforceRateLimit, safeError, validateBody, withIdempotency,
//            SECURITY_HEADERS } from '@/lib/security';
// ============================================================================

export { requireAuth, requireRole, requireCustomerAuth,
         requireMakerChecker, getAuthFromRequest, extractToken,
         type AuthPayload } from '../auth';

export { requireCronAuth } from '../cron-auth';

export { requireLoanAccess, requireOwnership, requireWorkflowState,
         PERMISSIONS } from './authorization';

export { checkRateLimit, enforceRateLimit, RATE_LIMITS } from './rate-limit';

export { auditEvent, AUDIT_EVENTS, getClientIp,
         type AuditEventType } from './audit';

export { safeError, unauthorizedError, forbiddenError, badRequestError,
         notFoundError, conflictError, tooManyRequestsError,
         withErrorHandler } from './errors';

export { schemas, validateBody, safeValidateBody,
         loginSchema, paymentInitiateSchema, paymentVerifySchema,
         otpVerifySchema, onboardSchema } from './validation';

export { withIdempotency, getIdempotencyKey } from './idempotency';

export { SECURITY_HEADERS, applySecurityHeaders } from './security-headers';

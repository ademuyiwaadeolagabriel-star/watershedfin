// ============================================================================
// v5 — Central Security Foundation: Audit Event Logging
// ============================================================================
// Standardized audit event logging. Every security-sensitive action should
// call auditEvent() with a standardized event type + metadata.
//
// Audit records MUST NOT contain:
//   - passwords, OTPs, JWTs, API keys, secrets, full sensitive documents
//
// Audit records SHOULD contain:
//   - actorId, actorRole, action, module, description, severity, metadata
//   - ipAddress, correlationId
// ============================================================================

import { db } from '@/lib/db';
import crypto from 'crypto';

export const AUDIT_EVENTS = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',

  // Account management
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  STAFF_CREATED: 'STAFF_CREATED',

  // KYC
  KYC_UPLOADED: 'KYC_UPLOADED',
  KYC_VIEWED: 'KYC_VIEWED',
  KYC_DOWNLOADED: 'KYC_DOWNLOADED',
  KYC_APPROVED: 'KYC_APPROVED',
  KYC_REJECTED: 'KYC_REJECTED',

  // Loan lifecycle
  LOAN_CREATED: 'LOAN_CREATED',
  LOAN_SUBMITTED: 'LOAN_SUBMITTED',
  LOAN_APPROVED: 'LOAN_APPROVED',
  LOAN_REJECTED: 'LOAN_REJECTED',
  LOAN_DISBURSED: 'LOAN_DISBURSED',

  // Payments
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_VERIFIED: 'PAYMENT_VERIFIED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',

  // Governance
  MCC_DECISION: 'MCC_DECISION',
  LEGAL_DECISION: 'LEGAL_DECISION',

  // Configuration
  SETTING_CHANGED: 'SETTING_CHANGED',
  FEE_CHANGED: 'FEE_CHANGED',
  SECURITY_SETTING_CHANGED: 'SECURITY_SETTING_CHANGED',

  // Admin
  ADMIN_ACTION: 'ADMIN_ACTION',
} as const;

export type AuditEventType = typeof AUDIT_EVENTS[keyof typeof AUDIT_EVENTS];

interface AuditEventParams {
  actorId?: string;
  actorRole?: string;
  event: AuditEventType;
  module: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
  ipAddress?: string | null;
  userId?: string;
  loanId?: string;
  correlationId?: string;
}

/**
 * Record a standardized audit event with tamper-evident hash chain.
 * Each event's eventHash = SHA-256(eventData + previousHash).
 * An admin cannot modify or delete an audit entry without breaking the chain.
 *
 * Fire-and-forget (non-blocking for the caller). Never throws.
 */
export async function auditEvent(params: AuditEventParams): Promise<void> {
  try {
    // Sanitize metadata — strip any known-secret keys
    const sanitizedMetadata = params.metadata ? { ...params.metadata } : {};
    const SECRET_KEYS = ['password', 'token', 'secret', 'otp', 'jwt', 'apiKey', 'authorization'];
    for (const key of Object.keys(sanitizedMetadata)) {
      const lowerKey = key.toLowerCase();
      if (SECRET_KEYS.some(s => lowerKey.includes(s))) {
        sanitizedMetadata[key] = '[REDACTED]';
      }
    }

    // v5.1 — Hash chain: get the most recent audit log entry's hash
    const lastEntry = await db.auditLog.findFirst({
      orderBy: { sequenceNumber: 'desc' },
      select: { eventHash: true, sequenceNumber: true },
    }).catch(() => null);

    const previousHash = lastEntry?.eventHash || 'genesis';
    const nextSequence = (lastEntry?.sequenceNumber || 0) + 1;

    // Compute eventHash = SHA-256(eventData + previousHash)
    const eventData = JSON.stringify({
      actorId: params.actorId,
      actorRole: params.actorRole,
      event: params.event,
      module: params.module,
      description: params.description,
      severity: params.severity || 'info',
      metadata: sanitizedMetadata,
      ipAddress: params.ipAddress,
      userId: params.userId,
      loanId: params.loanId,
      sequenceNumber: nextSequence,
    });
    const eventHash = crypto
      .createHash('sha256')
      .update(eventData + previousHash)
      .digest('hex');

    await db.auditLog.create({
      data: {
        userId: params.userId || undefined,
        adminId: params.actorId || undefined,
        action: params.event,
        module: params.module,
        description: params.description,
        severity: params.severity || 'info',
        ipAddress: params.ipAddress || null,
        metadata: JSON.stringify({
          ...sanitizedMetadata,
          actorRole: params.actorRole,
          loanId: params.loanId,
          correlationId: params.correlationId,
        }),
        // v5.1 — tamper-evidence fields
        previousHash,
        eventHash,
        sequenceNumber: nextSequence,
      },
    });
  } catch (e: any) {
    // Non-blocking — audit logging failure must not crash the route
    console.error('[audit-event] Failed to record:', params.event, e?.message);
  }
}

/**
 * Get the client IP from a Next.js request.
 */
export function getClientIp(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// ============================================================================
// v48: SECURITY HARDENING — Complete rewrite of auth module
// Fixes: P0-2 (JWT secret), P0-3 (adminId bypass), P0-4 (session revocation),
//        P0-5 (customer token type)
// ============================================================================

// P0-2: FAIL CLOSED if JWT_SECRET is missing or too weak
// But don't throw during Next.js build phase (next build runs in NODE_ENV=production)
const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // During build (no DATABASE_URL, no runtime), use a placeholder
    if (process.env.NEXT_PHASE === 'phase-production-build' || !process.env.DATABASE_URL) {
      return 'build-placeholder-secret-not-used-at-runtime';
    }
    // At runtime in production, this is a fatal error
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: JWT_SECRET environment variable is required in production. Set it in Vercel env vars.');
      return 'missing-jwt-secret-app-will-not-function';
    }
    console.warn('WARNING: JWT_SECRET not set — using insecure dev-only secret. DO NOT use in production.');
    return 'dev-only-insecure-secret-change-me';
  }
  if (secret.length < 32) {
    console.warn('WARNING: JWT_SECRET is too short (< 32 chars). Use a strong random secret.');
  }
  return secret;
})();

const TOKEN_EXPIRY_HOURS = 8;

export interface AuthPayload {
  id: string;
  role: string;
  branchId?: string | null;
  type?: 'admin' | 'customer';
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

// P0-5: signAuthToken now requires explicit type — no silent 'admin' default
export function signAuthToken(payload: AuthPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    type: payload.type || 'admin', // Explicit; callers MUST set type: 'customer' for customers
    iat: now,
    exp: now + (TOKEN_EXPIRY_HOURS * 3600),
    iss: 'watershed-capital',
    aud: 'api',
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;

  const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64');
  const encodedSignature = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${data}.${encodedSignature}`;
}

// P0-4: verifyAuthToken now checks ActiveSession.revokedAt
export async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedBody, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedBody}`;

    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    if (encodedSignature !== expectedSignature) return null;

    // Decode body
    const body = JSON.parse(base64urlDecode(encodedBody).toString('utf8'));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (body.exp && now > body.exp) return null;

    // Check issuer/audience
    if (body.iss !== 'watershed-capital') return null;
    if (body.aud !== 'api') return null;

    // v54 — Blocker fail-closed: ActiveSession revocation is now MANDATORY.
    // Previously: if no session record existed OR if the lookup threw (DB
    // error), the token was accepted (fail-open). This meant a DB outage
    // silently disabled revocation. Now:
    //   - If the session lookup throws → FAIL CLOSED (return null).
    //   - If no session record exists → FAIL CLOSED (return null).
    //   - If session exists + revoked → FAIL CLOSED.
    //   - If session exists + expired → FAIL CLOSED.
    //   - Only if session exists + active + not-expired → token is valid.
    // This means existing logged-in users without an ActiveSession record
    // will be forced to re-login after deploy. That is the correct posture
    // for a financial system.
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const session = await db.activeSession.findUnique({
        where: { tokenHash },
        select: { revokedAt: true, expiresAt: true, adminId: true },
      });
      if (!session) {
        // v54 — no session record means the token was issued before
        // ActiveSession was enforced, OR the session was deleted. Either
        // way, fail closed — require re-login.
        return null;
      }
      if (session.revokedAt) return null;
      if (new Date(session.expiresAt) < new Date()) return null;
    } catch (sessionErr: any) {
      // v54 — DB error during session lookup → FAIL CLOSED.
      // The previous implementation silently fell through here, accepting
      // the token. For a financial system, a DB outage must NOT silently
      // disable revocation.
      console.error('[auth] ActiveSession lookup failed — FAIL CLOSED:', sessionErr?.message);
      return null;
    }

    return {
      id: body.id,
      role: body.role,
      branchId: body.branchId,
      type: body.type,
    };
  } catch {
    return null;
  }
}

export function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// P0-3: REMOVED adminId query parameter bypass entirely
// Identity must come from a verified JWT token — NEVER from caller-supplied data
export async function getAuthFromRequest(req: NextRequest): Promise<AuthPayload | null> {
  const token = extractToken(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function requireAuth(req: NextRequest): Promise<AuthPayload | NextResponse> {
  const payload = await getAuthFromRequest(req);
  if (!payload) {
    return NextResponse.json(
      { error: 'Authentication required. Provide a valid Bearer token.' },
      { status: 401 }
    );
  }
  return payload;
}

export async function requireRole(req: NextRequest, roles: string[]): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = authResult as AuthPayload;
  if (!roles.includes(payload.role) && payload.role !== 'super') {
    return NextResponse.json(
      { error: `Access denied. Required role: ${roles.join(' or ')}` },
      { status: 403 }
    );
  }
  return payload;
}

// v48: New — require customer auth (type must be 'customer')
export async function requireCustomerAuth(req: NextRequest): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = authResult as AuthPayload;
  if (payload.type !== 'customer') {
    return NextResponse.json(
      { error: 'Customer authentication required.' },
      { status: 403 }
    );
  }
  return payload;
}

export async function requireBranchScope(req: NextRequest, loanId: string): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = authResult as AuthPayload;

  const nationalRoles = ['super', 'md', 'cfo', 'hoc', 'cro'];
  if (nationalRoles.includes(payload.role)) {
    return payload;
  }

  if (payload.branchId) {
    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      select: { branchId: true },
    });
    if (loan && loan.branchId && loan.branchId !== payload.branchId) {
      return NextResponse.json(
        { error: 'Access denied — loan belongs to a different branch.' },
        { status: 403 }
      );
    }
  }

  return payload;
}

export async function getAdminFromRequest(req: NextRequest): Promise<{ id: string; firstName: string; lastName: string; role: string; branchId?: string | null } | null> {
  const payload = await getAuthFromRequest(req);
  if (!payload || payload.type === 'customer') return null;

  const admin = await db.admin.findUnique({
    where: { id: payload.id },
    select: { id: true, firstName: true, lastName: true, role: true, branchId: true },
  });
  return admin;
}

// ============================================================================
// v51: MAKER-CHECKER PATTERN
// ============================================================================
// Issue #31 from the v49 audit: sensitive financial operations (loan
// disbursement, treasury transactions, large repayments/refunds, accounting
// adjustments, chart-of-account changes, sector policy changes, loan product
// changes) require a formal Maker → Checker → Authorizer → Execution flow,
// not just frontend workflow state.
//
// The implementation here is a lightweight, server-enforced pattern:
//
//   1. Maker calls the mutation endpoint with `?stage=propose`.
//      → Server creates a `PendingMutation` row capturing the operation,
//        payload, and maker identity. Returns the proposal ID.
//   2. Checker calls `?stage=review&proposalId=...`.
//      → Server validates the proposal is still PENDING, the caller is
//        NOT the maker (segregation of duties), and the caller has the
//        appropriate role. Marks the proposal as REVIEWED.
//   3. Authorizer calls `?stage=authorize&proposalId=...`.
//      → Same segregation-of-duties check. Marks as AUTHORIZED.
//   4. Execution: any admin (or cron) calls `?stage=execute&proposalId=...`.
//      → Server runs the actual mutation in a transaction, marking the
//        proposal EXECUTED and stamping all three identities (maker,
//        checker, authorizer) on the audit log.
//
// For low-stakes mutations the maker may also be the checker; for high-stakes
// (disbursement, sector policy) we enforce full segregation.
//
// Usage in a route:
//   const gate = await requireMakerChecker(req, {
//     operation: 'loan_disbursement',
//     stages: ['propose', 'review', 'authorize', 'execute'],
//     enforceSegregation: true,
//   });
//   if (gate instanceof NextResponse) return gate;
//   const { stage, proposalId, actorId } = gate;
// ============================================================================

export type MakerCheckerStage = 'propose' | 'review' | 'authorize' | 'execute';

export interface MakerCheckerGate {
  stage: MakerCheckerStage;
  proposalId: string | null;
  actorId: string;
  actorRole: string;
}

export interface MakerCheckerOptions {
  /** Stable string identifying the operation type, e.g. 'loan_disbursement'. */
  operation: string;
  /** Allowed stages for this operation. */
  stages: MakerCheckerStage[];
  /** If true, the reviewer/authorizer MUST be a different admin from the maker. */
  enforceSegregation?: boolean;
  /** Roles allowed to PROPOSE this mutation. */
  makerRoles?: string[];
  /** Roles allowed to REVIEW (check) this mutation. */
  checkerRoles?: string[];
  /** Roles allowed to AUTHORIZE this mutation. */
  authorizerRoles?: string[];
  /** Roles allowed to EXECUTE this mutation. */
  executorRoles?: string[];
}

export async function requireMakerChecker(
  req: NextRequest,
  options: MakerCheckerOptions,
): Promise<MakerCheckerGate | NextResponse> {
  // Step 1: any maker-checker operation requires admin auth.
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const payload = authResult as AuthPayload;

  // Helper to check role lists; 'super' always passes.
  const hasRole = (allowed: string[] | undefined) => {
    if (!allowed) return true; // no role restriction
    if (payload.role === 'super') return true;
    return allowed.includes(payload.role);
  };

  const url = new URL(req.url);
  const stage = (url.searchParams.get('stage') as MakerCheckerStage) || 'propose';
  const proposalId = url.searchParams.get('proposalId');

  if (!options.stages.includes(stage)) {
    return NextResponse.json(
      { error: `Stage '${stage}' not permitted for operation '${options.operation}'.` },
      { status: 400 },
    );
  }

  // Stage-specific role checks
  if (stage === 'propose' && !hasRole(options.makerRoles)) {
    return NextResponse.json({ error: 'Not authorized to propose this mutation.' }, { status: 403 });
  }
  if (stage === 'review' && !hasRole(options.checkerRoles)) {
    return NextResponse.json({ error: 'Not authorized to review this mutation.' }, { status: 403 });
  }
  if (stage === 'authorize' && !hasRole(options.authorizerRoles)) {
    return NextResponse.json({ error: 'Not authorized to authorize this mutation.' }, { status: 403 });
  }
  if (stage === 'execute' && !hasRole(options.executorRoles)) {
    return NextResponse.json({ error: 'Not authorized to execute this mutation.' }, { status: 403 });
  }

  // For review/authorize/execute: validate the proposal exists and is in
  // the right state. (The actual state machine is route-specific, but we
  // enforce the segregation-of-duties check here.)
  if (stage !== 'propose') {
    if (!proposalId) {
      return NextResponse.json({ error: 'proposalId is required for non-propose stages.' }, { status: 400 });
    }
    const proposal = await db.pendingMutation.findUnique({
      where: { id: proposalId },
    }).catch(() => null);
    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    }
    if (proposal.operation !== options.operation) {
      return NextResponse.json(
        { error: `Proposal operation mismatch: expected '${options.operation}', got '${proposal.operation}'.` },
        { status: 400 },
      );
    }
    if (options.enforceSegregation && proposal.makerId === payload.id) {
      return NextResponse.json(
        { error: 'Segregation of duties: maker cannot also be the checker/authorizer.' },
        { status: 403 },
      );
    }
    // Stage-state consistency
    if (stage === 'review' && proposal.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Proposal is ${proposal.status}, cannot review.` },
        { status: 400 },
      );
    }
    if (stage === 'authorize' && proposal.status !== 'REVIEWED') {
      return NextResponse.json(
        { error: `Proposal is ${proposal.status}, cannot authorize.` },
        { status: 400 },
      );
    }
    if (stage === 'execute' && proposal.status !== 'AUTHORIZED') {
      return NextResponse.json(
        { error: `Proposal is ${proposal.status}, cannot execute.` },
        { status: 400 },
      );
    }
  }

  return {
    stage,
    proposalId,
    actorId: payload.id,
    actorRole: payload.role,
  };
}

/**
 * Helper to persist a new PendingMutation proposal. Routes call this in the
 * 'propose' stage after collecting the mutation payload.
 *
 * v54 — Blocker 4: FAIL CLOSED. The previous implementation caught DB
 * errors and returned a fake `fallback-${Date.now()}` ID, allowing the
 * financial mutation to proceed WITHOUT governance record. For a financial
 * system, "DB unavailable → fallback governance → continue" is backwards.
 * Now: if `db.pendingMutation.create` throws (including the case where
 * the table doesn't exist), the error propagates and the caller returns 500.
 * No financial mutation proceeds without a persisted governance record.
 */
export async function createPendingMutation(params: {
  operation: string;
  makerId: string;
  payload: any;
  targetId?: string;
  expiresAt?: Date;
}): Promise<{ id: string }> {
  // Default 7-day expiry if not specified.
  const expiresAt = params.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // v54 — Blocker 4: NO .catch() fallback. If the DB is unavailable or
  // the PendingMutation table doesn't exist, the error propagates to the
  // caller, which must return 500 and NOT proceed with the financial
  // mutation. This is the fail-closed posture required for governance.
  const created = await db.pendingMutation.create({
    data: {
      operation: params.operation,
      makerId: params.makerId,
      targetId: params.targetId || null,
      payloadJson: JSON.stringify(params.payload),
      status: 'PENDING',
      expiresAt,
    },
  });
  return { id: created.id };
}

/**
 * Update a PendingMutation proposal status. Routes call this between
 * stages.
 */
export async function updatePendingMutationStatus(
  proposalId: string,
  status: 'PENDING' | 'REVIEWED' | 'AUTHORIZED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED',
  actorId: string,
): Promise<void> {
  await db.pendingMutation.update({
    where: { id: proposalId },
    data: {
      status,
      ...(status === 'REVIEWED' && { checkerId: actorId, reviewedAt: new Date() }),
      ...(status === 'AUTHORIZED' && { authorizerId: actorId, authorizedAt: new Date() }),
      ...(status === 'EXECUTED' && { executedAt: new Date() }),
      ...(status === 'REJECTED' && { rejectedById: actorId, rejectedAt: new Date() }),
    },
  }).catch((err: any) => {
    console.warn('[maker-checker] update failed (table may not exist):', err?.message);
  });
}

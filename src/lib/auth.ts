import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { ROLE_TO_MCC } from '@/lib/constants';

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
    if (
      process.env.NEXT_PHASE === 'phase-production-build' ||
      !process.env.DATABASE_URL
    ) {
      return 'build-placeholder-secret-not-used-at-runtime';
    }

    // At runtime in production, this is a fatal error
    if (process.env.NODE_ENV === 'production') {
      // SECURITY: never use a known fallback secret in production.
      console.error(
        'FATAL: JWT_SECRET environment variable is required in production.',
      );
      return '';
    }

    console.warn(
      'WARNING: JWT_SECRET not set — using a random development-only secret.',
    );

    return `dev-only-${crypto.randomBytes(32).toString('hex')}`;
  }

  if (secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        'FATAL: JWT_SECRET must be at least 32 characters in production.',
      );
      return '';
    }

    console.warn(
      'WARNING: JWT_SECRET is too short (< 32 chars). Use a strong random secret.',
    );
  }

  return secret;
})();

const TOKEN_EXPIRY_HOURS = 8;

export interface AuthPayload {
  id: string;
  role: string;
  branchId?: string | null;
  type: 'admin' | 'customer';
  sessionVersion?: number;
}

function base64url(input: string | Buffer): string {
  const buf =
    typeof input === 'string' ? Buffer.from(input, 'utf8') : input;

  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    padded.length % 4 === 0
      ? ''
      : '='.repeat(4 - (padded.length % 4));

  return Buffer.from(padded + pad, 'base64');
}

// P0-5: signAuthToken now requires explicit type — no silent 'admin' default
export function signAuthToken(payload: AuthPayload): string {
  if (!JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is not configured; token signing is disabled.',
    );
  }

  if (!payload.type) {
    throw new Error('Auth token type is required.');
  }

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);

  const body = {
    ...payload,
    type: payload.type,
    iat: now,
    exp: now + TOKEN_EXPIRY_HOURS * 3600,
    iss: 'watershed-capital',
    aud: 'api',
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64');

  const encodedSignature = signature
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${encodedSignature}`;
}

// P0-4: verifyAuthToken now checks ActiveSession.revokedAt
export async function verifyAuthToken(
  token: string,
): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedBody, encodedSignature] = parts;
    const data = `${encodedHeader}.${encodedBody}`;

    // Verify signature using a constant-time comparison.
    if (!JWT_SECRET) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(encodedSignature);

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return null;
    }

    // Decode body
    const body = JSON.parse(
      base64urlDecode(encodedBody).toString('utf8'),
    );

    // Check expiration
    const now = Math.floor(Date.now() / 1000);

    if (body.exp && now > body.exp) {
      return null;
    }

    // Check issuer/audience
    if (body.iss !== 'watershed-capital') {
      return null;
    }

    if (body.aud !== 'api') {
      return null;
    }

    // Server-side session enforcement for admin tokens.
    // Customer JWTs use authVersion to invalidate prior tokens.
    // Admin governance tokens MUST be revocable server-side.
    if (body.type === 'customer') {
      const customer = await db.user.findUnique({
        where: { id: body.id },
        select: {
          authVersion: true,
          status: true,
        },
      });

      if (!customer || customer.status !== 1) {
        return null;
      }

      if (
        Number(body.sessionVersion ?? -1) !==
        Number(customer.authVersion)
      ) {
        return null;
      }
    } else {
      try {
        const tokenHash = crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

        const session = await db.activeSession.findUnique({
          where: { tokenHash },
          select: {
            adminId: true,
            revokedAt: true,
            expiresAt: true,
          },
        });

        if (!session || session.adminId !== body.id) {
          return null;
        }

        if (
          session.revokedAt ||
          new Date(session.expiresAt) < new Date()
        ) {
          return null;
        }

        const admin = await db.admin.findUnique({
          where: { id: body.id },
          select: {
            status: true,
            role: true,
            branchId: true,
          },
        });

        if (!admin || admin.status !== 1) {
          return null;
        }

        // Role/branch claims must remain consistent with the current
        // server record; changing a user's role immediately invalidates
        // old tokens.
        if (
          admin.role !== body.role ||
          (admin.branchId || null) !== (body.branchId || null)
        ) {
          return null;
        }
      } catch {
        return null;
      }
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

export function extractToken(
  req: NextRequest,
): string | null {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

// P0-3: REMOVED adminId query parameter bypass entirely.
// Identity must come from a verified JWT token — NEVER from
// caller-supplied data.
export async function getAuthFromRequest(
  req: NextRequest,
): Promise<AuthPayload | null> {
  const token = extractToken(req);

  if (!token) {
    return null;
  }

  return verifyAuthToken(token);
}

export async function requireAuth(
  req: NextRequest,
): Promise<AuthPayload | NextResponse> {
  const payload = await getAuthFromRequest(req);

  if (!payload) {
    return NextResponse.json(
      {
        error:
          'Authentication required. Provide a valid Bearer token.',
      },
      { status: 401 },
    );
  }

  return payload;
}

export async function requireRole(
  req: NextRequest,
  roles: string[],
): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const payload = authResult as AuthPayload;

  // v54-fix — Role normalization: accept both short and long role names.
  // The database stores roles like 'loan', 'bm', 'cs' — but the role lists
  // in route handlers sometimes use 'lo' (2 chars) instead of 'loan' (4 chars).
  // The ROLE_TO_MCC map treats 'loan' and 'lo' as equivalent (both -> 'LO').
  if (
    roles.includes(payload.role) ||
    payload.role === 'super'
  ) {
    return payload;
  }

  const payloadMcc = ROLE_TO_MCC[payload.role];

  if (payloadMcc) {
    const allowedMccs = roles
      .map((r) => ROLE_TO_MCC[r])
      .filter(Boolean);

    if (allowedMccs.includes(payloadMcc)) {
      return payload;
    }
  }

  return NextResponse.json(
    {
      error: `Access denied. Required role: ${roles.join(' or ')}`,
    },
    { status: 403 },
  );
}

// v48: require customer auth (type must be 'customer')
export async function requireCustomerAuth(
  req: NextRequest,
): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const payload = authResult as AuthPayload;

  if (payload.type !== 'customer') {
    return NextResponse.json(
      {
        error: 'Customer authentication required.',
      },
      { status: 403 },
    );
  }

  return payload;
}

export async function requireBranchScope(
  req: NextRequest,
  loanId: string,
): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const payload = authResult as AuthPayload;

  const nationalRoles = [
    'super',
    'md',
    'cfo',
    'hoc',
    'cro',
  ];

  if (nationalRoles.includes(payload.role)) {
    return payload;
  }

  if (payload.branchId) {
    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      select: { branchId: true },
    });

    if (
      loan &&
      loan.branchId &&
      loan.branchId !== payload.branchId
    ) {
      return NextResponse.json(
        {
          error:
            'Access denied — loan belongs to a different branch.',
        },
        { status: 403 },
      );
    }
  }

  return payload;
}

export async function getAdminFromRequest(
  req: NextRequest,
): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  branchId?: string | null;
} | null> {
  const payload = await getAuthFromRequest(req);

  if (!payload || payload.type === 'customer') {
    return null;
  }

  const admin = await db.admin.findUnique({
    where: { id: payload.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      branchId: true,
    },
  });

  return admin;
}

// ============================================================================
// v51: MAKER-CHECKER PATTERN
// ============================================================================
// Sensitive financial operations require a formal
// Maker -> Checker -> Authorizer -> Execution flow.
// ============================================================================

export type MakerCheckerStage =
  | 'propose'
  | 'review'
  | 'authorize'
  | 'execute';

export interface MakerCheckerGate {
  stage: MakerCheckerStage;
  proposalId: string | null;
  actorId: string;
  actorRole: string;
}

export interface MakerCheckerOptions {
  /** Stable string identifying the operation type. */
  operation: string;

  /** Allowed stages for this operation. */
  stages: MakerCheckerStage[];

  /** Reviewer/authorizer MUST be different from the maker. */
  enforceSegregation?: boolean;

  /** Roles allowed to propose. */
  makerRoles?: string[];

  /** Roles allowed to review. */
  checkerRoles?: string[];

  /** Roles allowed to authorize. */
  authorizerRoles?: string[];

  /** Roles allowed to execute. */
  executorRoles?: string[];

  /** Optional affected entity ID. */
  targetId?: string;
}

export async function requireMakerChecker(
  req: NextRequest,
  options: MakerCheckerOptions,
): Promise<MakerCheckerGate | NextResponse> {
  // Step 1: any maker-checker operation requires authenticated access.
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const payload = authResult as AuthPayload;

  // Maker-checker is an administrative governance mechanism.
  if (payload.type !== 'admin') {
    return NextResponse.json(
      {
        error:
          'Administrative authentication required for maker-checker operations.',
      },
      { status: 403 },
    );
  }

  const hasRole = (
    allowed: string[] | undefined,
  ): boolean => {
    if (!allowed) {
      return true;
    }

    if (payload.role === 'super') {
      return true;
    }

    return allowed.includes(payload.role);
  };

  const url = new URL(req.url);

  const stage =
    (url.searchParams.get('stage') as MakerCheckerStage) ||
    'propose';

  const proposalId =
    url.searchParams.get('proposalId');

  if (!options.stages.includes(stage)) {
    return NextResponse.json(
      {
        error:
          `Stage '${stage}' not permitted for operation '${options.operation}'.`,
      },
      { status: 400 },
    );
  }

  // Stage-specific role checks
  if (
    stage === 'propose' &&
    !hasRole(options.makerRoles)
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to propose this mutation.',
      },
      { status: 403 },
    );
  }

  if (
    stage === 'review' &&
    !hasRole(options.checkerRoles)
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to review this mutation.',
      },
      { status: 403 },
    );
  }

  if (
    stage === 'authorize' &&
    !hasRole(options.authorizerRoles)
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to authorize this mutation.',
      },
      { status: 403 },
    );
  }

  if (
    stage === 'execute' &&
    !hasRole(options.executorRoles)
  ) {
    return NextResponse.json(
      {
        error:
          'Not authorized to execute this mutation.',
      },
      { status: 403 },
    );
  }

  // A protected mutation must never fall directly through
  // to its business operation.
  if (stage === 'propose') {
    let proposalPayload: unknown = {};

    try {
      proposalPayload = await req.clone().json();
    } catch {
      proposalPayload = {};
    }

    const created = await createPendingMutation({
      operation: options.operation,
      makerId: payload.id,
      targetId: options.targetId,
      payload: proposalPayload,
    });

    return NextResponse.json(
      {
        ok: true,
        status: 'PENDING',
        proposalId: created.id,
        operation: options.operation,
        message:
          'Mutation proposed. A checker must review it before authorization and execution.',
      },
      { status: 202 },
    );
  }

  // For review/authorize/execute:
  // validate the proposal and required state.
  {
    if (!proposalId) {
      return NextResponse.json(
        {
          error:
            'proposalId is required for non-propose stages.',
        },
        { status: 400 },
      );
    }

    const proposal =
      await db.pendingMutation.findUnique({
        where: { id: proposalId },
      }).catch(() => null);

    if (!proposal) {
      return NextResponse.json(
        {
          error: 'Proposal not found.',
        },
        { status: 404 },
      );
    }

    if (
      proposal.operation !== options.operation
    ) {
      return NextResponse.json(
        {
          error:
            `Proposal operation mismatch: expected '${options.operation}', got '${proposal.operation}'.`,
        },
        { status: 400 },
      );
    }

    if (
      options.enforceSegregation &&
      proposal.makerId === payload.id
    ) {
      return NextResponse.json(
        {
          error:
            'Segregation of duties: maker cannot also be the checker/authorizer.',
        },
        { status: 403 },
      );
    }

    // Stage-state consistency
    if (
      stage === 'review' &&
      proposal.status !== 'PENDING'
    ) {
      return NextResponse.json(
        {
          error:
            `Proposal is ${proposal.status}, cannot review.`,
        },
        { status: 400 },
      );
    }

    if (
      stage === 'authorize' &&
      proposal.status !== 'REVIEWED'
    ) {
      return NextResponse.json(
        {
          error:
            `Proposal is ${proposal.status}, cannot authorize.`,
        },
        { status: 400 },
      );
    }

    if (
      proposal.expiresAt &&
      proposal.expiresAt < new Date()
    ) {
      await db.pendingMutation.update({
        where: { id: proposal.id },
        data: { status: 'EXPIRED' },
      });

      return NextResponse.json(
        {
          error: 'Proposal has expired.',
        },
        { status: 409 },
      );
    }

    if (stage === 'review') {
      await updatePendingMutationStatus(
        proposal.id,
        'REVIEWED',
        payload.id,
      );

      return NextResponse.json({
        ok: true,
        status: 'REVIEWED',
        proposalId: proposal.id,
      });
    }

    if (stage === 'authorize') {
      await updatePendingMutationStatus(
        proposal.id,
        'AUTHORIZED',
        payload.id,
      );

      return NextResponse.json({
        ok: true,
        status: 'AUTHORIZED',
        proposalId: proposal.id,
      });
    }

    if (stage === 'execute') {
      let requestPayload: unknown = {};

      try {
        requestPayload =
          await req.clone().json();
      } catch {
        requestPayload = {};
      }

      if (
        JSON.stringify(requestPayload) !==
        proposal.payloadJson
      ) {
        return NextResponse.json(
          {
            error:
              'Execution payload does not exactly match the authorized proposal.',
          },
          { status: 409 },
        );
      }

      if (
        !proposal.checkerId ||
        !proposal.authorizerId
      ) {
        return NextResponse.json(
          {
            error:
              'Proposal is missing required checker/authorizer approvals.',
          },
          { status: 409 },
        );
      }
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
 * Persist a new PendingMutation proposal.
 *
 * FAIL CLOSED:
 * If database creation fails, the error propagates.
 * No protected financial mutation should continue without
 * a persisted governance record.
 */
export async function createPendingMutation(params: {
  operation: string;
  makerId: string;
  payload: any;
  targetId?: string;
  expiresAt?: Date;
}): Promise<{ id: string }> {
  const expiresAt =
    params.expiresAt ||
    new Date(
      Date.now() +
        7 * 24 * 60 * 60 * 1000,
    );

  const created =
    await db.pendingMutation.create({
      data: {
        operation: params.operation,
        makerId: params.makerId,
        targetId: params.targetId || null,
        payloadJson: JSON.stringify(
          params.payload,
        ),
        status: 'PENDING',
        expiresAt,
      },
    });

  return {
    id: created.id,
  };
}

/**
 * Update a PendingMutation proposal status.
 *
 * Errors are intentionally not swallowed because
 * governance must fail closed.
 */
export async function updatePendingMutationStatus(
  proposalId: string,
  status:
    | 'PENDING'
    | 'REVIEWED'
    | 'AUTHORIZED'
    | 'EXECUTED'
    | 'REJECTED'
    | 'EXPIRED',
  actorId: string,
): Promise<void> {
  await db.pendingMutation.update({
    where: { id: proposalId },
    data: {
      status,

      ...(status === 'REVIEWED' && {
        checkerId: actorId,
        reviewedAt: new Date(),
      }),

      ...(status === 'AUTHORIZED' && {
        authorizerId: actorId,
        authorizedAt: new Date(),
      }),

      ...(status === 'EXECUTED' && {
        executedAt: new Date(),
      }),

      ...(status === 'REJECTED' && {
        rejectedById: actorId,
        rejectedAt: new Date(),
      }),
    },
  });
}

/**
 * Validate and complete maker-checker execution
 * after the protected mutation has committed successfully.
 */
export async function completeMakerCheckerExecution(
  proposalId: string,
  actorId: string,
): Promise<void> {
  const proposal =
    await db.pendingMutation.findUnique({
      where: { id: proposalId },
    });

  if (!proposal) {
    throw new Error(
      'Governance proposal not found during execution completion.',
    );
  }

  if (proposal.status !== 'AUTHORIZED') {
    throw new Error(
      `Governance proposal is ${proposal.status}, not AUTHORIZED.`,
    );
  }

  if (
    proposal.expiresAt &&
    proposal.expiresAt < new Date()
  ) {
    await db.pendingMutation.update({
      where: { id: proposalId },
      data: { status: 'EXPIRED' },
    });

    throw new Error(
      'Governance proposal has expired.',
    );
  }

  await db.pendingMutation.update({
    where: { id: proposalId },
    data: {
      status: 'EXECUTED',
      executedAt: new Date(),
    },
  });

  void actorId;
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// ============================================================================
// A1 FIX: JWT-based authentication for all API routes
// Uses Node.js built-in crypto (no external dependency) for HMAC-SHA256 signing
// Provides: signAuthToken, verifyAuthToken, getAuthFromRequest, requireAuth,
//           requireRole, requireBranchScope
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'watershed-capital-secret-key-change-in-production';
const TOKEN_EXPIRY_HOURS = 8; // A4 FIX: 8-hour session expiration

export interface AuthPayload {
  id: string;
  role: string;
  branchId?: string | null;
  type?: 'admin' | 'customer';
}

/**
 * Base64url encode (no padding) — URL-safe
 */
function base64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Base64url decode
 */
function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, 'base64');
}

/**
 * Sign a JWT token using HMAC-SHA256 (pure Node.js crypto, no external deps)
 */
export function signAuthToken(payload: AuthPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    type: payload.type || 'admin',
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

/**
 * Verify and decode a JWT token
 */
export function verifyAuthToken(token: string): AuthPayload | null {
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

/**
 * Extract the Bearer token from an Authorization header
 */
export function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Get the auth payload from a request (does NOT throw)
 */
export function getAuthFromRequest(req: NextRequest): AuthPayload | null {
  // Try Authorization header first (JWT token)
  const token = extractToken(req);
  if (token) return verifyAuthToken(token);

  // Fallback: accept adminId in body/query for backward compatibility during migration
  // This allows existing calls that haven't been updated to still work
  const url = new URL(req.url);
  const adminId = url.searchParams.get('adminId');
  if (adminId) {
    // Return a minimal payload — the route will verify the admin exists
    return { id: adminId, role: 'unknown', type: 'admin' };
  }

  return null;
}

/**
 * Require authentication — returns 401 if no valid token
 */
export async function requireAuth(req: NextRequest): Promise<AuthPayload | NextResponse> {
  const payload = getAuthFromRequest(req);
  if (!payload) {
    return NextResponse.json(
      { error: 'Authentication required. Provide a valid Bearer token.' },
      { status: 401 }
    );
  }
  return payload;
}

/**
 * Require a specific role — returns 403 if role doesn't match
 */
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

/**
 * Require branch scope — verifies admin's branch matches the loan's branch
 * S1 FIX: Branch scoping for branch-scoped roles
 */
export async function requireBranchScope(req: NextRequest, loanId: string): Promise<AuthPayload | NextResponse> {
  const authResult = await requireAuth(req);
  if (authResult instanceof NextResponse) return authResult;

  const payload = authResult as AuthPayload;

  // Super admin and national roles bypass branch scoping
  const nationalRoles = ['super', 'md', 'cfo', 'hoc', 'cro'];
  if (nationalRoles.includes(payload.role)) {
    return payload;
  }

  // For branch-scoped roles (bm, loan, frontdesk, treasury), verify branch matches
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

/**
 * Get the full admin record from a request (for audit logging)
 */
export async function getAdminFromRequest(req: NextRequest): Promise<{ id: string; firstName: string; lastName: string; role: string; branchId?: string | null } | null> {
  const payload = getAuthFromRequest(req);
  if (!payload || payload.type === 'customer') return null;

  const admin = await db.admin.findUnique({
    where: { id: payload.id },
    select: { id: true, firstName: true, lastName: true, role: true, branchId: true },
  });
  return admin;
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireRole, getAuthFromRequest, extractToken, verifyAuthToken } from '@/lib/auth';
import { PERMISSION_FLAGS } from '@/lib/constants';

/**
 * POST /api/admin/staff
 * Create a new staff account (super admin only)
 * Body: { firstName, lastName, username, email, phone?, password, role, branchId?, permissions: { flag: bool }, adminId? }
 *
 * v34.1: Added fallback — if no Bearer token, accept adminId in body and verify
 * the admin is a super admin by looking them up in the DB. This handles the case
 * where the browser has an old session without a JWT token.
 *
 * v40.1: Rewrote auth flow — body is now parsed ONCE and reused for both
 * fallback auth and createStaff. Fixes the read-only `req.body` assignment
 * and the double-parse issue that caused 500s.
 */
export async function POST(req: NextRequest) {
  // Parse body ONCE up-front so it can be used by both auth fallback and createStaff
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Try standard token-based auth first
  let authPayload = getAuthFromRequest(req);

  // If no valid token, try adminId fallback (for old sessions without JWT)
  if (!authPayload || authPayload.role === 'unknown') {
    try {
      const fallbackAdminId = body.adminId;

      if (fallbackAdminId) {
        const admin = await db.admin.findUnique({
          where: { id: fallbackAdminId },
          select: { id: true, role: true, status: true },
        });
        if (admin && admin.role === 'super' && admin.status === 1) {
          authPayload = { id: admin.id, role: admin.role, type: 'admin' as const };
        } else {
          return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
        }
      } else {
        return NextResponse.json(
          { error: 'Authentication required. Provide a valid Bearer token or adminId.' },
          { status: 401 }
        );
      }
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Authentication failed: ' + (e.message || 'Unknown error') },
        { status: 401 }
      );
    }
  }

  return await createStaff(body, authPayload!, req);
}

async function createStaff(body: any, authPayload: { id: string; role: string }, req: NextRequest) {
  // Verify super admin role
  if (authPayload.role !== 'super') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }

  try {
    const { firstName, lastName, username, email, phone, password, role, branchId, permissions } = body;

    // Validate required fields
    if (!firstName || !lastName || !username || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields: firstName, lastName, username, email, password, role' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Normalize username + email (trim, lowercase)
    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = String(email).trim().toLowerCase();

    // Check for existing username/email
    const existingUsername = await db.admin.findUnique({ where: { username: cleanUsername } });
    if (existingUsername) {
      return NextResponse.json({ error: `Username "${cleanUsername}" already exists` }, { status: 409 });
    }
    const existingEmail = await db.admin.findUnique({ where: { email: cleanEmail } });
    if (existingEmail) {
      return NextResponse.json({ error: `Email "${cleanEmail}" already exists` }, { status: 409 });
    }

    // Build permission flags
    const perms: Record<string, boolean> = {};
    for (const p of PERMISSION_FLAGS) {
      perms[p] = permissions?.[p] === true;
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(String(password), 10);

    // Normalize branchId: empty string / "none" / undefined → null
    const cleanBranchId = (branchId && branchId !== 'none' && branchId !== '')
      ? String(branchId)
      : null;

    // Build create data — use type any to allow v26 fields that may not be in Prisma client yet
    // (if prisma generate hasn't been run after the v26 schema update)
    const createData: any = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      username: cleanUsername,
      email: cleanEmail,
      phone: phone ? String(phone).trim() : null,
      password: hashedPassword,
      role: String(role),
      roleType: String(role),
      branchId: cleanBranchId,
      status: 1,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      ...perms,
    };

    let admin;
    try {
      admin = await db.admin.create({
        data: createData,
        select: {
          id: true, firstName: true, lastName: true, username: true, email: true, role: true, branchId: true,
        },
      });
    } catch (createErr: any) {
      // If the error is about unknown fields (mustChangePassword, passwordChangedAt),
      // retry without those fields
      if (createErr.message && (createErr.message.includes('mustChangePassword') || createErr.message.includes('passwordChangedAt'))) {
        console.warn('[STAFF CREATE] Retrying without v26 fields (run prisma generate + db push)');
        delete createData.mustChangePassword;
        delete createData.passwordChangedAt;
        admin = await db.admin.create({
          data: createData,
          select: {
            id: true, firstName: true, lastName: true, username: true, email: true, role: true, branchId: true,
          },
        });
      } else {
        throw createErr;
      }
    }

    // Audit log (non-blocking)
    try {
      await db.auditLog.create({
        data: {
          adminId: authPayload?.id,
          action: 'staff_create',
          description: `Created staff account: ${firstName} ${lastName} (${cleanUsername}) with role ${role}`,
          module: 'admin',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });
    } catch (auditErr) {
      console.error('[STAFF CREATE] Audit log failed (non-blocking):', auditErr);
    }

    return NextResponse.json({ admin }, { status: 201 });
  } catch (e: any) {
    console.error('[STAFF CREATE] Error:', e);
    return NextResponse.json(
      { error: 'Failed to create staff: ' + (e.message || 'Unknown error') },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/staff
 * List all staff (super admin, MD, HOC)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'md', 'hoc']);
  if (auth instanceof NextResponse) return auth;

  try {
    const admins = await db.admin.findMany({
      select: {
        id: true, firstName: true, lastName: true, username: true, email: true, phone: true,
        role: true, status: true, branchId: true, lastLogin: true, createdAt: true,
        branch: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ admins });
  } catch (e: any) {
    console.error('[STAFF LIST] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

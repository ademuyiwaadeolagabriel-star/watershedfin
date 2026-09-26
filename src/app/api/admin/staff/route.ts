import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireRole } from '@/lib/auth';
import { PERMISSION_FLAGS } from '@/lib/constants';

/**
 * POST /api/admin/staff
 * Authorization: Bearer <admin-jwt (role=super)>
 * Body: { firstName, lastName, username, email, phone?, password, role, branchId?, permissions: { flag: bool } }
 *
 * v50 FIX (Issue #27): Removed the `body.adminId` fallback entirely.
 * Identity MUST come from a verified JWT — never from caller-supplied data.
 * The previous fallback allowed any unauthenticated caller to create
 * admin accounts simply by passing `adminId: <known super admin id>`
 * in the request body, because the code looked up the admin by ID
 * without any token verification at all.
 *
 * v50 also removes the `authPayload?.id || body.adminId` pattern from
 * audit logging — actor identity is always the JWT subject.
 */
export async function POST(req: NextRequest) {
  // v50 — auth gate mandatory, no fallback. Only 'super' role allowed.
  const authResult = await requireRole(req, ['super']);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; role: string };

  // Parse body once and reuse.
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  return await createStaff(body, authPayload, req);
}

async function createStaff(body: any, authPayload: { id: string; role: string }, req: NextRequest) {
  // Verify super admin role (defensive — requireRole already checked).
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

    // Build create data
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

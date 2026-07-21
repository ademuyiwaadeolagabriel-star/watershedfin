import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { PERMISSION_FLAGS } from '@/lib/constants';

/**
 * POST /api/admin/staff
 * Create a new staff account (super admin only)
 * Body: { firstName, lastName, username, email, phone?, password, role, branchId?, permissions: { flag: bool } }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
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
      ...perms,
    };

    // Add v26 fields with try/catch — if prisma generate hasn't been run,
    // these fields don't exist in the Prisma client and the create will fail.
    // We add them optimistically; if the create fails, the catch block retries without them.
    try {
      createData.mustChangePassword = false;
      createData.passwordChangedAt = new Date();
    } catch {
      // ignore
    }

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
          adminId: payload?.id,
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

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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check for existing username/email
    const existingUsername = await db.admin.findUnique({ where: { username } });
    if (existingUsername) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }
    const existingEmail = await db.admin.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    // Build permission flags
    const perms: Record<string, boolean> = {};
    for (const p of PERMISSION_FLAGS) {
      perms[p] = permissions?.[p] === true;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const admin = await db.admin.create({
      data: {
        firstName,
        lastName,
        username,
        email,
        phone: phone || null,
        password: hashedPassword,
        role,
        roleType: role,
        branchId: branchId || null,
        status: 1,
        mustChangePassword: false, // Set to true if you want to force password change on first login
        passwordChangedAt: new Date(),
        ...perms,
      },
      select: {
        id: true, firstName: true, lastName: true, username: true, email: true, role: true, branchId: true,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'staff_create',
        description: `Created staff account: ${firstName} ${lastName} (${username}) with role ${role}`,
        module: 'admin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ admin }, { status: 201 });
  } catch (e: any) {
    console.error('Staff create error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/staff
 * List all staff (super admin only)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'md', 'hoc']);
  if (auth instanceof NextResponse) return auth;

  const admins = await db.admin.findMany({
    select: {
      id: true, firstName: true, lastName: true, username: true, email: true, phone: true,
      role: true, status: true, branchId: true, lastLogin: true, createdAt: true,
      branch: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ admins });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { PERMISSION_FLAGS } from '@/lib/constants';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/admin/staff/[id]
 * Returns the admin record (without secrets) with branch + all permission
 * flags + loan counts (assigned, processed, approved).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await db.admin.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        roleType: true,
        status: true,
        branchId: true,
        lastLogin: true,
        lastLoginIp: true,
        createdAt: true,
        branch: { select: { id: true, name: true, code: true, state: true } },
        ...Object.fromEntries(PERMISSION_FLAGS.map((f) => [f, true])),
      },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Loan counts — assigned (loanOfficer), processed (bmValidatedBy),
    // approved (final approval recorded)
    const [assignedLoans, processedLoans, approvedLoans] = await Promise.all([
      db.loanApplicants.count({ where: { staffId: id } }),
      db.loanApplicants.count({ where: { bmValidatedBy: id } }),
      db.loanApplicants.count({
        where: {
          AND: [
            { staffId: id },
            { status: { in: ['running', 'paid'] } },
          ],
        },
      }),
    ]);

    return NextResponse.json({
      admin,
      stats: {
        assignedLoans,
        processedLoans,
        approvedLoans,
      },
    });
  } catch (e: any) {
    console.error('Admin staff detail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/staff/[id]
 * Update staff permissions (super admin only)
 * Body: { permissions: { flag: bool }, ...otherFields }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.admin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.role !== undefined) {
      updateData.role = body.role;
      updateData.roleType = body.role;
    }
    if (body.branchId !== undefined) updateData.branchId = body.branchId || null;
    if (body.status !== undefined) updateData.status = body.status;

    // Permission flags
    if (body.permissions) {
      for (const p of PERMISSION_FLAGS) {
        if (body.permissions[p] !== undefined) {
          updateData[p] = body.permissions[p] === true;
        }
      }
    }

    // Password reset
    if (body.newPassword) {
      if (body.newPassword.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      updateData.password = bcrypt.hashSync(body.newPassword, 10);
      updateData.passwordChangedAt = new Date();
      updateData.mustChangePassword = false;
    }

    const updated = await db.admin.update({
      where: { id },
      data: updateData,
      select: {
        id: true, firstName: true, lastName: true, username: true, email: true, phone: true,
        role: true, status: true, branchId: true,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'staff_update',
        description: `Updated staff account: ${updated.firstName} ${updated.lastName} (${updated.username})`,
        module: 'admin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ admin: updated });
  } catch (e: any) {
    console.error('Staff update error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

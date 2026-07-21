import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * POST /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Changes password for the authenticated admin
 */
export async function POST(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { id: authPayload.id } });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    // Verify current password
    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await db.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'password_changed',
        description: 'Password changed by user',
        module: 'auth',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ ok: true, message: 'Password changed successfully' });
  } catch (e: any) {
    console.error('Change password error:', e);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}

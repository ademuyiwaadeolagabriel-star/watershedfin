import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }
 * Verifies token + sets new password
 */
export async function POST(req: NextRequest) {
  try {
    const { token, newPassword } = await req.json();
    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const admin = await db.admin.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    await db.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'password_reset_completed',
        description: 'Password reset via token',
        module: 'auth',
        severity: 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ ok: true, message: 'Password reset successful. You can now login.' });
  } catch (e: any) {
    console.error('Reset password error:', e);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}

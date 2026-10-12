import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { safeError } from '@/lib/security/errors';

// ============================================================================
// POST /api/auth/reset-password
// Body: { token, newPassword }
//
// v5.1 — P0 #1: Token is now HASHED before comparison.
// The forgot-password route stores SHA-256(token) in the DB.
// This route hashes the submitted token and compares to the stored hash.
// The raw token never touches the database.
//
// v5.1 — Also increments authVersion so all existing JWTs for this admin
// become invalid immediately (not just sessions).
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // v5.1 — Rate limit: 5 reset attempts per 15 min per IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResult = await enforceRateLimit(
      `reset-password:${clientIp}`,
      RATE_LIMITS.PASSWORD_RESET.max,
      RATE_LIMITS.PASSWORD_RESET.windowMs,
    );
    if (rateLimitResult !== true) return rateLimitResult as NextResponse;

    const body = await req.json().catch(() => ({}));
    const { token, newPassword } = body || {};
    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // v5.1 — Hash the submitted token before comparing to DB
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    const admin = await db.admin.findFirst({
      where: {
        passwordResetToken: tokenHash, // compare hash to hash
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // v5.1 — Increment authVersion to invalidate all existing JWTs
    // (not just sessions — the token itself becomes stale)
    await db.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        // v5.1 — increment authVersion to invalidate all existing tokens
        authVersion: { increment: 1 },
      },
    });

    // v54 — Revoke all active sessions
    await db.activeSession.updateMany({
      where: { adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }).catch(() => {});

    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'password_reset_completed',
        description: 'Password reset via token (authVersion incremented)',
        module: 'auth',
        severity: 'warning',
        ipAddress: clientIp,
      },
    });

    return NextResponse.json({ ok: true, message: 'Password reset successful. You can now login.' });
  } catch (e: any) {
    console.error('Reset password error:', e);
    return safeError('Failed to reset password.', 500);
  }
}

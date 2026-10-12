import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { safeError } from '@/lib/security/errors';

// ============================================================================
// POST /api/auth/forgot-password
// Body: { email }
//
// v5.1 — P0 #1: Password reset token is now HASHED before storage.
// The raw token is only in the email link. The DB stores SHA-256(token).
// This prevents a DB dump from exposing valid reset tokens.
//
// v5.1 — P0 #4: Uses distributed rate limiting via enforceRateLimit().
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // v5.1 — Distributed rate limiting (replaces in-memory Map)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResult = await enforceRateLimit(
      `forgot-password:${clientIp}`,
      RATE_LIMITS.PASSWORD_RESET.max,
      RATE_LIMITS.PASSWORD_RESET.windowMs,
    );
    if (rateLimitResult !== true) return rateLimitResult as NextResponse;

    const body = await req.json().catch(() => ({}));
    const { email } = body || {};
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { email: String(email).toLowerCase() } });
    if (!admin) {
      // Don't reveal whether the email exists
      return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
    }

    // Generate reset token (32 bytes = 64 hex chars) — cryptographically secure
    const rawToken = crypto.randomBytes(32).toString('hex');
    // v5.1 — Hash the token before storing. Only the raw token goes in the email.
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.admin.update({
      where: { id: admin.id },
      data: {
        passwordResetToken: tokenHash, // v5.1 — store HASH, not raw token
        passwordResetExpires: expires,
      },
    });

    // Never log raw reset tokens
    console.log(`Password reset link sent for ${admin.email}`);

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Watershed Capital <no-reply@watershedcapital.com>',
        to: admin.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset</h2>
          <p>Hello ${admin.firstName},</p>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not request this, please ignore this email.</p>
          <p>Best regards,<br/>Watershed Capital Team</p>
        `,
      });
    } catch (emailErr) {
      console.error('Email send failed (non-blocking):', emailErr);
    }

    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'password_reset_requested',
        description: `Password reset requested for ${admin.email}`,
        module: 'auth',
        severity: 'warning',
        ipAddress: clientIp,
      },
    });

    return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (e: any) {
    console.error('Forgot password error:', e);
    return safeError('Failed to process request.', 500);
  }
}

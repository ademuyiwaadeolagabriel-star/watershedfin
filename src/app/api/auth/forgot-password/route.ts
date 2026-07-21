import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Generates a reset token + sends email with reset link
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { email } });
    if (!admin) {
      // Don't reveal whether the email exists
      return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
    }

    // Generate reset token (32 bytes = 64 hex chars)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.admin.update({
      where: { id: admin.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expires,
      },
    });

    // Send reset email via Resend (falls back to console.log if not configured)
    console.log(`Password reset link for ${admin.email}: /reset-password?token=${token}`);

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
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
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ ok: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (e: any) {
    console.error('Forgot password error:', e);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}

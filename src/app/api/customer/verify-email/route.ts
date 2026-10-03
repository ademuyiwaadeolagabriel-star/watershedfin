import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email-service';
import { requireCustomerAuth } from '@/lib/auth';

// ============================================================================
// POST /api/customer/verify-email
// Authorization: Bearer <customer-jwt>
//
// v50 FIX (Issue #11): Previously this endpoint generated a 6-digit code
// but never persisted it to `user.verificationCode`, and never actually
// sent the email. The subsequent /verify check therefore always failed
// because `user.verificationCode` was null/empty.
//
// Now:
//   1. Customer identity comes from the JWT — `userId` is no longer
//      accepted from the request body (IDOR fix, Issue #9).
//   2. The generated code is persisted to `user.verificationCode` with
//      a fresh `emailTime` timestamp.
//   3. The email is actually sent via `sendEmail(...)` (fire-and-forget
//      but we await the call so the response reflects delivery status).
//   4. The code is NEVER returned in the API response — only `sentTo`
//      (masked) is returned so the caller knows which inbox to check.
// ============================================================================

function generateCode(): string {
  // v50 — use crypto.randomInt for cryptographically secure codes (vs the
  // previous Math.random() which is not uniform and not secure).
  // Math.random() returns floats that may be biased toward certain ranges
  // when truncated; crypto.randomInt is the correct primitive.
  const { randomInt } = require('crypto');
  return randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id; // v50 — derived from JWT

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!user.email) {
      return NextResponse.json(
        { error: 'User has no email address on file. Please add an email to your profile first.' },
        { status: 400 },
      );
    }

    const code = generateCode();

    // Persist the code AND timestamp atomically.
    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: code,
        emailTime: new Date(),
      },
    });

    // Actually send the email. We attempt delivery and surface a failure
    // as a 502 (so the client can retry) — but we do NOT leak the code.
    const maskedEmail = maskEmail(user.email);
    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Watershed Capital Verification Code',
        text: `Hello ${user.firstName || ''},

Your Watershed Capital verification code is: ${code}

This code will expire in 10 minutes. If you did not request a verification code, please ignore this email — no changes will be made to your account.

— Watershed Capital`,
      });
    } catch (sendErr: any) {
      console.error('[verify-email] sendEmail failed:', sendErr?.message);
      return NextResponse.json(
        { error: 'Failed to send verification email. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: 'Verification code sent to your email.',
      sentTo: maskedEmail,
    });
  } catch (e: any) {
    console.error('Verify-email send error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 4))}@${domain}`;
}

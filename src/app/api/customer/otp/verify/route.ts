import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import crypto from 'crypto';

// ============================================================================
// POST /api/customer/otp/verify
// Authorization: Bearer <customer-jwt>
// Body: { otp }
//
// v50 FIX (Issue #12):
//   - Customer identity comes from the JWT, NOT from `body.userId`.
//     Previously any caller could supply another user's userId and
//     attempt OTPs against that user's record — letting an attacker
//     brute-force OTPs for arbitrary accounts.
//   - Code comparison is now constant-time (timingSafeEqual).
// ============================================================================

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id;

    const body = await req.json().catch(() => ({}));
    const { otp } = body || {};

    if (!otp) {
      return NextResponse.json({ error: 'otp is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.otpRequired === 'off') {
      return NextResponse.json({
        verified: true,
        message: 'OTP already verified for this session.',
      });
    }

    if (!user.verificationCode) {
      return NextResponse.json(
        { error: 'No OTP on file. Please request a new OTP.' },
        { status: 400 },
      );
    }

    // v50 — constant-time comparison of the SHA-256 hash.
    const otpHash = crypto
      .createHash('sha256')
      .update(String(otp).trim() + userId)
      .digest('hex');
    const a = Buffer.from(user.verificationCode);
    const b = Buffer.from(otpHash);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid OTP.' }, { status: 400 });
    }

    if (!user.emailTime || Date.now() - new Date(user.emailTime).getTime() > OTP_TTL_MS) {
      return NextResponse.json(
        { error: 'OTP has expired. Please request a new OTP.' },
        { status: 400 },
      );
    }

    await db.user.update({
      where: { id: userId },
      data: {
        otpRequired: 'off',
        verificationCode: null,
        emailTime: null,
      },
    });

    return NextResponse.json({
      verified: true,
      message: 'OTP verified successfully.',
    });
  } catch (e: any) {
    console.error('OTP verify error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

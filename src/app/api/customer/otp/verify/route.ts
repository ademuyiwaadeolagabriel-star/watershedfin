import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/otp/verify
// Body: { userId, otp }
// Verifies the OTP against user.verificationCode. Codes expire 5 minutes after
// issuance. On success sets user.otpRequired = 'off'.
// ============================================================================

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const { userId, otp } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
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

    if (!user.verificationCode || user.verificationCode !== String(otp).trim()) {
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

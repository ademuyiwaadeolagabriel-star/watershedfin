import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/verify-email/verify
// Body: { userId, code }
// Verifies the 6-digit code against user.verificationCode. Codes expire 10
// minutes after emailTime. On success sets user.emailVerify = 1.
// ============================================================================

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const { userId, code } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.emailVerify === 1) {
      return NextResponse.json({
        verified: true,
        message: 'Email is already verified.',
      });
    }

    if (!user.verificationCode || user.verificationCode !== String(code).trim()) {
      return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
    }

    if (!user.emailTime || Date.now() - new Date(user.emailTime).getTime() > CODE_TTL_MS) {
      return NextResponse.json(
        { error: 'Verification code has expired. Please request a new code.' },
        { status: 400 },
      );
    }

    await db.user.update({
      where: { id: userId },
      data: {
        emailVerify: 1,
        verificationCode: null,
        emailTime: null,
      },
    });

    return NextResponse.json({
      verified: true,
      message: 'Email verified successfully.',
    });
  } catch (e: any) {
    console.error('Verify-email verify error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

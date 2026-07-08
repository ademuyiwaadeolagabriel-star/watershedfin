import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/otp
// Body: { userId }
// Generates a one-time password (OTP) for transaction verification. Stored on
// user.verificationCode with emailTime as the issued-at timestamp.
// Returns { otp } in demo mode (in production it would be sent to the user's
// registered contact and never returned in the response body).
// ============================================================================

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const otp = generateOtp();
    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: otp,
        emailTime: new Date(),
      },
    });

    return NextResponse.json({
      otp,
      message: `Demo mode: your OTP is ${otp}. In production it would be delivered to your verified phone/email.`,
    });
  } catch (e: any) {
    console.error('OTP generate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

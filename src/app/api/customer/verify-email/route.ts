import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/verify-email
// Body: { userId }
// Generates a 6-digit code, stores it on user.verificationCode, sets emailTime
// to now, and returns the code in the response (demo only — in production the
// code would be emailed to the user and never returned in the API response).
// ============================================================================

function generateCode(): string {
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
    if (!user.email) {
      return NextResponse.json(
        { error: 'User has no email address on file. Please add an email to your profile first.' },
        { status: 400 },
      );
    }

    const code = generateCode();
    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: code,
        emailTime: new Date(),
      },
    });

    return NextResponse.json({
      code,
      message: `Demo mode: your email verification code is ${code}. In production, this code would be emailed to ${user.email}.`,
      sentTo: user.email,
    });
  } catch (e: any) {
    console.error('Verify-email send error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

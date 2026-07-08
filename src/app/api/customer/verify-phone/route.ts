import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/verify-phone
// Body: { userId }
// Generates a 6-digit code, stores it on user.verificationCode, sets phoneTime
// to now, and returns the code (demo only — in production this would be SMS'd).
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
    if (!user.phone) {
      return NextResponse.json(
        { error: 'User has no phone number on file. Please add a phone number to your profile first.' },
        { status: 400 },
      );
    }

    const code = generateCode();
    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: code,
        phoneTime: new Date(),
      },
    });

    return NextResponse.json({
      code,
      message: `Demo mode: your phone verification code is ${code}. In production, this code would be sent via SMS to ${user.phone}.`,
      sentTo: user.phone,
    });
  } catch (e: any) {
    console.error('Verify-phone send error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

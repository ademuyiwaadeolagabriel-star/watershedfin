import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSms } from '@/lib/sms-service';
import { requireCustomerAuth } from '@/lib/auth';

// ============================================================================
// POST /api/customer/verify-phone
// Authorization: Bearer <customer-jwt>
//
// v50 FIX (Issue #10): Previously this endpoint generated a 6-digit code
// but never persisted it to `user.verificationCode` and never sent an SMS.
// The subsequent /verify-phone/verify check therefore always failed
// because `user.verificationCode` was null/empty.
//
// Now:
//   1. Customer identity comes from the JWT — `userId` no longer accepted
//      from request body (IDOR fix).
//   2. The generated code is persisted to `user.verificationCode` with a
//      fresh `phoneTime` timestamp.
//   3. The SMS is actually sent via `sendSms(...)`.
//   4. The code is NEVER returned in the API response — only `sentTo`
//      (masked) is returned so the caller knows which number to check.
// ============================================================================

function generateCode(): string {
  // v50 — cryptographically secure code generation.
  const { randomInt } = require('crypto');
  return randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id;

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

    // Persist code + timestamp atomically.
    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: code,
        phoneTime: new Date(),
      },
    });

    // Actually send the SMS.
    const maskedPhone = maskPhone(user.phone);
    try {
      await sendSms({
        to: user.phone,
        message: `Your Watershed Capital verification code is ${code}. It will expire in 10 minutes. Do not share this code with anyone.`,
      });
    } catch (sendErr: any) {
      console.error('[verify-phone] sendSms failed:', sendErr?.message);
      return NextResponse.json(
        { error: 'Failed to send verification SMS. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: `Verification code sent to ${maskedPhone}.`,
      sentTo: maskedPhone,
    });
  } catch (e: any) {
    console.error('Verify-phone send error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 4)}${'*'.repeat(Math.min(phone.length - 4, 6))}`;
}

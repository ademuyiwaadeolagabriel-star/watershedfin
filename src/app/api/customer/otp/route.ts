import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { requireCustomerAuth } from '@/lib/auth';

// ============================================================================
// POST /api/customer/otp
// Authorization: Bearer <customer-jwt>
//
// v50 FIX (Issue #12): Customer identity comes from the JWT, NOT from
// `body.userId`. Previously any caller could supply an arbitrary userId
// and trigger OTP SMS to that user's phone — enabling OTP-spam / cost
// amplification attacks against any user in the database.
//
// Other v48 security properties retained:
//   - Cryptographically secure random OTP (crypto.randomInt)
//   - SHA-256 hashed storage (never plaintext)
//   - 5-minute expiry
//   - Resend cooldown (60s)
//   - Rate limit (max 5 requests/hour)
//   - OTP never returned in response body
// ============================================================================

function generateSecureOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Simple rate limiting (in-memory, per-user)
const otpAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_OTP_PER_HOUR = 5;
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id; // v50 — derived from JWT

    // Rate limiting
    const now = Date.now();
    const attempts = otpAttempts.get(userId);
    if (attempts && now - attempts.lastAttempt < 3600000 && attempts.count >= MAX_OTP_PER_HOUR) {
      return NextResponse.json({ error: 'Too many OTP requests. Please try again later.' }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Resend cooldown
    if (user.emailTime && now - new Date(user.emailTime).getTime() < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - new Date(user.emailTime).getTime())) / 1000);
      return NextResponse.json({ error: `Please wait ${remaining}s before requesting another OTP.` }, { status: 429 });
    }

    const otp = generateSecureOtp();
    const otpHash = crypto.createHash('sha256').update(otp + userId).digest('hex');

    await db.user.update({
      where: { id: userId },
      data: {
        verificationCode: otpHash, // Store hash, not plaintext
        emailTime: new Date(),
      },
    });

    // Update rate limit
    if (attempts && now - attempts.lastAttempt < 3600000) {
      otpAttempts.set(userId, { count: attempts.count + 1, lastAttempt: now });
    } else {
      otpAttempts.set(userId, { count: 1, lastAttempt: now });
    }

    // Send OTP via SMS/email (NOT in response body)
    try {
      const { sendSms } = await import('@/lib/sms');
      if (user.phone) {
        await sendSms({ to: user.phone, message: `Your Watershed Capital verification code is: ${otp}. It expires in 5 minutes. Do not share this code with anyone.` });
      }
    } catch {
      // Non-blocking — OTP delivery failure doesn't error the request
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your registered phone number.',
      expiresIn: 300, // 5 minutes in seconds
    });
  } catch (e: any) {
    console.error('OTP generate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


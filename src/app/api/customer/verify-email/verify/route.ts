import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import crypto from 'crypto';

// ============================================================================
// POST /api/customer/verify-email/verify
// Authorization: Bearer <customer-jwt>
// Body: { code }
//
// v50 FIX (Issue #11 + Issue #9):
//   - Customer identity comes from the JWT, not from `body.userId`. This
//     closes the IDOR where Customer A could supply another user's ID
//     and submit codes against it.
//   - Code comparison is now constant-time (timingSafeEqual) to defeat
//     timing-side-channel attacks on the verification code.
// ============================================================================

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id;

    const body = await req.json().catch(() => ({}));
    const { code } = body || {};

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

    if (!user.verificationCode) {
      return NextResponse.json(
        { error: 'No verification code on file. Please request a new code.' },
        { status: 400 },
      );
    }

    // v50 — constant-time comparison to prevent timing attacks.
    const a = Buffer.from(String(user.verificationCode).trim());
    const b = Buffer.from(String(code).trim());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
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

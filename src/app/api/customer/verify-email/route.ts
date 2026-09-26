import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------------------------------------
    // Authenticate customer
    // -----------------------------------------------------------------------
    const authResult = await requireCustomerAuth(req);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const authPayload = authResult as {
      id: string;
      type: string;
    };

    // Customer identity comes ONLY from the authenticated JWT.
    const userId = authPayload.id;

    // -----------------------------------------------------------------------
    // Read request body
    // -----------------------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const { code } = body || {};

    if (!code) {
      return NextResponse.json(
        { error: 'code is required' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // Load authenticated customer
    // -----------------------------------------------------------------------
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }

    // -----------------------------------------------------------------------
    // Already verified
    // -----------------------------------------------------------------------
    if (user.emailVerify === 1) {
      return NextResponse.json({
        verified: true,
        message: 'Email is already verified.',
      });
    }

    // -----------------------------------------------------------------------
    // Verification code must exist
    // -----------------------------------------------------------------------
    if (!user.verificationCode) {
      return NextResponse.json(
        {
          error:
            'No verification code on file. Please request a new code.',
        },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // Constant-time comparison
    // -----------------------------------------------------------------------
    const expectedCode = Buffer.from(
      String(user.verificationCode).trim(),
    );

    const suppliedCode = Buffer.from(
      String(code).trim(),
    );

    if (
      expectedCode.length !== suppliedCode.length ||
      !crypto.timingSafeEqual(expectedCode, suppliedCode)
    ) {
      return NextResponse.json(
        { error: 'Invalid verification code.' },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // Expiration check
    // -----------------------------------------------------------------------
    if (
      !user.emailTime ||
      Date.now() - new Date(user.emailTime).getTime() > CODE_TTL_MS
    ) {
      return NextResponse.json(
        {
          error:
            'Verification code has expired. Please request a new code.',
        },
        { status: 400 },
      );
    }

    // -----------------------------------------------------------------------
    // Verify email and invalidate code
    // -----------------------------------------------------------------------
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
  } catch (e: unknown) {
    console.error('Verify-email verification error:', e);

    return NextResponse.json(
      {
        error: 'Unable to verify email at this time.',
      },
      { status: 500 },
    );
  }
}
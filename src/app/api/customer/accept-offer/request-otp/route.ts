import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendSms } from '@/lib/sms-service';
import { sendEmail } from '@/lib/email-service';
import crypto from 'crypto';

// ============================================================================
// POST /api/customer/accept-offer/request-otp
// Authorization: Bearer <customer-jwt>
// Body: { loanId }
//
// v54 — Blocker 5: Purpose-bound offer-acceptance OTP.
//
// Generates a 6-digit OTP, hashes it with (userId + loanId + termsHash),
// persists to OfferAcceptanceOtp with 5-minute expiry + attempt-count.
// The OTP is bound to the EXACT terms hash at issuance time — if MD
// changes the terms after the OTP is issued, the hash won't match and
// the acceptance will reject with 409.
//
// Rate-limited: max 3 OTP requests per loan per hour (per user).
// ============================================================================

export async function POST(req: NextRequest) {
  const authResult = await requireCustomerAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; type: string };
  const userId = authPayload.id;

  try {
    const body = await req.json().catch(() => ({}));
    const { loanId } = body || {};
    if (!loanId) {
      return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
    }

    const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }
    if (loan.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: loan does not belong to authenticated customer.' },
        { status: 403 },
      );
    }
    if (loan.currentStep !== 'CUSTOMER_ACCEPTANCE') {
      return NextResponse.json({
        error: `Loan is not ready for acceptance. Current step: ${loan.currentStep}`,
      }, { status: 400 });
    }

    // Verify an ACTIVE MD approval exists.
    const mdApproval = await db.mccDecision.findFirst({
      where: {
        loanApplicantId: loanId,
        approverRole: 'MD',
        status: 'ACTIVE',
        decisionType: 'approved',
      },
    });
    if (!mdApproval) {
      return NextResponse.json(
        { error: 'Cannot request acceptance OTP: no ACTIVE MD approval found.' },
        { status: 409 },
      );
    }

    // Compute the terms hash.
    const acceptedTerms = {
      finalAmount: Number(loan.finalAmount ?? loan.approvedAmount ?? loan.amount ?? 0),
      finalInterestRate: Number(loan.finalInterestRate ?? loan.percent ?? 0),
      finalTenure: Number(loan.finalTenure ?? loan.duration ?? 0),
      finalCcdFeePercent: Number(loan.finalCcdFeePercent ?? 0),
      finalUpfrontFeePercent: Number(loan.finalUpfrontFeePercent ?? 0),
    };
    const termsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(acceptedTerms))
      .digest('hex');

    // Rate limit: max 3 unconsumed OTPs per (loanId, termsHash) per hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtps = await db.offerAcceptanceOtp.count({
      where: {
        loanApplicantId: loanId,
        termsHash,
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentOtps >= 3) {
      return NextResponse.json(
        { error: 'Too many OTP requests for this loan. Please wait before requesting another.' },
        { status: 429 },
      );
    }

    // Generate OTP — cryptographically secure.
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto
      .createHash('sha256')
      .update(otp + userId + loanId + termsHash)
      .digest('hex');

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db.offerAcceptanceOtp.create({
      data: {
        loanApplicantId: loanId,
        userId,
        termsHash,
        otpHash,
        expiresAt,
        maxAttempts: 5,
      },
    });

    // Fetch user for contact info.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, email: true, phone: true },
    });

    // Send OTP via SMS + email (fire-and-forget).
    if (user?.phone) {
      try {
        await sendSms({
          to: user.phone,
          message: `Your Watershed Capital offer acceptance code is ${otp}. It expires in 5 minutes. Do not share this code with anyone. Reference: ${loan.applicationRef}.`,
        });
      } catch (e: any) {
        console.error('[request-otp] SMS send failed:', e?.message);
      }
    }
    if (user?.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Offer Acceptance Code — ${loan.applicationRef}`,
          text: `Hello ${user.firstName || ''},

Your offer acceptance code is: ${otp}

This code will expire in 5 minutes. Use it to accept the loan offer for ${loan.applicationRef}.

If you did not request this code, please ignore this email.

— Watershed Capital`,
        });
      } catch (e: any) {
        console.error('[request-otp] email send failed:', e?.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent to your registered phone and email.',
      expiresIn: 300,
      termsHash, // returned so the client can pass it back on acceptance
    });
  } catch (e: any) {
    console.error('Request OTP error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';

// ============================================================================
// POST /api/customer/accept-offer
// Authorization: Bearer <customer-jwt>
// Body: { loanId, signature: { method?, otp?, signatureData?, signatureType? } }
//
// v52 — IMMUTABLE CUSTOMER ACCEPTANCE EVIDENCE (#31) + MD-TERMS-LOCKED GATE (#32)
//
//   #31 — Customer acceptance now creates a CustomerAcceptanceEvidence row
//   (immutable, @unique on loanApplicantId so one-per-loan is enforced at
//   the DB level). The row captures:
//     - ipAddress (from x-forwarded-for or x-real-ip)
//     - userAgent (from request headers)
//     - signature (typed name OR base64 image)
//     - signatureType ('typed' | 'uploaded')
//     - acceptedTermsHash = SHA-256 of JSON.stringify({
//         finalAmount, finalInterestRate, finalTenure,
//         finalCcdFeePercent, finalUpfrontFeePercent
//       })
//     - offerVersion = 1 (incremented if terms change post-acceptance,
//       which currently is forbidden by #32 below)
//
//   #32 — MD-TERMS-LOCKED GATE: After an MD approval exists (MccDecision
//   with approverRole='MD', status='ACTIVE', decisionType='approved'), the
//   loan's final terms (finalAmount, finalInterestRate, finalTenure,
//   finalCcdFeePercent, finalUpfrontFeePercent) become immutable. Any
//   attempt to change them requires a NEW MD approval that supersedes
//   the prior one — which then re-locks the terms at the new values.
//   The CustomerAcceptanceEvidence.acceptedTermsHash is the tamper-evidence
//   layer: if the loan's final terms ever drift from what the customer
//   signed, the hash won't match and the acceptance is invalid.
//
//   The loan+user+signature creation is atomic (db.$transaction). If the
//   CustomerAcceptanceEvidence row already exists for this loan, the
//   acceptance is treated as idempotent (return prior evidence) instead
//   of creating a duplicate.
// ============================================================================

export async function POST(req: NextRequest) {
  // v51 — customer auth gate: identity derived from JWT.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload = authResult_v51 as { id: string; type: string };
  const userId = authPayload.id; // v52 — derived from JWT, body.userId is ignored

  try {
    const body = await req.json().catch(() => ({}));
    const { loanId, signature } = body || {};
    if (!loanId) {
      return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
    }

    const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // v52 — IDOR fix: the loan's owner MUST be the authenticated customer.
    if (loan.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: loan does not belong to authenticated customer.' },
        { status: 403 },
      );
    }

    // Workflow-state consistency: loan must be at CUSTOMER_ACCEPTANCE step.
    if (loan.currentStep !== 'CUSTOMER_ACCEPTANCE') {
      return NextResponse.json({
        error: `Loan is not ready for acceptance. Current step: ${loan.currentStep}`,
      }, { status: 400 });
    }

    // v52 — #32: verify an ACTIVE MD approval exists before allowing acceptance.
    // The customer cannot accept terms that haven't been finally sanctioned.
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
        {
          error: 'Cannot accept offer: no ACTIVE MD approval found. The MD must record a final approval before the customer can accept.',
        },
        { status: 409 },
      );
    }

    // v52 — #31: build the accepted-terms hash.
    // The hash is over the EXACT terms the customer is accepting. If the
    // loan's finalAmount/rate/tenor changes after acceptance (which #32
    // forbids without a new MD approval), the hash won't match and the
    // acceptance becomes invalid.
    const acceptedTerms = {
      finalAmount: Number(loan.finalAmount ?? loan.approvedAmount ?? loan.amount ?? 0),
      finalInterestRate: Number(loan.finalInterestRate ?? loan.percent ?? 0),
      finalTenure: Number(loan.finalTenure ?? loan.duration ?? 0),
      finalCcdFeePercent: Number(loan.finalCcdFeePercent ?? 0),
      finalUpfrontFeePercent: Number(loan.finalUpfrontFeePercent ?? 0),
    };
    const acceptedTermsHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(acceptedTerms))
      .digest('hex');

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const userAgent = req.headers.get('user-agent') || null;

    // v54 — Blocker 5: GENUINE OTP VERIFICATION.
    // The previous implementation accepted a caller-supplied `signature.otp`
    // string and stored `OTP-verified:${otp}` as evidence — without actually
    // verifying that an OTP was issued, unexpired, unused, or bound to this
    // loan + terms hash. Now: the route requires `body.otp`, looks up the
    // most recent OfferAcceptanceOtp for (loanId, termsHash, consumedAt=null),
    // verifies the hash via crypto.timingSafeEqual, checks expiry, checks
    // attempt-count, and atomically consumes it inside the acceptance
    // transaction.
    const otp = body?.otp;
    if (!otp || String(otp).trim().length !== 6) {
      return NextResponse.json(
        { error: 'A 6-digit OTP is required. Request one at POST /api/customer/accept-offer/request-otp.' },
        { status: 400 },
      );
    }

    const otpRecord = await db.offerAcceptanceOtp.findFirst({
      where: {
        loanApplicantId: loanId,
        termsHash: acceptedTermsHash,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return NextResponse.json(
        {
          error: 'No valid OTP found for this loan + terms hash. Request a new OTP at POST /api/customer/accept-offer/request-otp.',
          termsHash: acceptedTermsHash,
        },
        { status: 404 },
      );
    }

    // Check expiry.
    if (new Date(otpRecord.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'OTP has expired. Request a new OTP at POST /api/customer/accept-offer/request-otp.' },
        { status: 400 },
      );
    }

    // Check attempt count.
    if (otpRecord.attemptCount >= otpRecord.maxAttempts) {
      return NextResponse.json(
        { error: 'OTP max attempts exceeded. Request a new OTP.' },
        { status: 429 },
      );
    }

    // Verify the OTP hash — constant-time comparison.
    const expectedHash = crypto
      .createHash('sha256')
      .update(String(otp).trim() + userId + loanId + acceptedTermsHash)
      .digest('hex');
    const actualHash = otpRecord.otpHash;
    if (
      expectedHash.length !== actualHash.length ||
      !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))
    ) {
      // Increment attempt count + return error.
      await db.offerAcceptanceOtp.update({
        where: { id: otpRecord.id },
        data: { attemptCount: { increment: 1 } },
      });
      return NextResponse.json(
        { error: 'Invalid OTP. Attempt count incremented.', attemptsRemaining: otpRecord.maxAttempts - otpRecord.attemptCount - 1 },
        { status: 400 },
      );
    }

    // OTP is valid. It will be atomically consumed inside the acceptance
    // transaction below (set consumedAt = now, consumedById = userId).

    // v54 — signature handling: the OTP IS the signature evidence now.
    // The previous fallback `'customer-typed-signature'` is removed.
    const signatureData_value = signature?.signatureData
      ? String(signature.signatureData)
      : `OTP-verified:${otpRecord.id}`; // reference the consumed OTP record, not the plaintext
    const signatureType = signature?.signatureType === 'uploaded' ? 'uploaded' : 'typed';

    // v52 — Atomic: CustomerAcceptanceEvidence create + loan update + ApprovalLog + AuditLog.
    // If any write fails, the whole acceptance is rolled back.
    let priorEvidence = await db.customerAcceptanceEvidence.findUnique({
      where: { loanApplicantId: loanId },
    });

    // Idempotency: if an evidence row already exists AND the terms hash matches,
    // return the prior acceptance without re-advancing the workflow.
    if (priorEvidence && priorEvidence.acceptedTermsHash === acceptedTermsHash) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        message: 'Offer already accepted (idempotent replay).',
        evidenceId: priorEvidence.id,
        acceptedAt: priorEvidence.acceptedAt,
      });
    }

    // If a prior evidence exists but the terms hash differs, that means the
    // loan's final terms changed post-acceptance — which #32 forbids. Reject.
    if (priorEvidence && priorEvidence.acceptedTermsHash !== acceptedTermsHash) {
      return NextResponse.json(
        {
          error: 'Loan terms have changed since the prior acceptance. A new MD approval is required to re-issue the offer before the customer can re-accept.',
          priorEvidenceId: priorEvidence.id,
          priorAcceptedTermsHash: priorEvidence.acceptedTermsHash,
          currentAcceptedTermsHash: acceptedTermsHash,
        },
        { status: 409 },
      );
    }

    const result = await db.$transaction(async (tx) => {
      // v54 — Blocker 5: ATOMIC OTP CONSUMPTION. The OTP is marked
      // consumed inside the SAME transaction as the acceptance evidence
      // create. If the evidence create fails, the OTP stays unconsumed
      // (customer can retry). If the OTP consumption fails (e.g. someone
      // else consumed it in a concurrent request), the whole acceptance
      // rolls back.
      const consumedOtp = await tx.offerAcceptanceOtp.updateMany({
        where: {
          id: otpRecord.id,
          consumedAt: null,  // conditional: only if not already consumed
        },
        data: {
          consumedAt: new Date(),
          consumedById: userId,
        },
      });
      if (consumedOtp.count === 0) {
        // OTP was consumed by a concurrent request — abort.
        throw new Error('OTP was already consumed by a concurrent acceptance request.');
      }

      // 1. Create the immutable CustomerAcceptanceEvidence row.
      const evidence = await tx.customerAcceptanceEvidence.create({
        data: {
          loanApplicantId: loanId,
          userId,
          acceptedAt: new Date(),
          ipAddress,
          userAgent,
          signature: signatureData_value,
          signatureType,
          acceptedTermsHash,
          offerVersion: 1,
        },
      });

      // 2. Update loan: stamp acceptance + advance to HOC_SCHEDULING.
      // Build the legacy digitalSignature JSON for backward compat with
      // any code that still reads loan.digitalSignature.
      const signatureJson = {
        method: signature?.method || 'Secure OTP',
        signatory: 'Customer',
        timestamp: new Date().toISOString(),
        ip: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        otpId: signature?.otp || `OTP-${Date.now()}`,
        hash: acceptedTermsHash,
        evidenceId: evidence.id,
        legalCitation: 'Evidence Act and Cybercrimes Act of the Federal Republic of Nigeria',
      };

      await tx.loanApplicants.update({
        where: { id: loanId },
        data: {
          digitalSignature: JSON.stringify(signatureJson),
          acceptedAt: new Date(),
          currentStep: 'HOC_SCHEDULING',
        },
      });

      // 3. ApprovalLog entry — actor = customer (from JWT).
      await tx.approvalLog.create({
        data: {
          loanApplicantId: loanId,
          userId,
          action: 'OFFER_ACCEPTED',
          roleAtTimeOfAction: 'customer',
          comments: 'Customer accepted the offer letter via OTP',
          metadata: JSON.stringify({
            signature: signatureJson,
            evidenceId: evidence.id,
            acceptedTermsHash,
            authSource: 'jwt',
            ipAddress,
            userAgent,
          }),
        },
      });

      // 4. AuditLog entry.
      await tx.auditLog.create({
        data: {
          action: 'updated',
          module: 'loan',
          description: `Customer accepted offer for loan ${loan.applicationRef} (evidence ${evidence.id})`,
          severity: 'info',
          metadata: JSON.stringify({
            loanId,
            userId,
            evidenceId: evidence.id,
            acceptedTermsHash,
            authSource: 'jwt',
          }),
        },
      });

      return { evidence, signatureJson };
    });

    // ── Notifications (fire-and-forget, post-commit) ────────────────────
    try {
      const recipients = new Set<string>();
      const staff = await db.admin.findMany({
        where: {
          OR: [{ role: 'hoc' }, { role: 'super' }, { id: loan.staffId || undefined }].filter(Boolean) as any[],
          status: 1,
        },
        select: { id: true },
      });
      staff.forEach((s) => recipients.add(s.id));

      recipients.forEach((adminId) => {
        void createNotification({
          adminId,
          type: 'offer_ready',
          title: `Customer accepted offer for ${loan.applicationRef}`,
          message: `The customer has accepted the offer letter for loan ${loan.applicationRef} via Secure OTP. The loan is now ready for scheduling and disbursement.`,
          category: 'loan',
          actionLabel: 'View Loan',
          actionView: 'loan-detail',
          actionParams: { loanId },
          metadata: {
            loanId,
            applicationRef: loan.applicationRef,
            userId,
            signatureHash: result.signatureJson.hash,
            evidenceId: result.evidence.id,
          },
        });
      });
    } catch {
      /* non-fatal */
    }

    void createNotification({
      userId,
      type: 'offer_ready',
      title: 'Offer accepted — thank you!',
      message: `Your acceptance for loan ${loan.applicationRef} has been recorded. Our team is now scheduling your disbursement. You'll receive another notification once funds are credited.`,
      category: 'loan',
      actionLabel: 'View Loan',
      actionView: 'customer-loan-breakdown',
      actionParams: { loanId },
      metadata: { loanId, applicationRef: loan.applicationRef, evidenceId: result.evidence.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Offer accepted! Your loan is now being scheduled for disbursement.',
      evidenceId: result.evidence.id,
      acceptedTermsHash,
      signature: result.signatureJson,
      authSource: 'jwt',
    });
  } catch (e: any) {
    console.error('Accept offer error:', e);
    // P2002 = unique constraint violation — duplicate acceptance race.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: true, idempotent: true, message: 'Offer already accepted (race condition).' },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

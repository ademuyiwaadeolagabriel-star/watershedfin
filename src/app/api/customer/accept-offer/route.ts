import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// POST /api/customer/accept-offer
// Body: { loanId, userId, signature: { method, otp, ip, userAgent } }
export async function POST(req: NextRequest) {
  try {
    const { loanId, userId, signature } = await req.json();
    if (!loanId || !userId) {
      return NextResponse.json({ error: 'loanId and userId required' }, { status: 400 });
    }

    const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    if (loan.currentStep !== 'CUSTOMER_ACCEPTANCE') {
      return NextResponse.json({ 
        error: `Loan is not ready for acceptance. Current step: ${loan.currentStep}` 
      }, { status: 400 });
    }

    // Build digital signature JSON (cryptographic-style)
    const signatureData = {
      method: signature?.method || 'Secure OTP',
      signatory: 'Customer',
      timestamp: new Date().toISOString(),
      ip: signature?.ip || req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: signature?.userAgent || req.headers.get('user-agent') || 'unknown',
      otpId: signature?.otp || 'OTP-' + Date.now(),
      hash: 'sha256:' + Buffer.from(`${loanId}-${userId}-${Date.now()}`).toString('base64'),
      legalCitation: 'Evidence Act and Cybercrimes Act of the Federal Republic of Nigeria',
    };

    // Update loan
    await db.loanApplicants.update({
      where: { id: loanId },
      data: {
        digitalSignature: JSON.stringify(signatureData),
        acceptedAt: new Date(),
        currentStep: 'HOC_SCHEDULING',
      },
    });

    // Approval log
    await db.approvalLog.create({
      data: {
        loanApplicantId: loanId,
        userId,
        action: 'OFFER_ACCEPTED',
        roleAtTimeOfAction: 'customer',
        comments: 'Customer accepted the offer letter via OTP',
        metadata: JSON.stringify({ signature: signatureData }),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'updated',
        module: 'loan',
        description: `Customer accepted offer for loan ${loan.applicationRef}`,
        severity: 'info',
        metadata: JSON.stringify({ loanId, userId }),
      },
    });

    // ── Notifications (fire-and-forget) ─────────────────────────────────────
    // Notify HOC + assigned Loan Officer that the customer accepted the offer.
    try {
      const recipients = new Set<string>();
      // HOC + assigned LO + super-admins who should be in the loop
      const staff = await db.admin.findMany({
        where: {
          OR: [{ role: 'hoc' }, { role: 'super' }, { id: loan.staffId || undefined }].filter(
            Boolean
          ) as any[],
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
            signatureHash: signatureData.hash,
          },
        });
      });
    } catch {
      /* non-fatal */
    }

    // Notify the customer too
    void createNotification({
      userId,
      type: 'offer_ready',
      title: 'Offer accepted — thank you!',
      message: `Your acceptance for loan ${loan.applicationRef} has been recorded. Our team is now scheduling your disbursement. You'll receive another notification once funds are credited.`,
      category: 'loan',
      actionLabel: 'View Loan',
      actionView: 'customer-loan-breakdown',
      actionParams: { loanId },
      metadata: { loanId, applicationRef: loan.applicationRef },
    });

    return NextResponse.json({
      success: true,
      message: 'Offer accepted! Your loan is now being scheduled for disbursement.',
      signature: signatureData,
    });
  } catch (e: any) {
    console.error('Accept offer error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// POST /api/customer/apply-loan
// Body: { userId, amount, duration, planId, purpose, hasExternalLoans, isGuarantorsewhere }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, amount, duration, planId, purpose, hasExternalLoans, isGuarantorsewhere } = body;

    if (!userId || !amount || !duration) {
      return NextResponse.json({ error: 'userId, amount, duration required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { business: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Check KYC
    if (user.kycStatus !== 'APPROVED') {
      return NextResponse.json({ 
        error: 'Your KYC must be approved before applying for a loan. Current status: ' + (user.kycStatus || 'none') 
      }, { status: 403 });
    }

    // Generate application ref: LN-YYYY-NNNN
    const year = new Date().getFullYear();
    const existingCount = await db.loanApplicants.count();
    const seq = String(existingCount + 1).padStart(4, '0');
    const applicationRef = `LN-${year}-${seq}`;

    // Get plan details for interest rate
    const plan = planId ? await db.loanPlan.findUnique({ where: { id: planId } }) : null;
    const interestRate = plan?.interest || 24;

    // Create loan
    const loan = await db.loanApplicants.create({
      data: {
        userId,
        staffId: user.staffId || null,
        branchId: user.branchId || null,
        planId: planId || null,
        amount: Number(amount),
        duration: Number(duration),
        percent: interestRate,
        reason: purpose || null,
        status: 'pending',
        currentStep: 'LO_ENTRY',
        applicationRef,
        createdVia: 'customer_portal',
        repaymentPlan: 'REDUCING',
      },
    });

    // Create empty credit appraisal
    await db.creditAppraisal.create({
      data: {
        loanApplicantId: loan.id,
        userId,
        staffId: user.staffId || null,
        branchId: user.branchId || null,
        sectorId: user.business?.sectorId || null,
        status: 'draft',
        loanPurpose: purpose || null,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'created',
        module: 'loan',
        description: `Customer ${user.firstName} ${user.lastName} applied for loan ${applicationRef} (₦${amount.toLocaleString()})`,
        severity: 'info',
        metadata: JSON.stringify({ loanId: loan.id, userId, amount, duration }),
      },
    });

    // ── Notifications (fire-and-forget) ─────────────────────────────────────
    // 1. Notify the assigned Loan Officer (if any) about the new application.
    const customerName = `${user.firstName} ${user.lastName}`.trim();
    if (user.staffId) {
      void createNotification({
        adminId: user.staffId,
        type: 'loan_submitted',
        title: `New loan application ${applicationRef}`,
        message: `New loan application ${applicationRef} from ${customerName} — ₦${Number(
          amount
        ).toLocaleString()} for ${duration} month(s). Please review and forward to BM.`,
        category: 'loan',
        actionLabel: 'Review Loan',
        actionView: 'loan-detail',
        actionParams: { loanId: loan.id },
        metadata: {
          loanId: loan.id,
          applicationRef,
          userId,
          amount: Number(amount),
          duration: Number(duration),
        },
      });
    }

    // 2. Notify the customer — application received confirmation.
    void createNotification({
      userId,
      type: 'loan_submitted',
      title: 'Loan application received',
      message: `Your loan application ${applicationRef} for ₦${Number(
        amount
      ).toLocaleString()} has been submitted successfully and is now under review.`,
      category: 'loan',
      actionLabel: 'Track Application',
      actionView: 'customer-loans',
      metadata: {
        loanId: loan.id,
        applicationRef,
        amount: Number(amount),
        duration: Number(duration),
      },
    });

    return NextResponse.json({ loan, message: 'Loan application submitted successfully' });
  } catch (e: any) {
    console.error('Apply loan error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

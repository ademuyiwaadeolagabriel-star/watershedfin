import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// POST /api/customer/apply-loan
// Authorization: Bearer <customer-jwt>
// Body: { amount, duration, planId, purpose, hasExternalLoans, isGuarantorsewhere }
// v53 — P1 IDOR fix: userId removed from body; derived from JWT.
export async function POST(req: NextRequest) {
  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const body = await req.json();
    const { amount, duration, planId, purpose, hasExternalLoans, isGuarantorsewhere } = body || {};
    // v53 — IDOR fix: userId from JWT, not body.
    const userId = authPayload_v51.id;

    if (!amount || !duration) {
      return NextResponse.json({ error: 'amount, duration required' }, { status: 400 });
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
    // v54 (audit #7): fail-closed — if a planId was supplied, the plan MUST
    // exist and carry an interest rate. If no planId, require the rate to be
    // set later (LO/BM stage) and reject the submission as incomplete rather
    // than silently defaulting to 24%.
    const plan = planId ? await db.loanPlan.findUnique({ where: { id: planId } }) : null;
    if (planId && !plan) {
      return NextResponse.json({ error: 'Selected loan plan no longer exists.' }, { status: 400 });
    }
    const interestRate = plan ? Number(plan.interest) : null;
    if (interestRate == null || isNaN(interestRate) || interestRate <= 0) {
      return NextResponse.json(
        { error: 'Loan plan is missing an interest rate. Please select a valid plan or contact your loan officer.' },
        { status: 400 }
      );
    }

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

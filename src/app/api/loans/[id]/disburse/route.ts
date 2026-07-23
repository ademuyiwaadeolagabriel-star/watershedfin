import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule } from '@/lib/loan-calc';
import { createNotification } from '@/lib/notifications';
import { getAuthFromRequest } from '@/lib/auth';

// POST /api/loans/[id]/disburse
// A1 FIX: Requires Bearer token authentication
// Body: { fundSourceAccount, disbursementNotes }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // A1 FIX: Verify authentication
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required. Provide a valid Bearer token.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { fundSourceAccount, disbursementNotes } = body;

    // A1 FIX: Get adminId from JWT token
    const adminId = authPayload.id;

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    // Check permission
    const canDisburse = admin.role === 'super' || admin.loanDisbursement === true || admin.role === 'cfo' || admin.role === 'treasury';
    if (!canDisburse) {
      return NextResponse.json({ error: 'You do not have disbursement permission' }, { status: 403 });
    }

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { user: { include: { business: true } }, plan: true, appraisal: true },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // Verify loan is at the disbursement step
    if (!['CFO_DISBURSEMENT', 'TREASURY_PAYOUT', 'INTERNAL_CONTROL_CHECK'].includes(loan.currentStep)) {
      return NextResponse.json({
        error: `Loan must be at the disbursement stage. Current step: ${loan.currentStep}`
      }, { status: 400 });
    }

    // v44: Pre-disbursement validation — verify ALL critical compliance conditions (not just INTERNAL_CONTROL_CHECK)
    const pendingConditions = await db.complianceCondition.findMany({
      where: { loanApplicantId: id, status: { not: 'verified' }, priority: 'critical' },
    });
    if (pendingConditions.length > 0) {
      return NextResponse.json({
        error: `Cannot disburse — ${pendingConditions.length} critical condition(s) not verified: ${pendingConditions.map(c => c.title || c.conditionType).join(', ')}`,
      }, { status: 400 });
    }

    // Calculate final terms
    const principal = loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
    const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const ccdPercent = loan.finalCcdFeePercent || 10;
    const upfrontFeePercent = loan.finalUpfrontFeePercent || 1;
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';

    const disbursementDate = new Date();
    const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, disbursementDate, ccdPercent, upfrontFeePercent, 0);

    // Net disbursement (principal - upfront fee - CCD)
    const upfrontFeeAmount = principal * (upfrontFeePercent / 100);
    const ccdAmount = principal * (ccdPercent / 100);
    const netDisbursement = principal - upfrontFeeAmount;

    // Update loan — activate it
    const updatedLoan = await db.loanApplicants.update({
      where: { id },
      data: {
        status: 'running',
        currentStep: 'ACTIVE_MONITORING', // v44: Post-disbursement monitoring (was TREASURY_PAYOUT)
        disbursedAt: disbursementDate,
        disbursementDate,
        disbursedBy: adminId,
        startDate: disbursementDate,
        maturityDate: new Date(disbursementDate.getTime() + tenorMonths * 30 * 24 * 60 * 60 * 1000),
        approvedAmount: principal,
        approvedTenor: tenorMonths,
        approvedDate: disbursementDate,
        fundSourceAccount: fundSourceAccount || 'WFL-OPERATIONS-001',
        auditPassedAt: loan.auditPassedAt || new Date(),
      },
    });

    // Create disbursement transaction
    await db.loanTransaction.create({
      data: {
        loanApplicantId: id,
        type: 'disbursement',
        amount: netDisbursement,
        reference: `DISB-${loan.applicationRef}-${Date.now().toString().slice(-6)}`,
        transactionDate: disbursementDate,
        metadata: JSON.stringify({
          principal,
          upfrontFee: upfrontFeeAmount,
          ccd: ccdAmount,
          netDisbursement,
          fundSourceAccount: fundSourceAccount || 'WFL-OPERATIONS-001',
          disbursedBy: adminId,
          notes: disbursementNotes,
        }),
      },
    });

    // Create repayment schedule entries
    for (const row of calc.schedule) {
      await db.loanRepayment.create({
        data: {
          loanApplicantId: id,
          refId: `${loan.applicationRef}-R${row.month}`,
          dueDate: row.dueDate,
          amountDue: row.installment,
          principalPart: row.principal,
          interestPart: row.interest,
          amountPaid: 0,
          status: 'pending',
        },
      });
    }

    // Create general transaction for the customer
    await db.transactions.create({
      data: {
        userId: loan.userId,
        type: 'loan_disbursement',
        amount: netDisbursement,
        charge: upfrontFeeAmount,
        status: 'success',
        reference: `DISB-${loan.applicationRef}`,
        trxRef: loan.applicationRef,
      },
    });

    // Approval log
    await db.approvalLog.create({
      data: {
        loanApplicantId: id,
        adminId,
        action: 'DISBURSED',
        roleAtTimeOfAction: admin.role,
        comments: disbursementNotes || `Loan disbursed — Net: ₦${netDisbursement.toLocaleString()} (Principal: ₦${principal.toLocaleString()}, Upfront Fee: ₦${upfrontFeeAmount.toLocaleString()})`,
        metadata: JSON.stringify({ principal, netDisbursement, fundSourceAccount }),
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        adminId,
        action: 'disbursed',
        module: 'loan',
        description: `Loan ${loan.applicationRef} disbursed — ₦${netDisbursement.toLocaleString()} to customer`,
        severity: 'info',
        metadata: JSON.stringify({ loanId: id, principal, netDisbursement, fundSourceAccount }),
      },
    });

    // ── Notification (fire-and-forget) ─────────────────────────────────────
    if (loan.userId) {
      void createNotification({
        userId: loan.userId,
        type: 'loan_disbursed',
        title: 'Loan disbursed!',
        message: `Your loan of ₦${Number(principal).toLocaleString()} has been disbursed. Net of fees, ₦${Number(
          netDisbursement
        ).toLocaleString()} has been credited to your account. Your first repayment is due in 30 days.`,
        category: 'loan',
        actionLabel: 'View Loan',
        actionView: 'customer-loan-breakdown',
        actionParams: { loanId: id },
        metadata: {
          loanId: id,
          applicationRef: loan.applicationRef,
          principal,
          netDisbursement,
          upfrontFee: upfrontFeeAmount,
          ccd: ccdAmount,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Loan disbursed successfully! The loan is now active.',
      loan: {
        id: updatedLoan.id,
        status: updatedLoan.status,
        currentStep: updatedLoan.currentStep,
        disbursedAt: updatedLoan.disbursedAt,
        maturityDate: updatedLoan.maturityDate,
      },
      disbursement: {
        principal,
        upfrontFee: upfrontFeeAmount,
        ccd: ccdAmount,
        netDisbursement,
        monthlyInstallment: calc.monthlyInstallment,
        totalRepayment: calc.totalRepayment,
        totalInterest: calc.totalInterest,
        scheduleCount: calc.schedule.length,
      },
    });
  } catch (e: any) {
    console.error('Disbursement error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

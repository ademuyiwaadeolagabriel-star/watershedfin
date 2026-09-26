import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/admin/restructure/[id]
//   PUT — admin approve/reject a restructuring request
//
// v53 — P1 #6 fix: moved here from /api/customer/restructure. The previous
// implementation used requireCustomerAuth (wrong) for what should be an
// admin operation, AND accepted body.adminId (caller-supplied). Now:
//   - requireRole(['super','md','hoc','cro']) — admin auth gate
//   - adminId derived from JWT, not body
//   - rejection requires non-empty adminNotes
//   - all multi-write (LoanRestructuring.update + LoanApplicants.update +
//     AuditLog.create) wrapped in db.$transaction
// ============================================================================

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v53 — admin auth gate.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;
  const authPayload = authResult_v53 as { id: string; role: string };
  // v53 — adminId derived from JWT, not body.
  const adminId = authPayload.id;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, adminNotes } = body || {};

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be either "approved" or "rejected"' },
        { status: 400 },
      );
    }
    // v53 — rejection requires non-empty reason (#22 from governance audit).
    if (status === 'rejected' && (!adminNotes || String(adminNotes).trim().length === 0)) {
      return NextResponse.json(
        { error: 'A non-empty adminNotes/reason is required for rejection.' },
        { status: 400 },
      );
    }

    const existing = await db.loanRestructuring.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Restructuring request not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Request already ${existing.status}` },
        { status: 400 },
      );
    }

    // v53 — atomic: restructure update + loan update (if approved) + audit log.
    const updated = await db.$transaction(async (tx) => {
      const r = await tx.loanRestructuring.update({
        where: { id },
        data: {
          status,
          adminId,
          adminNotes: adminNotes?.trim() || null,
        },
      });

      // If approved, apply the new tenor on the loan
      if (status === 'approved') {
        const newTenor = existing.requestedTenor;
        const loan = await tx.loanApplicants.findUnique({
          where: { id: existing.loanApplicantId },
          // v54 (audit #45) — select the fields needed to regenerate the
          // repayment schedule. The previous select was missing amount/rate/
          // method, which is why the schedule was never regenerated.
          select: {
            startDate: true,
            disbursedAt: true,
            applicationRef: true,
            amount: true,
            approvedAmount: true,
            finalAmount: true,
            percent: true,
            finalInterestRate: true,
            repaymentPlan: true,
          },
        });
        const baseDate = loan?.startDate || loan?.disbursedAt || new Date();
        const newMaturity = new Date(baseDate);
        newMaturity.setMonth(newMaturity.getMonth() + newTenor);

        await tx.loanApplicants.update({
          where: { id: existing.loanApplicantId },
          data: {
            finalTenure: newTenor,
            maturityDate: newMaturity,
          },
        });

        // v54 (audit #45) — regenerate the LoanRepayment schedule based on
        // the new tenor. We DO NOT touch LoanTransaction rows (they represent
        // actual payments received and must be preserved for audit/ledger
        // integrity). The historical payments will be re-allocated to the
        // new schedule by the overdue engine / future payment routes.
        const principal =
          Number(loan?.finalAmount || loan?.approvedAmount || loan?.amount) || 0;
        const rate =
          Number(loan?.finalInterestRate) || Number(loan?.percent) || 0;
        const method =
          (loan?.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
        const startDate = loan?.startDate || loan?.disbursedAt || new Date();

        if (principal > 0 && newTenor > 0 && rate > 0) {
          const { calculateLoanSchedule } = await import('@/lib/loan-calc');
          const schedule = calculateLoanSchedule(
            principal,
            rate,
            newTenor,
            method,
            startDate,
          );

          // Delete old schedule rows (LoanTransaction rows are untouched).
          await tx.loanRepayment.deleteMany({
            where: { loanApplicantId: existing.loanApplicantId },
          });

          // Create new schedule rows.
          for (const row of schedule.schedule) {
            await tx.loanRepayment.create({
              data: {
                loanApplicantId: existing.loanApplicantId,
                refId: `${loan?.applicationRef || existing.loanApplicantId}-R${row.month}`,
                dueDate: row.dueDate,
                amountDue: row.installment,
                principalPart: row.principal,
                interestPart: row.interest,
                amountPaid: 0,
                status: 'pending',
              },
            });
          }
        } else {
          // v54 (audit #45) — fail loudly if we cannot regenerate. Missing
          // rate/principal/tenor at approval time is a data-integrity bug,
          // not a silent-skip case.
          console.error(
            '[restructure] Cannot regenerate schedule — missing principal/rate/tenor',
            {
              loanApplicantId: existing.loanApplicantId,
              principal,
              rate,
              newTenor,
            },
          );
          throw new Error(
            'Restructuring approval failed: loan is missing principal, interest rate, or tenor — cannot regenerate repayment schedule.',
          );
        }
      }

      await tx.auditLog.create({
        data: {
          action: status === 'approved' ? 'approved' : 'rejected',
          module: 'restructure',
          description: `Admin ${adminId} (JWT) ${status} restructuring request ${id}`,
          severity: status === 'approved' ? 'info' : 'warning',
          metadata: JSON.stringify({ adminId, restructuringId: id, status, authSource: 'jwt' }),
        },
      });

      return r;
    });

    // Notify the customer — fire-and-forget, post-commit
    void createNotification({
      userId: existing.userId,
      type: 'restructure_decision',
      title: `Restructuring ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message:
        status === 'approved'
          ? `Your loan restructuring request has been approved. New tenor: ${existing.requestedTenor} months. ${adminNotes ? `Notes: ${adminNotes}` : ''}`
          : `Your loan restructuring request was rejected. ${adminNotes ? `Reason: ${adminNotes}` : 'Please contact your Loan Officer for more details.'}`,
      category: 'loan',
      actionLabel: 'View Loan',
      actionView: 'customer-loan-breakdown',
      actionParams: { loanId: existing.loanApplicantId },
    });

    return NextResponse.json({ restructuring: updated });
  } catch (e: any) {
    console.error('Admin restructure PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

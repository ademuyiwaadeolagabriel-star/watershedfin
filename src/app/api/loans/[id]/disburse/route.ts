import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule } from '@/lib/loan-calc';
import { createNotification } from '@/lib/notifications';
import { getAuthFromRequest } from '@/lib/auth';
import { postJournal } from '@/lib/accounting';

// POST /api/loans/[id]/disburse
// A1 FIX: Requires Bearer token authentication
// Body: { fundSourceAccount, disbursementNotes }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // A1 FIX: Verify authentication
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required. Provide a valid Bearer token.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { fundSourceAccount, disbursementNotes, secondApproval } = body;

    // A1 FIX: Get adminId from JWT token
    const adminId = authPayload.id;

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    // Check permission
    const canDisburse = admin.role === 'super' || admin.loanDisbursement === true || admin.role === 'cfo' || admin.role === 'treasury';
    if (!canDisburse) {
      return NextResponse.json({ error: 'You do not have disbursement permission' }, { status: 403 });
    }

    // v49: 4-EYES DUAL CONTROL — disbursement requires TWO approvers
    // The first approver initiates, the second confirms.
    const isSecondApprover = secondApproval === true;

    if (!isSecondApprover) {
      // First approval — record it and wait for second
      // Check if there's already a first approval
      const existingApproval = await db.approvalLog.findFirst({
        where: {
          loanApplicantId: id,
          action: 'DISBURSE_INITIATED',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!existingApproval) {
        // This is the first approval — record it
        await db.approvalLog.create({
          data: {
            loanApplicantId: id,
            adminId: adminId,
            action: 'DISBURSE_INITIATED',
            roleAtTimeOfAction: admin.role,
            comments: body.disbursementNotes || 'First approval — awaiting second approver',
            metadata: JSON.stringify({ firstApprover: adminId, firstApproverRole: admin.role }),
          },
        });

        return NextResponse.json({
          success: false,
          message: 'Disbursement initiated. A second approver must confirm to complete the disbursement.',
          needsSecondApproval: true,
          firstApprover: `${admin.firstName} ${admin.lastName} (${admin.role})`,
        });
      }

      // There's already a first approval but this isn't marked as second approval
      // Check if the first approver is the same person (can't approve twice)
      if (existingApproval.adminId === adminId) {
        return NextResponse.json({
          error: 'You already initiated this disbursement. A different approver must confirm.',
        }, { status: 403 });
      }

      // Different admin but didn't set secondApproval flag
      return NextResponse.json({
        success: false,
        message: 'A disbursement was already initiated by another approver. Send secondApproval: true to confirm.',
        needsSecondApproval: true,
        firstApproverId: existingApproval.adminId,
      });
    }

    // Second approval — verify first approval exists from a different admin
    const firstApproval = await db.approvalLog.findFirst({
      where: {
        loanApplicantId: id,
        action: 'DISBURSE_INITIATED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!firstApproval) {
      return NextResponse.json({
        error: 'No disbursement initiation found. First approver must initiate before second can confirm.',
      }, { status: 400 });
    }

    if (firstApproval.adminId === adminId) {
      return NextResponse.json({
        error: 'You cannot be both the first and second approver (4-eyes principle).',
      }, { status: 403 });
    }

    // v49: Both approvals verified — proceed with disbursement

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
    // v51 — Decimal arithmetic: wrap each Decimal field with Number()
    // so the resulting values are plain numbers (not number | Decimal).
    const principal = Number(loan.finalAmount) || Number(loan.vettedAmount) || Number(loan.approvedAmount) || Number(loan.amount);
    const tenorMonths = Number(loan.finalTenure) || Number(loan.vettedDuration) || Number(loan.approvedTenor) || Number(loan.duration);
    const annualRate = Number(loan.finalInterestRate) || Number(loan.percent); // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
    const ccdPercent = Number(loan.finalCcdFeePercent); // v53-P3: removed || 10 fallback
      if (ccdPercent == null || isNaN(Number(ccdPercent))) {
        return NextResponse.json({ error: "Loan is missing finalCcdFeePercent." }, { status: 400 });
      }
    const upfrontFeePercent = Number(loan.finalUpfrontFeePercent); // v53-P3: removed || 1 fallback
      if (upfrontFeePercent == null || isNaN(Number(upfrontFeePercent))) {
        return NextResponse.json({ error: "Loan is missing finalUpfrontFeePercent." }, { status: 400 });
      }
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';

    const disbursementDate = new Date();
    const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, disbursementDate, ccdPercent, upfrontFeePercent, 0);

    // Net disbursement (principal - upfront fee - CCD)
    const upfrontFeeAmount = principal * (upfrontFeePercent / 100);
    const ccdAmount = principal * (ccdPercent / 100);
    // v48 FIX: Net disbursement must subtract CCD (was missing)
    const netDisbursement = principal - upfrontFeeAmount - ccdAmount;

    // v48 FIX (Data-2): Wrap entire disbursement in a database transaction
    // v48 FIX (Data-3): Use setMonth for maturity date (matches schedule calculation)
    const maturityDate = new Date(disbursementDate);
    maturityDate.setMonth(maturityDate.getMonth() + tenorMonths);

    const result = await db.$transaction(async (tx) => {
      // Update loan — activate it
      const updatedLoan = await tx.loanApplicants.update({
        where: { id },
        data: {
          status: 'running',
          currentStep: 'ACTIVE_MONITORING',
          disbursedAt: disbursementDate,
          disbursementDate,
          disbursedBy: adminId,
          startDate: disbursementDate,
          maturityDate, // v48: Uses setMonth, matching the schedule's date calculation
          approvedAmount: principal,
          approvedTenor: tenorMonths,
          approvedDate: disbursementDate,
          fundSourceAccount: fundSourceAccount || 'WFL-OPERATIONS-001',
          auditPassedAt: loan.auditPassedAt || new Date(),
        },
      });

      // Create disbursement transaction
      await tx.loanTransaction.create({
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
        await tx.loanRepayment.create({
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
      await tx.transactions.create({
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
      await tx.approvalLog.create({
        data: {
          loanApplicantId: id,
          adminId,
          action: 'DISBURSED',
          roleAtTimeOfAction: admin.role,
          comments: disbursementNotes || `Loan disbursed — Net: ₦${netDisbursement.toLocaleString()} (Principal: ₦${principal.toLocaleString()}, Upfront Fee: ₦${upfrontFeeAmount.toLocaleString()})`,
          metadata: JSON.stringify({ principal, netDisbursement, fundSourceAccount }),
        },
      });

      // v53-P4 (audit #47) — GL journal entry for the disbursement.
      // Previously the route created the LoanTransaction + Transactions +
      // LoanRepayment rows but never posted a matching JournalEntry to the
      // General Ledger. Over time the loan subledger and GL would diverge
      // (loan subledger says ₦X disbursed; GL loan-receivable account still
      // shows ₦0).
      //
      // Now we post a balanced GL entry:
      //   Dr Loan Receivable (asset)  — principal
      //   Cr Bank / Cash   (asset)    — principal
      // The principal is the gross loan amount (finalAmount); the upfront
      // fee + CCD are revenue/fee recognitions that have their own posting
      // paths and are NOT netted here, so the GL loan-receivable balance
      // exactly tracks the outstanding principal in the loan subledger.
      //
      // postJournal is invoked with the caller's `tx` so the JE + balance
      // updates join this same transaction — if the GL write fails, the
      // entire disbursement rolls back (no LoanTransaction, no schedule,
      // no Transactions row).
      try {
        // Resolve the GL accounts inside the transaction. Look up by code
        // first (deterministic), fall back to name/subType match.
        const loanRecAcc =
          (await tx.chartOfAccount.findUnique({ where: { code: '1200' } })) ??
          (await tx.chartOfAccount.findFirst({
            where: { name: { contains: 'Loans Receivable', mode: 'insensitive' } },
          }));
        const bankAcc =
          (await tx.chartOfAccount.findUnique({ where: { code: '1020' } })) ??
          (await tx.chartOfAccount.findFirst({
            where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] },
          }));

        // v54 — Blocker 3: missing GL accounts are FATAL (audit #9).
        // Previously the if/else logged but didn't throw — the disbursement
        // would commit without a journal entry, causing loan subledger to
        // diverge from GL. Now: throw inside the transaction → entire
        // disbursement rolls back. The COA must be configured before any
        // disbursement can proceed.
        if (!loanRecAcc || !bankAcc) {
          throw new Error(
            `Disbursement aborted — required GL accounts not found. ` +
              `loanReceivable=${loanRecAcc ? 'found' : 'MISSING (expected COA code 1200 or subType="loan_receivable")'}, ` +
              `bank=${bankAcc ? 'found' : 'MISSING (expected COA subType "bank" or "cash")'}. ` +
              `Configure the Chart of Accounts before disbursement can proceed.`,
          );
        }
        await postJournal(
          {
            date: disbursementDate,
            description: `Loan disbursement — ${loan.applicationRef}`,
            items: [
              { accountId: loanRecAcc.id, debit: principal, credit: 0 },
              { accountId: bankAcc.id, debit: 0, credit: principal },
            ],
            createdById: adminId,
            sourceType: 'loan_disbursement',
            sourceId: id,
            metadata: {
              loanId: id,
              applicationRef: loan.applicationRef,
              principal,
              netDisbursement,
              fundSourceAccount: fundSourceAccount || 'WFL-OPERATIONS-001',
              reference: `${loan.applicationRef}-DISBURSEMENT`,
            },
          },
          tx,
        );
      } catch (jeErr: any) {
        // FATAL — wrap and re-throw so the outer $transaction rolls back.
        console.error(`[disburse] GL journal post failed for ${loan.applicationRef}:`, jeErr);
        throw new Error(`GL journal post failed: ${jeErr?.message || String(jeErr)}`);
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'disbursed',
          module: 'loan',
          description: `Loan ${loan.applicationRef} disbursed — ₦${netDisbursement.toLocaleString()} to customer`,
          severity: 'info',
          metadata: JSON.stringify({ loanId: id, principal, netDisbursement, fundSourceAccount }),
        },
      });

      return updatedLoan;
    });

    const updatedLoan = result;

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

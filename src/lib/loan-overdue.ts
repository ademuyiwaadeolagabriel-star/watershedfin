// ============================================================================
// LOAN OVERDUE & NPL HELPERS — shared by cron jobs (payment reminders,
// auto-NPL classification) and any other code that needs to know how far
// past due a running loan has slipped.
// ============================================================================
//
// The platform has two sources of repayment truth:
//   1. `LoanRepayment` rows — pre-computed instalment schedule persisted at
//      disbursement. Each row has a dueDate, amountDue and amountPaid.
//   2. `LoanTransaction` rows of type `repayment` — actual payments made by
//      the customer.
//
// We reconcile both: the first instalment whose amountPaid < amountDue and
// whose dueDate is in the past defines the loan's "daysOverdue" anchor.
// ============================================================================

import { db } from '@/lib/db';
import { classifyNPL, NPL_CLASSIFICATIONS } from '@/lib/constants';

export interface LoanOverdueAssessment {
  loanId: string;
  applicationRef: string | null;
  userId: string;
  daysOverdue: number;
  nplClassification: keyof typeof NPL_CLASSIFICATIONS;
  totalOverdueAmount: number;
  nextDueRepaymentId: string | null;
  nextDueDate: Date | null;
  nextDueAmount: number | null;
  isDefaulter: boolean;
}

/**
 * Compute the overdue/NPL assessment for a single loan.
 *
 * Falls back gracefully when no LoanRepayment rows exist by computing the
 * schedule from the loan's stored terms via calculateLoanSchedule.
 */
export async function assessLoanOverdue(
  loanId: string,
): Promise<LoanOverdueAssessment | null> {
  const loan = await db.loanApplicants.findUnique({
    where: { id: loanId },
    include: {
      loanRepayments: { orderBy: { dueDate: 'asc' } },
    },
  });
  if (!loan) return null;

  let repayments = loan.loanRepayments;

  // If no LoanRepayment rows exist yet (legacy / pre-schedule loans),
  // synthesise a schedule on-the-fly from the loan's stored terms so the
  // reminder/NPL logic still works.
  if (repayments.length === 0) {
    const { calculateLoanSchedule } = await import('@/lib/loan-calc');
    const principal =
      loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
    const tenorMonths =
      loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const repaymentMethod =
      (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || loan.disbursementDate || new Date();
    const calc = calculateLoanSchedule(
      principal,
      annualRate,
      tenorMonths,
      repaymentMethod,
      startDate,
      0,
      0,
      0,
    );
    repayments = calc.schedule.map((row, i) => ({
      id: `synthetic-${loan.id}-${i}`,
      loanApplicantId: loan.id,
      refId: null,
      dueDate: row.dueDate,
      amountDue: row.installment,
      principalPart: row.principal,
      interestPart: row.interest,
      feePart: null,
      amountPaid: 0,
      status: 'pending',
      paidAt: null,
      paymentMethod: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as any;
  }

  const now = new Date();
  // Normalise to midnight to keep day arithmetic clean.
  now.setHours(0, 0, 0, 0);

  // Total overdue amount = sum of (amountDue - amountPaid) for every
  // instalment whose dueDate is in the past and not fully paid.
  let totalOverdueAmount = 0;
  let earliestPastDueDate: Date | null = null;
  for (const r of repayments) {
    const due = new Date(r.dueDate);
    due.setHours(0, 0, 0, 0);
    const outstanding = (r.amountDue || 0) - (r.amountPaid || 0);
    if (due <= now && outstanding > 0.5) {
      totalOverdueAmount += outstanding;
      if (!earliestPastDueDate || due < earliestPastDueDate) {
        earliestPastDueDate = due;
      }
    }
  }

  const daysOverdue =
    earliestPastDueDate != null
      ? Math.floor(
          (now.getTime() - earliestPastDueDate.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  // Next due (upcoming, not yet fully paid) repayment
  const nextDue = repayments.find((r) => {
    const due = new Date(r.dueDate);
    due.setHours(0, 0, 0, 0);
    const outstanding = (r.amountDue || 0) - (r.amountPaid || 0);
    return outstanding > 0.5 && due >= now;
  });

  return {
    loanId: loan.id,
    applicationRef: loan.applicationRef,
    userId: loan.userId,
    daysOverdue,
    nplClassification: classifyNPL(daysOverdue),
    totalOverdueAmount,
    nextDueRepaymentId: nextDue?.id ?? null,
    nextDueDate: nextDue ? new Date(nextDue.dueDate) : null,
    nextDueAmount: nextDue ? nextDue.amountDue : null,
    isDefaulter: daysOverdue > 30,
  };
}

/**
 * Compute the "days until due" for the next upcoming instalment.
 * Positive → days until due; 0 → due today; negative → already overdue.
 */
export function daysUntilDue(dueDate: Date, now: Date = new Date()): number {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const ref = new Date(now);
  ref.setHours(0, 0, 0, 0);
  return Math.floor(
    (due.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Has a reminder of the given bucket already been sent for this loan + due
 * date + bucket today? We use AuditLog metadata as the source of truth to
 * keep the system cron-safe and idempotent.
 */
export async function reminderAlreadySentToday(params: {
  loanId: string;
  repaymentId?: string | null;
  bucket: string; // e.g. "3d_before", "1d_before", "due_today", "1d_after", "7d_after"
}): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const meta = JSON.stringify({
    loanId: params.loanId,
    repaymentId: params.repaymentId ?? null,
    bucket: params.bucket,
  });

  const existing = await db.auditLog.findFirst({
    where: {
      module: 'communication',
      action: 'sent_reminder',
      createdAt: { gte: startOfDay, lt: endOfDay },
      // AuditLog.metadata is stored as JSON string — exact match is sufficient
      // because we always serialise keys in the same order.
      metadata: meta,
    },
    select: { id: true },
  });
  return !!existing;
}

export async function recordReminderSent(params: {
  loanId: string;
  repaymentId?: string | null;
  bucket: string;
  channel: 'sms' | 'email' | 'in_app' | 'staff_notify';
  recipient?: string;
  description: string;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      action: 'sent_reminder',
      module: 'communication',
      description: params.description,
      severity: params.bucket === '7d_after' ? 'critical' : 'info',
      metadata: JSON.stringify({
        loanId: params.loanId,
        repaymentId: params.repaymentId ?? null,
        bucket: params.bucket,
        channel: params.channel,
        recipient: params.recipient ?? null,
      }),
    },
  });
}

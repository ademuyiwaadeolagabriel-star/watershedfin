// ============================================================================
// LOAN CALCULATOR — repayment schedule, early payoff, payment logic
// ============================================================================

export interface ScheduleRow {
  month: number;
  dueDate: Date;
  openingBalance: number;
  installment: number;
  interest: number;
  principal: number;
  closingBalance: number;
  status: 'upcoming' | 'due' | 'paid' | 'overdue' | 'partial';
  amountPaid: number;
}

export interface LoanCalculation {
  principal: number;
  annualRate: number;          // % p.a.
  monthlyRate: number;         // decimal
  tenorMonths: number;
  repaymentMethod: 'REDUCING' | 'FLAT';
  monthlyInstallment: number;
  totalRepayment: number;
  totalInterest: number;
  ccdAmount: number;           // Credit Confirmation Deposit
  upfrontFeeAmount: number;
  adminFeeAmount: number;
  netDisbursement: number;     // what the borrower actually receives
  totalCostOfCredit: number;   // total interest + fees
  effectiveAPR: number;        // annual percentage rate including fees
  schedule: ScheduleRow[];
}

/**
 * Calculate full loan schedule (reducing balance or flat)
 */
/** Add calendar months while clamping day-of-month to the target month's last day. */
export function addMonthsClamped(startDate: Date, months: number): Date {
  const result = new Date(startDate);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

export function calculateLoanSchedule(
  principal: number,
  annualRatePercent: number,
  tenorMonths: number,
  repaymentMethod: 'REDUCING' | 'FLAT' = 'REDUCING',
  startDate: Date = new Date(),
  ccdPercent: number = 0,
  upfrontFeePercent: number = 0,
  adminFeePercent: number = 0,
): LoanCalculation {
  // v48 FIX (P0-16): Always treat rate as annual percentage and divide by 12.
  // Previous code treated rates ≤20 as monthly percentages, which meant 18% annual
  // became 18% MONTHLY (216% APR) — a massive financial miscalculation.
  // All rates in the system are now annual percentages (e.g., 24 = 24% p.a.)
  const monthlyRate = annualRatePercent / 100 / 12;

  let monthlyInstallment: number;
  let schedule: ScheduleRow[] = [];

  if (repaymentMethod === 'FLAT') {
    // Flat: equal principal + flat interest on original principal
    const monthlyPrincipal = principal / tenorMonths;
    const monthlyInterest = principal * monthlyRate;
    monthlyInstallment = monthlyPrincipal + monthlyInterest;

    let balance = principal;
    for (let i = 1; i <= tenorMonths; i++) {
      const dueDate = addMonthsClamped(startDate, i);
      const newBalance = balance - monthlyPrincipal;
      schedule.push({
        month: i,
        dueDate,
        openingBalance: balance,
        installment: monthlyInstallment,
        interest: monthlyInterest,
        principal: monthlyPrincipal,
        closingBalance: Math.max(0, newBalance),
        status: 'upcoming',
        amountPaid: 0,
      });
      balance = newBalance;
    }
  } else {
    // Reducing balance (annuity / amortization)
    if (monthlyRate === 0) {
      monthlyInstallment = principal / tenorMonths;
    } else {
      monthlyInstallment = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenorMonths)) /
                           (Math.pow(1 + monthlyRate, tenorMonths) - 1);
    }

    let balance = principal;
    for (let i = 1; i <= tenorMonths; i++) {
      const dueDate = addMonthsClamped(startDate, i);
      const interest = balance * monthlyRate;
      const principalPart = monthlyInstallment - interest;
      const newBalance = balance - principalPart;
      schedule.push({
        month: i,
        dueDate,
        openingBalance: balance,
        installment: monthlyInstallment,
        interest,
        principal: principalPart,
        closingBalance: Math.max(0, newBalance),
        status: 'upcoming',
        amountPaid: 0,
      });
      balance = newBalance;
    }
  }

  const totalRepayment = monthlyInstallment * tenorMonths;
  const totalInterest = totalRepayment - principal;

  // Fees
  const ccdAmount = principal * (ccdPercent / 100);
  const upfrontFeeAmount = principal * (upfrontFeePercent / 100);
  const adminFeeAmount = principal * (adminFeePercent / 100);

  // v48 FIX (Calc-2): CCD IS deducted from net disbursement (was missing).
  // Net disbursement = principal - upfront fee - CCD - admin fee
  // CCD is held as a deposit (refundable at loan closure) but NOT disbursed to borrower.
  const netDisbursement = principal - upfrontFeeAmount - ccdAmount - adminFeeAmount;

  // Total cost of credit = total interest + fees (non-refundable)
  const totalCostOfCredit = totalInterest + upfrontFeeAmount + adminFeeAmount;

  // Effective APR (annualized cost including fees)
  // Simple approximation: (totalCostOfCredit / principal) / tenorYears * 100
  const tenorYears = tenorMonths / 12;
  const effectiveAPR = tenorYears > 0 ? (totalCostOfCredit / principal / tenorYears) * 100 : 0;

  return {
    principal,
    annualRate: annualRatePercent,
    monthlyRate,
    tenorMonths,
    repaymentMethod,
    monthlyInstallment,
    totalRepayment,
    totalInterest,
    ccdAmount,
    upfrontFeeAmount,
    adminFeeAmount,
    netDisbursement,
    totalCostOfCredit,
    effectiveAPR,
    schedule,
  };
}

/**
 * Calculate the repayment schedule for the Capital Contribution Deposit (CCD).
 *
 * The CCD amount is the deposit the customer is required to leave on account
 * as a condition of the loan. For repayment-scheduling purposes it is treated
 * as a separate reducing-balance loan at the same annual interest rate as the
 * parent facility — i.e. it carries its own amortisation schedule over the
 * same tenor, with no CCD / upfront / admin fees (those were already charged
 * on the parent loan).
 *
 * @param ccdAmount    The CCD principal amount (₦).
 * @param annualRate   The annual interest rate (%, same as the parent loan).
 * @param tenorMonths  Tenor in months (same as the parent loan).
 * @param startDate    Disbursement / schedule start date (defaults to today).
 * @returns A {@link LoanCalculation} for the CCD portion.
 */
export function calculateCcdLoanSchedule(
  ccdAmount: number,
  annualRate: number,
  tenorMonths: number,
  startDate: Date = new Date(),
): LoanCalculation {
  // v46: CCD is a DEPOSIT, not a loan — it should NOT accrue interest.
  // The installment is simply ccdAmount / tenorMonths (straight-line).
  // Previously this called calculateLoanSchedule() with REDUCING which
  // incorrectly applied PMT interest, inflating the installment.
  const monthlyInstallment = tenorMonths > 0 ? ccdAmount / tenorMonths : ccdAmount;

  const schedule: ScheduleRow[] = [];
  let balance = ccdAmount;
  for (let i = 1; i <= tenorMonths; i++) {
    const dueDate = addMonthsClamped(startDate, i);
    const principal = monthlyInstallment;  // Entire payment is principal (no interest)
    const newBalance = balance - principal;
    schedule.push({
      month: i,
      dueDate,
      openingBalance: balance,
      installment: monthlyInstallment,
      interest: 0,  // No interest on CCD
      principal,
      closingBalance: Math.max(0, newBalance),
      status: 'upcoming',
      amountPaid: 0,
    });
    balance = newBalance;
  }

  const totalRepayment = monthlyInstallment * tenorMonths;
  const totalInterest = 0;  // No interest on CCD

  return {
    principal: ccdAmount,
    annualRate: 0,  // CCD carries no interest
    monthlyRate: 0,
    tenorMonths,
    repaymentMethod: 'FLAT',  // Straight-line
    monthlyInstallment,
    totalRepayment,
    totalInterest,
    ccdAmount: 0,  // CCD doesn't have its own CCD
    upfrontFeeAmount: 0,
    adminFeeAmount: 0,
    netDisbursement: ccdAmount,
    totalCostOfCredit: 0,  // No cost of credit on CCD
    effectiveAPR: 0,
    schedule,
  };
}

/**
 * Calculate early payoff amount at a given month
 */
export function calculateEarlyPayoff(
  schedule: ScheduleRow[],
  currentMonth: number,
  penaltyPercent: number = 0,  // early payoff penalty on remaining interest
): {
  remainingBalance: number;
  remainingInterest: number;
  remainingPrincipal: number;
  penaltyAmount: number;
  totalPayoff: number;
  interestSaved: number;
} {
  // v48 FIX (Calc-3): Sum actual outstanding principal from ALL remaining rows
  // instead of assuming the first remaining row's opening balance
  const remaining = schedule.filter(s => s.month > currentMonth && s.status !== 'paid');
  const remainingPrincipal = remaining.reduce((sum, s) => sum + s.principal, 0);
  const remainingInterest = remaining.reduce((sum, s) => sum + s.interest, 0);
  const penaltyAmount = remainingInterest * (penaltyPercent / 100);
  const totalPayoff = remainingPrincipal + penaltyAmount;
  const interestSaved = remainingInterest - penaltyAmount;

  return {
    remainingBalance: remainingPrincipal + remainingInterest,
    remainingInterest,
    remainingPrincipal,
    penaltyAmount,
    totalPayoff,
    interestSaved: Math.max(0, interestSaved),
  };
}

/**
 * Mark schedule rows based on actual payments made
 */
export function applyPaymentsToSchedule(
  schedule: ScheduleRow[],
  totalPaid: number,
  currentDate: Date = new Date(),
): ScheduleRow[] {
  let remainingPaid = totalPaid;
  return schedule.map(row => {
    const updated = { ...row };
    if (remainingPaid >= row.installment) {
      updated.amountPaid = row.installment;
      updated.status = 'paid';
      remainingPaid -= row.installment;
    } else if (remainingPaid > 0) {
      updated.amountPaid = remainingPaid;
      updated.status = 'partial';
      remainingPaid = 0;
    } else {
      // Check if overdue
      if (row.dueDate < currentDate && updated.status !== 'paid') {
        updated.status = 'overdue';
      }
    }
    return updated;
  });
}

/**
 * Compute loan progress stats
 */
export function computeLoanProgress(schedule: ScheduleRow[], totalPaid: number) {
  const totalDue = schedule.reduce((s, r) => s + r.installment, 0);
  const paidCount = schedule.filter(r => r.status === 'paid').length;
  const overdueCount = schedule.filter(r => r.status === 'overdue').length;
  const nextDue = schedule.find(r => r.status !== 'paid');

  return {
    totalDue,
    totalPaid,
    outstandingBalance: Math.max(0, totalDue - totalPaid),
    paidCount,
    totalCount: schedule.length,
    overdueCount,
    progressPercent: schedule.length > 0 ? (paidCount / schedule.length) * 100 : 0,
    nextDue,
  };
}

/**
 * Format Naira
 */
export function fmtNaira(n: number): string {
  return '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

/**
 * Format date
 */
export function fmtDate(d: Date | string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(d: Date | string): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ============================================================================
// LATE PAYMENT PENALTY & DEFAULT STATUS
// ============================================================================

/**
 * Calculate late-payment penalty.
 *
 * Per the Watershed Capital offer letter (DOCX clause 2 — "Penalties and
 * Additional Requirements"):
 *   "If a repayment is more than 2 days later than the due date, you will be
 *    charged 0.03% per day on the outstanding sums on the overdue amount."
 *
 * @param overdueAmount  The principal+interest instalment that is overdue.
 * @param daysOverdue    Number of days the instalment has been overdue.
 * @param dailyRate      Daily penalty rate (default 0.03% = 0.0003).
 */
export function calculateLatePenalty(
  overdueAmount: number,
  daysOverdue: number,
  dailyRate: number = 0.0003, // 0.03% per day
): { penaltyAmount: number; totalDue: number } {
  const penaltyAmount = overdueAmount * dailyRate * daysOverdue;
  return { penaltyAmount, totalDue: overdueAmount + penaltyAmount };
}

/**
 * Check whether a loan has crossed into formal default.
 *
 * A loan is treated as in-default once any overdue instalment has remained
 * unpaid past `defaultThresholdDays` (30 days by default — aligned with CBN
 * prudential guidance for NPL classification).
 *
 * @param schedule              The full repayment schedule (with applied
 *                              payments and statuses).
 * @param currentDate           The reference "today" date (defaults to now).
 * @param defaultThresholdDays  Number of days past due that constitutes default.
 */
export function checkDefaultStatus(
  schedule: ScheduleRow[],
  currentDate: Date = new Date(),
  defaultThresholdDays: number = 30,
): {
  isDefault: boolean;
  overduePayments: ScheduleRow[];
  totalOverdue: number;
  daysOverdue: number;
} {
  const overdue = schedule.filter(
    (s) => s.status === 'overdue' || (s.dueDate < currentDate && s.status !== 'paid'),
  );
  const daysOverdue =
    overdue.length > 0
      ? Math.floor(
          (currentDate.getTime() - new Date(overdue[0].dueDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;
  return {
    isDefault: daysOverdue > defaultThresholdDays,
    overduePayments: overdue,
    totalOverdue: overdue.reduce((s, p) => s + (p.installment - p.amountPaid), 0),
    daysOverdue,
  };
}

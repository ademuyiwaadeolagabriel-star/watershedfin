/**
 * BranchActualService — v4 Branch Performance Management
 * =================================================================
 *
 * Computes all branch actuals from operational source data:
 *   - Disbursement amount + count
 *   - Collections (amount due, collected, collection rate)
 *   - PAR (portfolio at risk) by days-overdue buckets
 *   - NPL classification
 *   - Customer growth (new, active, repeat)
 *   - Application funnel (leads → customers → applications → KYC → submitted → approved → disbursed)
 *   - SLA / turnaround times (from workflow timestamps)
 *   - LO allocation variance (sum of LO targets vs branch target)
 *   - Pace-to-target forecasting
 *   - Field visits (BM visits, GPS-verified)
 *
 * The key principle: actuals are DERIVED from source data, never manually
 * stored. This service is the single authority for "what actually happened"
 * at a branch.
 */

import { db } from '@/lib/db';
import { assessLoanOverdue } from '@/lib/loan-overdue';

// ============================================================================
// Types
// ============================================================================

export interface Period {
  start: Date;
  end: Date;
  type: 'monthly' | 'quarterly' | 'annual' | 'daily' | 'custom';
  label: string; // e.g. "2024-01" or "2024-Q1"
}

export interface BranchPerformanceActual {
  metricKey: string;
  label: string;
  category: string;
  unit: string;
  actual: number;
  target: number | null;
  achievementPercent: number | null;
  direction: 'higher_is_better' | 'lower_is_better';
  status: 'on_track' | 'watch' | 'at_risk' | 'good' | 'ahead' | 'unknown';
}

export interface BranchPerformanceSummary {
  branchId: string;
  branchName: string;
  period: Period;
  metrics: BranchPerformanceActual[];
  forecast: {
    disbursementForecast: number;
    collectionForecast: number;
    projectedGap: number;
    paceStatus: 'on_track' | 'watch' | 'at_risk';
  };
  loAllocation: {
    branchTarget: number;
    loTotalAllocated: number;
    unallocated: number;
    isComplete: boolean;
    loBreakdown: Array<{ loId: string; loName: string; target: number; actual: number; achievement: number }>;
  };
  applicationFunnel: {
    leads: number;
    customers: number;
    applications: number;
    kycCompleted: number;
    submitted: number;
    approved: number;
    disbursed: number;
    firstPayments: number;
    repeatLoans: number;
    conversionRates: {
      applicationToApproval: number;
      approvalToDisbursement: number;
      disbursementToFirstPayment: number;
    };
  };
  portfolioQuality: {
    portfolioOutstanding: number;
    par1: number;
    par7: number;
    par30: number;
    par60: number;
    par90: number;
    nplAmount: number;
    nplRatio: number;
    overdueAmount: number;
    recoveryRate: number;
    restructuredCount: number;
    writeOffAmount: number;
  };
  collections: {
    amountDue: number;
    amountCollected: number;
    collectionRate: number;
    overdueAmount: number;
    recoveredAmount: number;
    recoveryRate: number;
    accountsDue: number;
    accountsContacted: number;
  };
  operations: {
    applicationsWaiting: number;
    slaBreaches: number;
    avgTurnaroundHours: number;
    oldestApplicationHours: number;
  };
  customerGrowth: {
    newCustomers: number;
    activeCustomers: number;
    repeatCustomers: number;
    referrals: number;
    dormantReactivated: number;
  };
  fieldVisits: {
    totalVisits: number;
    gpsVerified: number;
    collateralInspections: number;
    followUpVisits: number;
  };
  alerts: Array<{
    metricKey: string;
    alertType: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    thresholdValue?: number;
    actualValue?: number;
  }>;
}

// ============================================================================
// Period helpers
// ============================================================================

export function getCurrentPeriod(type: 'monthly' | 'quarterly' | 'annual' | 'daily'): Period {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end: Date;
  let label: string;

  if (type === 'monthly') {
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  } else if (type === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3);
    start.setMonth(q * 3, 1);
    end = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
    label = `${now.getFullYear()}-Q${q + 1}`;
  } else if (type === 'annual') {
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    label = `${now.getFullYear()}`;
  } else {
    // daily
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  return { start, end, type, label };
}

export function getPeriodElapsedPercent(period: Period): number {
  const now = new Date();
  const total = period.end.getTime() - period.start.getTime();
  const elapsed = now.getTime() - period.start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

// ============================================================================
// Actual computation functions
// ============================================================================

/** Disbursement amount for a branch in a period — from loan.branchId (authoritative) */
async function getDisbursementActuals(branchId: string, period: Period) {
  const loans = await db.loanApplicants.findMany({
    where: {
      branchId,
      disbursedAt: { gte: period.start, lte: period.end },
      status: { in: ['running', 'paid'] },
    },
    select: { finalAmount: true, approvedAmount: true, amount: true },
  });
  const totalAmount = loans.reduce((s, l) => s + (Number(l.finalAmount) || Number(l.approvedAmount) || Number(l.amount)), 0);
  return { amount: totalAmount, count: loans.length };
}

/** Collections for a branch in a period — from LoanTransaction where loan.branchId */
async function getCollectionActuals(branchId: string, period: Period) {
  // Amount due: sum of LoanRepayment.amountDue where dueDate in period
  const repayments = await db.loanRepayment.findMany({
    where: {
      loan: { branchId },
      dueDate: { gte: period.start, lte: period.end },
    },
    select: { amountDue: true, amountPaid: true, status: true },
  });
  const amountDue = repayments.reduce((s, r) => s + Number(r.amountDue), 0);
  const amountCollected = repayments.reduce((s, r) => s + Number(r.amountPaid), 0);

  // Overdue + recovery
  const overdueRepayments = repayments.filter(r => r.status === 'overdue');
  const overdueAmount = overdueRepayments.reduce((s, r) => s + Math.max(0, Number(r.amountDue) - Number(r.amountPaid)), 0);

  // Recovery: sum of LoanTransaction repayments for overdue accounts
  const recoveryTxns = await db.loanTransaction.findMany({
    where: {
      type: 'repayment',
      transactionDate: { gte: period.start, lte: period.end },
      loan: { branchId, loanRepayments: { some: { status: 'overdue' } } },
    },
    select: { amount: true },
  });
  const recoveredAmount = recoveryTxns.reduce((s, t) => s + Number(t.amount), 0);

  return {
    amountDue,
    amountCollected,
    collectionRate: amountDue > 0 ? (amountCollected / amountDue) * 100 : 0,
    overdueAmount,
    recoveredAmount,
    recoveryRate: overdueAmount > 0 ? (recoveredAmount / overdueAmount) * 100 : 0,
    accountsDue: repayments.length,
    accountsContacted: overdueRepayments.length, // proxy — accounts with overdue status
  };
}

/** Portfolio quality — PAR buckets, NPL, recovery rate */
async function getPortfolioQuality(branchId: string) {
  const loans = await db.loanApplicants.findMany({
    where: { branchId, status: 'running' },
    include: { loanRepayments: true },
  });

  let portfolioOutstanding = 0;
  let par1 = 0, par7 = 0, par30 = 0, par60 = 0, par90 = 0;
  let nplAmount = 0;
  let overdueAmount = 0;

  for (const loan of loans) {
    const outstanding = (Number(loan.finalAmount) || Number(loan.approvedAmount) || Number(loan.amount)) -
      loan.loanRepayments.reduce((s, r) => s + Number(r.amountPaid), 0);
    portfolioOutstanding += Math.max(0, outstanding);

    // Use assessLoanOverdue for accurate days-overdue.
    // v51 — assessLoanOverdue expects a loanId string (not a loan object) and
    // may return null when the loan has no schedule; guard for both.
    try {
      const assessment = await assessLoanOverdue(loan.id);
      if (assessment && assessment.daysOverdue > 0) {
        overdueAmount += assessment.totalOverdueAmount;
        if (assessment.daysOverdue >= 1) par1 += outstanding;
        if (assessment.daysOverdue >= 7) par7 += outstanding;
        if (assessment.daysOverdue >= 30) par30 += outstanding;
        if (assessment.daysOverdue >= 60) par60 += outstanding;
        if (assessment.daysOverdue >= 90) par90 += outstanding;
        if (assessment.daysOverdue > 90) nplAmount += outstanding;
      }
    } catch {
      // non-blocking — skip loans with missing schedule
    }
  }

  // Restructured + write-offs
  const restructuredCount = await db.loanApplicants.count({
    where: { branchId, status: 'restructured' },
  }).catch(() => 0);

  return {
    portfolioOutstanding,
    par1,
    par7,
    par30,
    par60,
    par90,
    nplAmount,
    nplRatio: portfolioOutstanding > 0 ? (nplAmount / portfolioOutstanding) * 100 : 0,
    overdueAmount,
    recoveryRate: overdueAmount > 0 ? 0 : 0, // computed in collections
    restructuredCount,
    writeOffAmount: 0, // would need a write-off model; placeholder
  };
}

/** Customer growth — new, active, repeat, referrals */
async function getCustomerGrowth(branchId: string, period: Period) {
  const newCustomers = await db.user.count({
    where: { branchId, createdAt: { gte: period.start, lte: period.end } },
  });

  const activeCustomers = await db.user.count({
    where: {
      branchId,
      loans: { some: { status: 'running' } },
    },
  });

  const repeatCustomers = await db.user.count({
    where: {
      branchId,
      loans: { some: { status: 'paid' } },
      // has more than one loan (including a paid one)
    },
  }).catch(() => 0);

  // Referrals — from user metadata or audit log
  const referrals = await db.user.count({
    where: { branchId, assignedBy: { not: null }, createdAt: { gte: period.start, lte: period.end } },
  }).catch(() => 0);

  const dormantReactivated = 0; // would need a "last active" field; placeholder

  return { newCustomers, activeCustomers, repeatCustomers, referrals, dormantReactivated };
}

/** Application funnel — from workflow stages */
async function getApplicationFunnel(branchId: string, period: Period) {
  const loans = await db.loanApplicants.findMany({
    where: { branchId, createdAt: { gte: period.start, lte: period.end } },
    select: {
      id: true, currentStep: true, status: true, submittedAt: true,
      disbursedAt: true, applicationRef: true, userId: true,
    },
  });

  const applications = loans.length;
  const kycCompleted = loans.filter(l => !['LO_ENTRY', 'DRAFT'].includes(l.currentStep)).length;
  const submitted = loans.filter(l => l.submittedAt).length;
  const approved = loans.filter(l => ['CUSTOMER_ACCEPTANCE', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT', 'ACTIVE_MONITORING', 'running', 'paid'].includes(l.currentStep) || l.status === 'running' || l.status === 'paid').length;
  const disbursed = loans.filter(l => l.disbursedAt || l.status === 'running' || l.status === 'paid').length;

  // First payments
  const firstPayments = await db.loanTransaction.count({
    where: {
      type: 'repayment',
      loan: { branchId, disbursedAt: { gte: period.start, lte: period.end } },
    },
  }).catch(() => 0);

  // Repeat loans
  const userIds = [...new Set(loans.map(l => l.userId).filter(Boolean))] as string[];
  let repeatLoans = 0;
  for (const uid of userIds) {
    const count = await db.loanApplicants.count({ where: { userId: uid, status: 'paid' } }).catch(() => 0);
    if (count > 0) repeatLoans++;
  }

  return {
    leads: 0, // would need a leads model; placeholder
    customers: userIds.length,
    applications,
    kycCompleted,
    submitted,
    approved,
    disbursed,
    firstPayments,
    repeatLoans,
    conversionRates: {
      applicationToApproval: applications > 0 ? (approved / applications) * 100 : 0,
      approvalToDisbursement: approved > 0 ? (disbursed / approved) * 100 : 0,
      disbursementToFirstPayment: disbursed > 0 ? (firstPayments / disbursed) * 100 : 0,
    },
  };
}

/** Operations — SLA, backlog, turnaround */
async function getOperations(branchId: string) {
  const now = new Date();
  const waitingLoans = await db.loanApplicants.findMany({
    where: {
      branchId,
      status: { in: ['pending', 'processing', 'queried'] },
    },
    select: { id: true, createdAt: true, submittedAt: true, currentStep: true },
  });

  const applicationsWaiting = waitingLoans.length;
  let slaBreaches = 0;
  let totalTurnaroundHours = 0;
  let oldestApplicationHours = 0;

  for (const loan of waitingLoans) {
    const submittedAt = loan.submittedAt || loan.createdAt;
    const hoursSince = (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60);
    totalTurnaroundHours += hoursSince;

    // SLA: 48 hours for most stages, 24 for KYC
    const slaHours = loan.currentStep === 'LEGAL_KYC_CHECK' ? 24 : 48;
    if (hoursSince > slaHours) slaBreaches++;

    if (hoursSince > oldestApplicationHours) oldestApplicationHours = hoursSince;
  }

  return {
    applicationsWaiting,
    slaBreaches,
    avgTurnaroundHours: applicationsWaiting > 0 ? totalTurnaroundHours / applicationsWaiting : 0,
    oldestApplicationHours,
  };
}

/** Field visits — BM visits, GPS verification */
async function getFieldVisits(branchId: string, period: Period) {
  const visits = await db.branchManagerVisit.findMany({
    where: {
      branchId,
      visitDate: { gte: period.start, lte: period.end },
    },
    select: { id: true, verificationMethod: true, gpsLatitude: true, gpsLongitude: true, businessOperating: true },
  }).catch(() => []);

  const gpsVerified = visits.filter(v => v.gpsLatitude && v.gpsLongitude).length;

  return {
    totalVisits: visits.length,
    gpsVerified,
    collateralInspections: visits.filter(v => v.businessOperating).length, // proxy: business operating = inspection visited
    followUpVisits: visits.length - visits.filter(v => v.businessOperating).length,
  };
}

/** LO allocation — sum of LO targets vs branch target */
async function getLOAllocation(branchId: string, period: Period) {
  const activeBranchTarget = await db.branchTarget.findFirst({
    where: {
      branchId,
      metricKey: 'disbursement_amount',
      periodType: period.type,
      periodStart: period.start,
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
  });

  const branchTarget = Number(activeBranchTarget?.targetValue || 0);

  const los = await db.admin.findMany({
    where: { branchId, role: { in: ['loan', 'lo'] }, status: 1 },
    select: {
      id: true, firstName: true, lastName: true,
      monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
      quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true,
      annualDisbursementTarget: true, annualLoanCountTarget: true,
    },
  });

  const loIds = los.map(lo => lo.id);
  const actualLoans = loIds.length > 0
    ? await db.loanApplicants.findMany({
        where: {
          staffId: { in: loIds },
          disbursedAt: { gte: period.start, lt: period.end },
        },
        select: { staffId: true, finalAmount: true, amount: true },
      })
    : [];
  const actualByLo = new Map<string, { amount: number; count: number }>();
  for (const loan of actualLoans) {
    if (!loan.staffId) continue;
    const current = actualByLo.get(loan.staffId) || { amount: 0, count: 0 };
    current.amount += Number(loan.finalAmount ?? loan.amount);
    current.count += 1;
    actualByLo.set(loan.staffId, current);
  }

  const loBreakdown = los.map(lo => {
    const target =
      period.type === 'annual'
        ? Number(lo.annualDisbursementTarget) || 0
        : period.type === 'quarterly'
          ? Number(lo.quarterlyDisbursementTarget) || 0
          : Number(lo.monthlyDisbursementTarget) || 0;
    const actual = actualByLo.get(lo.id)?.amount || 0;
    return {
      loId: lo.id,
      loName: `${lo.firstName} ${lo.lastName}`.trim(),
      target,
      actual,
      achievement: target > 0 ? (actual / target) * 100 : 0,
    };
  });

  const loTotalAllocated = loBreakdown.reduce((s, lo) => s + lo.target, 0);
  const unallocated = branchTarget - loTotalAllocated;

  return {
    branchTarget,
    loTotalAllocated,
    unallocated,
    isComplete: Math.abs(unallocated) < 1, // within ₦1
    loBreakdown,
  };
}

/** Pace-to-target forecasting */
function computePaceForecast(actual: number, target: number, elapsedPercent: number): {
  forecast: number;
  projectedGap: number;
  paceStatus: 'on_track' | 'watch' | 'at_risk';
} {
  if (target <= 0 || elapsedPercent <= 0) {
    return { forecast: actual, projectedGap: target - actual, paceStatus: 'unknown' as any };
  }
  const expectedPace = (target * elapsedPercent) / 100;
  const runRate = actual / (elapsedPercent / 100);
  const forecast = Math.min(target * 1.1, runRate); // cap at 110% of target
  const projectedGap = target - forecast;
  const achievementPercent = (actual / target) * 100;

  let paceStatus: 'on_track' | 'watch' | 'at_risk';
  if (achievementPercent >= elapsedPercent - 5) paceStatus = 'on_track';
  else if (achievementPercent >= elapsedPercent - 15) paceStatus = 'watch';
  else paceStatus = 'at_risk';

  return { forecast, projectedGap, paceStatus };
}

// ============================================================================
// Main exported function — get full branch performance summary
// ============================================================================

export async function getBranchPerformance(branchId: string, periodType: 'monthly' | 'quarterly' | 'annual' | 'daily' = 'monthly'): Promise<BranchPerformanceSummary> {
  const period = getCurrentPeriod(periodType);
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { name: true } });

  // Compute all actuals in parallel
  const [disbursement, collections, portfolio, customerGrowth, funnel, operations, fieldVisits, loAllocation] = await Promise.all([
    getDisbursementActuals(branchId, period),
    getCollectionActuals(branchId, period),
    getPortfolioQuality(branchId),
    getCustomerGrowth(branchId, period),
    getApplicationFunnel(branchId, period),
    getOperations(branchId),
    getFieldVisits(branchId, period),
    getLOAllocation(branchId, period),
  ]);

  // BranchTarget is the authoritative target source. Legacy Branch columns
  // remain only as a compatibility fallback for pre-migration periods.
  const activeTargets = await db.branchTarget.findMany({
    where: {
      branchId,
      periodType: period.type,
      periodStart: period.start,
      status: 'ACTIVE',
      metricKey: { in: ['disbursement_amount', 'loan_count'] },
    },
    orderBy: { version: 'desc' },
  });
  const targetMap = new Map<string, any>();
  for (const t of activeTargets) if (!targetMap.has(t.metricKey)) targetMap.set(t.metricKey, t);
  const legacyBranch = activeTargets.length === 0
    ? await db.branch.findUnique({
        where: { id: branchId },
        select: { monthlyDisbursementTarget: true, monthlyLoanCountTarget: true },
      })
    : null;
  const disbursementTarget = Number(targetMap.get('disbursement_amount')?.targetValue ?? legacyBranch?.monthlyDisbursementTarget ?? 0);
  const loanCountTarget = Number(targetMap.get('loan_count')?.targetValue ?? legacyBranch?.monthlyLoanCountTarget ?? 0);

  // Pace forecasts
  const elapsedPercent = getPeriodElapsedPercent(period);
  const disbursementPace = computePaceForecast(disbursement.amount, disbursementTarget, elapsedPercent);
  const collectionPace = computePaceForecast(collections.amountCollected, collections.amountDue, elapsedPercent);

  // Build metrics array
  const metrics: BranchPerformanceActual[] = [
    {
      metricKey: 'disbursement_amount',
      label: 'Disbursement Amount',
      category: 'business',
      unit: 'NGN',
      actual: disbursement.amount,
      target: disbursementTarget,
      achievementPercent: disbursementTarget > 0 ? (disbursement.amount / disbursementTarget) * 100 : null,
      direction: 'higher_is_better',
      status: disbursementPace.paceStatus,
    },
    {
      metricKey: 'loan_count',
      label: 'Loan Count',
      category: 'business',
      unit: 'count',
      actual: disbursement.count,
      target: loanCountTarget,
      achievementPercent: loanCountTarget > 0 ? (disbursement.count / loanCountTarget) * 100 : null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
    {
      metricKey: 'collection_rate',
      label: 'Collection Rate',
      category: 'collections',
      unit: 'percent',
      actual: collections.collectionRate,
      target: 90, // default target
      achievementPercent: collections.collectionRate,
      direction: 'higher_is_better',
      status: collections.collectionRate >= 90 ? 'good' : collections.collectionRate >= 80 ? 'watch' : 'at_risk',
    },
    {
      metricKey: 'par30',
      label: 'PAR 30',
      category: 'credit_quality',
      unit: 'percent',
      actual: portfolio.portfolioOutstanding > 0 ? (portfolio.par30 / portfolio.portfolioOutstanding) * 100 : 0,
      target: 5, // default target: <5%
      achievementPercent: portfolio.portfolioOutstanding > 0 ? (portfolio.par30 / portfolio.portfolioOutstanding) * 100 : 0,
      direction: 'lower_is_better',
      status: portfolio.portfolioOutstanding > 0 ? ((portfolio.par30 / portfolio.portfolioOutstanding) * 100 < 5 ? 'good' : 'at_risk') : 'unknown',
    },
    {
      metricKey: 'npl_ratio',
      label: 'NPL Ratio',
      category: 'credit_quality',
      unit: 'percent',
      actual: portfolio.nplRatio,
      target: 3, // default target: <3%
      achievementPercent: portfolio.nplRatio,
      direction: 'lower_is_better',
      status: portfolio.nplRatio < 3 ? 'good' : 'at_risk',
    },
    {
      metricKey: 'new_customers',
      label: 'New Customers',
      category: 'customer',
      unit: 'count',
      actual: customerGrowth.newCustomers,
      target: 0,
      achievementPercent: null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
    {
      metricKey: 'active_customers',
      label: 'Active Customers',
      category: 'customer',
      unit: 'count',
      actual: customerGrowth.activeCustomers,
      target: 0,
      achievementPercent: null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
    {
      metricKey: 'repeat_customers',
      label: 'Repeat Customers',
      category: 'customer',
      unit: 'count',
      actual: customerGrowth.repeatCustomers,
      target: 0,
      achievementPercent: null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
    {
      metricKey: 'sla_breaches',
      label: 'SLA Breaches',
      category: 'operations',
      unit: 'count',
      actual: operations.slaBreaches,
      target: 0,
      achievementPercent: operations.slaBreaches > 0 ? 0 : 100,
      direction: 'lower_is_better',
      status: operations.slaBreaches === 0 ? 'good' : 'at_risk',
    },
    {
      metricKey: 'avg_turnaround_hours',
      label: 'Avg Turnaround (hrs)',
      category: 'operations',
      unit: 'hours',
      actual: Math.round(operations.avgTurnaroundHours * 10) / 10,
      target: 48,
      achievementPercent: null,
      direction: 'lower_is_better',
      status: operations.avgTurnaroundHours <= 48 ? 'good' : 'at_risk',
    },
    {
      metricKey: 'field_visits',
      label: 'Field Visits',
      category: 'operations',
      unit: 'count',
      actual: fieldVisits.totalVisits,
      target: 40, // default
      achievementPercent: fieldVisits.totalVisits > 0 ? (fieldVisits.totalVisits / 40) * 100 : null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
    {
      metricKey: 'gps_verified_visits',
      label: 'GPS-Verified Visits',
      category: 'operations',
      unit: 'count',
      actual: fieldVisits.gpsVerified,
      target: 0,
      achievementPercent: null,
      direction: 'higher_is_better',
      status: 'unknown',
    },
  ];

  // Build alerts
  const alerts: BranchPerformanceSummary['alerts'] = [];
  if (disbursementPace.paceStatus === 'at_risk') {
    alerts.push({
      metricKey: 'disbursement_amount',
      alertType: 'pace_behind',
      severity: 'critical',
      message: `Branch is ${Math.round(100 - (disbursement.amount / disbursementTarget) * 100)}% behind disbursement pace.`,
      actualValue: disbursement.amount,
      thresholdValue: disbursementTarget,
    });
  }
  if (portfolio.nplRatio > 3) {
    alerts.push({
      metricKey: 'npl_ratio',
      alertType: 'threshold_breach',
      severity: 'critical',
      message: `NPL ratio ${portfolio.nplRatio.toFixed(1)}% exceeds 3% threshold.`,
      actualValue: portfolio.nplRatio,
      thresholdValue: 3,
    });
  }
  if (portfolio.portfolioOutstanding > 0 && (portfolio.par30 / portfolio.portfolioOutstanding) * 100 > 5) {
    alerts.push({
      metricKey: 'par30',
      alertType: 'threshold_breach',
      severity: 'warning',
      message: `PAR30 ${((portfolio.par30 / portfolio.portfolioOutstanding) * 100).toFixed(1)}% exceeds 5% threshold.`,
      actualValue: (portfolio.par30 / portfolio.portfolioOutstanding) * 100,
      thresholdValue: 5,
    });
  }
  if (operations.slaBreaches > 0) {
    alerts.push({
      metricKey: 'sla_breaches',
      alertType: 'sla_breach',
      severity: 'warning',
      message: `${operations.slaBreaches} application(s) have breached SLA.`,
      actualValue: operations.slaBreaches,
      thresholdValue: 0,
    });
  }
  if (loAllocation.unallocated > 0) {
    alerts.push({
      metricKey: 'disbursement_amount',
      alertType: 'unallocated_target',
      severity: 'warning',
      message: `₦${loAllocation.unallocated.toLocaleString()} of LO targets remain unallocated.`,
      actualValue: loAllocation.unallocated,
      thresholdValue: loAllocation.branchTarget,
    });
  }

  return {
    branchId,
    branchName: branch?.name || 'Unknown',
    period,
    metrics,
    forecast: {
      disbursementForecast: disbursementPace.forecast,
      collectionForecast: collectionPace.forecast,
      projectedGap: disbursementPace.projectedGap,
      paceStatus: disbursementPace.paceStatus,
    },
    loAllocation,
    applicationFunnel: funnel,
    portfolioQuality: portfolio,
    collections,
    operations,
    customerGrowth,
    fieldVisits,
    alerts,
  };
}

/** Get all-branches comparison for executive dashboard */
export async function getAllBranchesPerformance(periodType: 'monthly' | 'quarterly' | 'annual' = 'monthly') {
  const branches = await db.branch.findMany({
    where: { status: 'active' },
    select: { id: true, name: true, code: true },
  });

  const results = await Promise.all(
    branches.map(async (b) => {
      try {
        const perf = await getBranchPerformance(b.id, periodType);
        const disbursementMetric = perf.metrics.find(m => m.metricKey === 'disbursement_amount');
        const collectionMetric = perf.metrics.find(m => m.metricKey === 'collection_rate');
        const par30Metric = perf.metrics.find(m => m.metricKey === 'par30');
        const slaMetric = perf.metrics.find(m => m.metricKey === 'sla_breaches');
        const newCustomersMetric = perf.metrics.find(m => m.metricKey === 'new_customers');

        return {
          branchId: b.id,
          branchName: b.name,
          branchCode: b.code,
          disbursement: disbursementMetric?.actual || 0,
          disbursementTarget: disbursementMetric?.target || 0,
          collectionRate: collectionMetric?.actual || 0,
          par30: par30Metric?.actual || 0,
          slaBreaches: slaMetric?.actual || 0,
          newCustomers: newCustomersMetric?.actual || 0,
          paceStatus: perf.forecast.paceStatus,
        };
      } catch {
        return {
          branchId: b.id,
          branchName: b.name,
          branchCode: b.code,
          disbursement: 0, disbursementTarget: 0, collectionRate: 0,
          par30: 0, slaBreaches: 0, newCustomers: 0, paceStatus: 'unknown' as any,
        };
      }
    })
  );

  return results;
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule, applyPaymentsToSchedule, computeLoanProgress } from '@/lib/loan-calc';

// GET /api/customer/dashboard?userId=
// Returns comprehensive dashboard data for a borrower
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { business: true, branch: true, loanOfficer: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // ── Loans ──
    const loans = await db.loanApplicants.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, branch: true, loanOfficer: true },
    });

    // ── Transactions ──
    const allTransactions = await db.transactions.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // ── Loan transactions (repayments) ──
    const loanTransactions = await db.loanTransaction.findMany({
      where: { loanApplicantId: { in: loans.map(l => l.id) } },
      orderBy: { transactionDate: 'desc' },
      include: { loan: { select: { applicationRef: true } } },
    });

    // ── Approval logs across all loans ──
    const approvalLogs = await db.approvalLog.findMany({
      where: { loanApplicantId: { in: loans.map(l => l.id) } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { admin: true, loan: { select: { applicationRef: true } } },
    });

    // ── Savings (secondary) ──
    const savings = await db.savings.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // ── Investments (secondary) ──
    const investments = await db.treasuryInvestment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { product: true },
    });

    // ── Wallet balance ──
    const balance = await db.balance.findUnique({ where: { userId } });

    // ── Compute loan-level data ──
    const activeLoans = loans.filter(l => l.status === 'running');
    const paidLoans = loans.filter(l => l.status === 'paid');
    const pendingLoans = loans.filter(l => ['pending', 'processing', 'queried'].includes(l.status));
    const declinedLoans = loans.filter(l => l.status === 'declined');

    // Total borrowed = sum of all disbursed loan principals
    const totalBorrowed = loans
      .filter(l => l.status === 'running' || l.status === 'paid')
      .reduce((s, l) => s + (l.finalAmount || l.approvedAmount || l.amount || 0), 0);

    // Total repaid = sum of all repayment transactions
    const totalRepaid = loanTransactions
      .filter(t => t.type === 'repayment')
      .reduce((s, t) => s + t.amount, 0);

    // Outstanding balance across all active loans
    let totalOutstanding = 0;
    const activeLoansWithBreakdown = [];

    for (const loan of activeLoans) {
      const principal = loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
      const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
      const annualRate = loan.finalInterestRate || loan.percent || loan.plan?.interest || 24;
      const ccdPercent = loan.finalCcdFeePercent || 10;
      const upfrontFeePercent = loan.finalUpfrontFeePercent || 1;
      const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
      const startDate = loan.disbursedAt || loan.disbursementDate || new Date();

      const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, startDate, ccdPercent, upfrontFeePercent, 0);

      const loanRepayments = loanTransactions.filter(t => t.loanApplicantId === loan.id && t.type === 'repayment');
      const totalPaidForLoan = loanRepayments.reduce((s, t) => s + t.amount, 0);

      const scheduleWithPayments = applyPaymentsToSchedule(calc.schedule, totalPaidForLoan, new Date());
      const progress = computeLoanProgress(scheduleWithPayments, totalPaidForLoan);

      totalOutstanding += progress.outstandingBalance;

      activeLoansWithBreakdown.push({
        ...loan,
        breakdown: {
          principal,
          monthlyInstallment: calc.monthlyInstallment,
          totalRepayment: calc.totalRepayment,
          totalInterest: calc.totalInterest,
          schedule: scheduleWithPayments,
          progress,
          nextDue: progress.nextDue,
          paidCount: progress.paidCount,
          totalCount: progress.totalCount,
          overdueCount: progress.overdueCount,
          progressPercent: progress.progressPercent,
          totalPaid: totalPaidForLoan,
          outstandingBalance: progress.outstandingBalance,
        },
      });
    }

    // ── Upcoming payments (next 5 across all active loans) ──
    const upcomingPayments: any[] = [];
    for (const loan of activeLoansWithBreakdown) {
      const unpaid = loan.breakdown.schedule.filter((s: any) => s.status !== 'paid');
      for (const pmt of unpaid.slice(0, 3)) {
        const daysUntilDue = Math.ceil((new Date(pmt.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        upcomingPayments.push({
          loanRef: loan.applicationRef,
          loanId: loan.id,
          month: pmt.month,
          dueDate: pmt.dueDate,
          installment: pmt.installment,
          daysUntilDue,
          status: pmt.status,
          isOverdue: daysUntilDue < 0,
          isUrgent: daysUntilDue >= 0 && daysUntilDue <= 7,
        });
      }
    }
    upcomingPayments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // ── Alerts ──
    const alerts: any[] = [];

    // Overdue payments alert
    const overduePayments = upcomingPayments.filter(p => p.isOverdue);
    if (overduePayments.length > 0) {
      alerts.push({
        type: 'overdue',
        severity: 'critical',
        title: `${overduePayments.length} Payment(s) Overdue`,
        message: `You have ${overduePayments.length} overdue payment(s) totaling ₦${overduePayments.reduce((s, p) => s + p.installment, 0).toLocaleString()}. Pay now to avoid penalties.`,
        action: 'Make Payment',
        actionView: 'customer-pay-back',
        actionParams: { loanId: overduePayments[0].loanId },
      });
    }

    // Offer ready alert
    const offerReadyLoan = loans.find(l => l.currentStep === 'CUSTOMER_ACCEPTANCE');
    if (offerReadyLoan) {
      alerts.push({
        type: 'offer_ready',
        severity: 'success',
        title: 'Your Loan Offer is Ready! 🎉',
        message: `Your loan offer for ${offerReadyLoan.applicationRef} is ready for review and acceptance.`,
        action: 'Review & Sign',
        actionView: 'customer-accept-offer',
        actionParams: { loanId: offerReadyLoan.id },
      });
    }

    // Payment due soon alert (within 7 days, not overdue)
    const dueSoon = upcomingPayments.filter(p => !p.isOverdue && p.isUrgent);
    if (dueSoon.length > 0 && !overduePayments.length) {
      alerts.push({
        type: 'payment_due',
        severity: 'warning',
        title: `Payment Due in ${dueSoon[0].daysUntilDue} Day(s)`,
        message: `Your next payment of ₦${dueSoon[0].installment.toLocaleString()} for ${dueSoon[0].loanRef} is due on ${new Date(dueSoon[0].dueDate).toLocaleDateString('en-NG')}.`,
        action: 'Pay Now',
        actionView: 'customer-pay-back',
        actionParams: { loanId: dueSoon[0].loanId },
      });
    }

    // KYC not approved alert
    if (user.kycStatus !== 'APPROVED') {
      alerts.push({
        type: 'kyc',
        severity: 'warning',
        title: 'Complete Your KYC Verification',
        message: `Your KYC status is ${user.kycStatus || 'Pending'}. You need approved KYC to apply for loans.`,
        action: 'Verify Now',
        actionView: 'customer-profile',
        actionParams: {},
      });
    }

    // Application in review alert
    const inReviewLoan = loans.find(l => ['processing', 'pending'].includes(l.status) && l.currentStep !== 'CUSTOMER_ACCEPTANCE');
    if (inReviewLoan && !offerReadyLoan) {
      alerts.push({
        type: 'in_review',
        severity: 'info',
        title: 'Application Under Review',
        message: `Your loan application ${inReviewLoan.applicationRef} is being reviewed by our credit team. Track progress in the Decision Timeline.`,
        action: 'View Timeline',
        actionView: 'customer-decision',
        actionParams: { loanId: inReviewLoan.id },
      });
    }

    // ── Credit standing ──
    let creditStanding = 'GOOD';
    let creditStandingColor = 'emerald';
    if (overduePayments.length > 0) {
      creditStanding = 'OVERDUE';
      creditStandingColor = 'red';
    } else if (paidLoans.length > 0 && activeLoans.length === 0) {
      creditStanding = 'EXCELLENT';
      creditStandingColor = 'emerald';
    } else if (dueSoon.length > 0) {
      creditStanding = 'DUE SOON';
      creditStandingColor = 'amber';
    }

    // ── Activity feed (combine approval logs + loan transactions + general transactions) ──
    const activityFeed: any[] = [];

    // Add approval logs
    approvalLogs.forEach((log: any) => {
      activityFeed.push({
        id: `log-${log.id}`,
        type: 'approval',
        action: log.action,
        title: getApprovalTitle(log.action),
        description: log.comments || `${log.action} for ${log.loan?.applicationRef || 'loan'}`,
        timestamp: log.createdAt,
        loanRef: log.loan?.applicationRef,
        actor: log.admin ? `${log.admin.firstName} ${log.admin.lastName}` : 'System',
        actorRole: log.roleAtTimeOfAction,
        icon: getApprovalIcon(log.action),
        color: getApprovalColor(log.action),
      });
    });

    // Add loan transactions (repayments + disbursements)
    loanTransactions.forEach((t: any) => {
      if (t.type === 'repayment') {
        activityFeed.push({
          id: `pmt-${t.id}`,
          type: 'payment',
          action: 'PAYMENT',
          title: 'Payment Recorded',
          description: `Payment of ₦${t.amount.toLocaleString()} for ${t.loan?.applicationRef || 'loan'}`,
          timestamp: t.transactionDate,
          loanRef: t.loan?.applicationRef,
          actor: 'You',
          icon: 'CreditCard',
          color: 'emerald',
        });
      } else if (t.type === 'disbursement') {
        activityFeed.push({
          id: `disb-${t.id}`,
          type: 'disbursement',
          action: 'DISBURSED',
          title: 'Loan Disbursed',
          description: `₦${t.amount.toLocaleString()} disbursed to your account for ${t.loan?.applicationRef || 'loan'}`,
          timestamp: t.transactionDate,
          loanRef: t.loan?.applicationRef,
          actor: 'Treasury',
          icon: 'Wallet',
          color: 'blue',
        });
      }
    });

    // Add loan application events
    loans.forEach((loan: any) => {
      activityFeed.push({
        id: `app-${loan.id}`,
        type: 'application',
        action: 'APPLIED',
        title: 'Loan Application Submitted',
        description: `Applied for ₦${loan.amount.toLocaleString()} (${loan.plan?.name || 'Loan'}) — ${loan.applicationRef}`,
        timestamp: loan.createdAt,
        loanRef: loan.applicationRef,
        actor: 'You',
        icon: 'FileText',
        color: 'blue',
      });
    });

    // Sort by timestamp desc
    activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // ── Live loan (most recent non-completed) ──
    const liveLoan = loans.find(l => !['paid', 'declined'].includes(l.status));

    // Map current_step → customer-facing 5-step progress
    let customerStep = 0;
    let customerStepLabel = '';
    if (liveLoan) {
      const step = liveLoan.currentStep;
      if (['DRAFT', 'LO_ENTRY', 'LO_ASSESSMENT', 'QUERY_RESPONSE', 'BM_QC'].includes(step)) {
        customerStep = 1; customerStepLabel = 'Submitted';
      } else if (['HOC_STRUCTURING', 'ANALYST_STRUCTURING', 'CRO_VERIFICATION', 'CRO_RISK', 'CFO_REVIEW', 'LEGAL_CAC_CHECK', 'LEGAL_REVIEW', 'LEGAL_FINAL_REVIEW', 'HOC_AGGREGATION'].includes(step)) {
        customerStep = 2; customerStepLabel = 'Under Review';
      } else if (step === 'MD_APPROVAL') {
        customerStep = 3; customerStepLabel = 'Final Decision';
      } else if (step === 'CUSTOMER_ACCEPTANCE') {
        customerStep = 4; customerStepLabel = 'Offer Ready';
      } else if (['HOC_FINALIZATION', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT', 'TREASURY_PAYOUT'].includes(step)) {
        customerStep = 5; customerStepLabel = 'Disbursement';
      } else if (liveLoan.status === 'running') {
        customerStep = 5; customerStepLabel = 'Active';
      }
    }

    // ── Pre-qualified offer (mock logic) ──
    let preQualifiedOffer: any = null;
    if (user.kycStatus === 'APPROVED' && activeLoans.length === 0 && pendingLoans.length === 0 && paidLoans.length > 0) {
      // Customer with good history — offer a top-up
      preQualifiedOffer = {
        amount: Math.min(5000000, (paidLoans[0].approvedAmount || paidLoans[0].amount) * 1.5),
        rate: 22,
        tenor: 12,
        type: 'Top-Up Loan',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
    } else if (user.kycStatus === 'APPROVED' && activeLoans.length === 0 && pendingLoans.length === 0 && loans.length === 0) {
      // New customer with KYC — offer first loan
      preQualifiedOffer = {
        amount: 1000000,
        rate: 24,
        tenor: 12,
        type: 'Welcome Loan',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };
    }

    // ── Next payment (primary) ──
    const nextPayment = upcomingPayments[0] || null;

    // Sanitize
    const safeUser: any = { ...user, password: undefined };

    return NextResponse.json({
      user: safeUser,
      loans,
      activeLoans: activeLoansWithBreakdown,
      transactions: allTransactions.slice(0, 10),
      savings,
      investments,
      balance: balance?.amount || 0,
      stats: {
        totalBorrowed,
        totalRepaid,
        totalOutstanding,
        activeLoansCount: activeLoans.length,
        paidLoansCount: paidLoans.length,
        pendingLoansCount: pendingLoans.length,
        declinedLoansCount: declinedLoans.length,
        totalLoansCount: loans.length,
        kycStatus: user.kycStatus,
        nextPayment,
        creditStanding,
        creditStandingColor,
      },
      liveLoan: liveLoan ? {
        ...liveLoan,
        customerStep,
        customerStepLabel,
      } : null,
      upcomingPayments: upcomingPayments.slice(0, 5),
      alerts,
      activityFeed: activityFeed.slice(0, 10),
      preQualifiedOffer,
      relationshipManager: user.loanOfficer ? {
        ...user.loanOfficer,
        password: undefined,
      } : null,
    });
  } catch (e: any) {
    console.error('Customer dashboard error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getApprovalTitle(action: string): string {
  const map: Record<string, string> = {
    APPROVED: 'Application Approved',
    REJECTED: 'Application Rejected',
    QUERIED: 'Query Raised',
    FORWARDED: 'Application Forwarded',
    RETURNED: 'Application Returned',
    DISBURSED: 'Loan Disbursed',
    OFFER_ACCEPTED: 'Offer Accepted',
  };
  return map[action] || action;
}

function getApprovalIcon(action: string): string {
  const map: Record<string, string> = {
    APPROVED: 'CheckCircle2',
    REJECTED: 'XCircle',
    QUERIED: 'AlertCircle',
    FORWARDED: 'ArrowRight',
    RETURNED: 'ArrowLeft',
    DISBURSED: 'Wallet',
    OFFER_ACCEPTED: 'PenTool',
  };
  return map[action] || 'FileText';
}

function getApprovalColor(action: string): string {
  const map: Record<string, string> = {
    APPROVED: 'emerald',
    REJECTED: 'red',
    QUERIED: 'amber',
    FORWARDED: 'blue',
    RETURNED: 'amber',
    DISBURSED: 'purple',
    OFFER_ACCEPTED: 'emerald',
  };
  return map[action] || 'slate';
}

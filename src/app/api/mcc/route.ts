import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCC_ROLES, ROLE_TO_MCC, LOAN_STATUS_LABELS, LOAN_STATUS_BADGES, LOAN_STEP_LABELS } from '@/lib/constants';

// ============================================================================
// MCC LIST — loans that have at least one MCC decision
// Returns: loans[] + stats { total, pending, approved }
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status'); // pending | approved | all
    const search = url.searchParams.get('search');
    const branchId = url.searchParams.get('branchId');

    // Find every loan that has at least 1 MCC decision
    const loans = await db.loanApplicants.findMany({
      where: {
        mccDecisions: { some: {} },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { include: { business: true } },
        branch: true,
        plan: true,
        mccDecisions: {
          orderBy: [{ approvalLevel: 'asc' }, { decisionDate: 'asc' }],
        },
      },
    });

    // Compute summary stats & enriched records
    const TOTAL_MCC_LEVELS = Object.keys(MCC_ROLES).length; // 8

    type EnrichedLoan = {
      id: string;
      applicationRef: string | null;
      amount: number;
      duration: number;
      status: string;
      currentStep: string;
      createdAt: Date;
      updatedAt: Date;
      user: any;
      branch: any;
      plan: any;
      decisionCount: number;
      progressPercent: number;
      isComplete: boolean;
      latestDecisionType: string | null;
      latestMccDecision: any | null;
      finalAmount: number | null;
      borrowerName: string;
      businessName: string | null;
      sector: string | null;
    };

    let enriched: EnrichedLoan[] = loans.map((l: any) => {
      const decisions = l.mccDecisions || [];
      const decisionCount = decisions.length;
      const progressPercent = Math.round((decisionCount / TOTAL_MCC_LEVELS) * 100);
      const isComplete = decisionCount >= TOTAL_MCC_LEVELS;
      const latestMccDecision =
        decisions.length > 0
          ? decisions[decisions.length - 1]
          : null;
      const latestDecisionType = latestMccDecision?.decisionType || null;
      const finalAmount = latestMccDecision?.recommendedAmount ?? l.finalAmount ?? null;

      const safeUser = l.user ? { ...l.user, password: undefined } : null;

      return {
        id: l.id,
        applicationRef: l.applicationRef,
        amount: l.amount,
        duration: l.duration,
        status: l.status,
        currentStep: l.currentStep,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        user: safeUser,
        branch: l.branch,
        plan: l.plan,
        decisionCount,
        progressPercent,
        isComplete,
        latestDecisionType,
        latestMccDecision,
        finalAmount,
        borrowerName: safeUser ? `${safeUser.firstName} ${safeUser.lastName}` : 'Unknown',
        businessName: safeUser?.business?.name ?? null,
        sector: safeUser?.business?.sector ?? null,
      };
    });

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      enriched = enriched.filter(
        (l) =>
          l.applicationRef?.toLowerCase().includes(q) ||
          l.borrowerName.toLowerCase().includes(q) ||
          (l.businessName?.toLowerCase().includes(q) ?? false) ||
          (l.user?.email?.toLowerCase().includes(q) ?? false)
      );
    }

    // Status filter
    let filtered = enriched;
    if (status === 'pending') {
      filtered = enriched.filter((l) => !l.isComplete && l.latestDecisionType !== 'rejected');
    } else if (status === 'approved') {
      filtered = enriched.filter(
        (l) => l.isComplete || l.latestDecisionType === 'approved' || l.latestDecisionType === 'conditional'
      );
    } else if (status === 'rejected') {
      filtered = enriched.filter((l) => l.latestDecisionType === 'rejected');
    }

    // Stats computed over the FULL enriched set (not filtered)
    const total = enriched.length;
    const pending = enriched.filter(
      (l) => !l.isComplete && l.latestDecisionType !== 'rejected'
    ).length;
    const approved = enriched.filter(
      (l) => l.isComplete || l.latestDecisionType === 'approved' || l.latestDecisionType === 'conditional'
    ).length;
    const rejected = enriched.filter((l) => l.latestDecisionType === 'rejected').length;

    return NextResponse.json({
      loans: filtered,
      stats: { total, pending, approved, rejected },
      meta: {
        totalLevels: TOTAL_MCC_LEVELS,
        roleList: Object.values(MCC_ROLES),
        roleToMcc: ROLE_TO_MCC,
      },
    });
  } catch (e: any) {
    console.error('MCC list API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

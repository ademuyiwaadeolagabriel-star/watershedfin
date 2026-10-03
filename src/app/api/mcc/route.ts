import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  MCC_ROLES,
  ROLE_TO_MCC,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_BADGES,
  LOAN_STEP_LABELS,
} from '@/lib/constants';
import { db } from '@/lib/db';

// ============================================================================
// MCC LIST
// ----------------------------------------------------------------------------
// Returns loans that have at least one MCC decision.
//
// v54 fixes:
// 1. JWT-bound authentication / role authorization.
// 2. Branch-scoped users cannot query another branch by supplying branchId.
// 3. Append-only MCC decisions are handled correctly:
//      - historical SUPERSEDED decisions are retained,
//      - only ACTIVE decisions count toward current MCC progress,
//      - latest decision is based on approval level + decision sequence.
// 4. Decimal values are normalized to Number for the response contract.
// 5. Passwords are never returned.
// 6. Search/filter/statistics operate on the same enriched current-state data.
// ============================================================================

export async function GET(req: NextRequest) {
  // --------------------------------------------------------------------------
  // 1. AUTHENTICATION / ROLE AUTHORIZATION
  // --------------------------------------------------------------------------

  const authResult = await requireRole(req, [
    'super',
    'md',
    'hoc',
    'cro',
    'mcc',
    'credit',
  ]);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const auth = authResult;

  try {
    // ------------------------------------------------------------------------
    // 2. REQUEST PARAMETERS
    // ------------------------------------------------------------------------

    const url = new URL(req.url);

    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search')?.trim() || null;
    const requestedBranchId = url.searchParams.get('branchId')?.trim() || null;

    // ------------------------------------------------------------------------
    // 3. BRANCH SCOPE
    // ------------------------------------------------------------------------
    // Branch-scoped users must never be able to override their branch by
    // supplying another branchId in the query string.
    //
    // National-level governance roles can optionally request a specific branch.
    // ------------------------------------------------------------------------

    const branchScopedRoles = new Set([
      'bm',
      'loan',
      'frontdesk',
      'treasury',
      'branch_manager',
    ]);

    const isBranchScoped =
      auth.type === 'admin' &&
      branchScopedRoles.has(String(auth.role).toLowerCase());

    let effectiveBranchId: string | null = requestedBranchId;

    if (isBranchScoped) {
      effectiveBranchId = auth.branchId ?? null;

      // A branch-scoped administrator without a branch assignment cannot
      // retrieve cross-branch MCC records.
      if (!effectiveBranchId) {
        return NextResponse.json(
          {
            error: 'Your account is not assigned to a branch.',
          },
          { status: 403 },
        );
      }
    }

    // ------------------------------------------------------------------------
    // 4. FETCH MCC LOANS
    // ------------------------------------------------------------------------

    const loans = await db.loanApplicants.findMany({
      where: {
        mccDecisions: {
          some: {},
        },
        ...(effectiveBranchId
          ? {
              branchId: effectiveBranchId,
            }
          : {}),
      },

      orderBy: {
        updatedAt: 'desc',
      },

      include: {
        user: {
          include: {
            business: true,
          },
        },

        branch: true,

        plan: true,

        // Keep historical decisions available for audit/UI purposes.
        //
        // approvalLevel determines workflow order.
        // decisionSequence determines the chronological version at a
        // particular approval level under the append-only design.
        mccDecisions: {
          orderBy: [
            { approvalLevel: 'asc' },
            { decisionSequence: 'asc' },
            { decisionDate: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
    });

    // ------------------------------------------------------------------------
    // 5. ENRICHED RESPONSE TYPE
    // ------------------------------------------------------------------------

    type EnrichedLoan = {
      id: string;
      applicationRef: string | null;
      amount: number;
      duration: number;
      status: string;
      statusLabel: string;
      statusBadge: string;
      currentStep: string;
      currentStepLabel: string;
      createdAt: Date;
      updatedAt: Date;

      user: any;
      branch: any;
      plan: any;

      // Current/active MCC state.
      decisionCount: number;
      progressPercent: number;
      isComplete: boolean;

      latestDecisionType: string | null;
      latestMccDecision: any | null;

      finalAmount: number | null;

      borrowerName: string;
      businessName: string | null;
      sector: string | null;

      // Historical records are retained separately.
      historicalDecisionCount: number;
      activeDecisions: any[];
      allMccDecisions: any[];
    };

    // ------------------------------------------------------------------------
    // 6. MCC LEVEL COUNT
    // ------------------------------------------------------------------------

    const TOTAL_MCC_LEVELS = Object.keys(MCC_ROLES).length;

    // ------------------------------------------------------------------------
    // 7. BUILD CURRENT-STATE RECORDS
    // ------------------------------------------------------------------------

    let enriched: EnrichedLoan[] = loans.map((loan: any) => {
      const allDecisions = Array.isArray(loan.mccDecisions)
        ? loan.mccDecisions
        : [];

      // ----------------------------------------------------------------------
      // Append-only MCC logic:
      //
      // ACTIVE       = current authoritative decision for that approval role.
      // SUPERSEDED   = historical decision retained for audit.
      // REVERTED     = historical/reverted decision.
      //
      // Only ACTIVE records are used for current workflow progress.
      // ----------------------------------------------------------------------

      const activeDecisions = allDecisions.filter(
        (decision: any) =>
          !decision.status || decision.status === 'ACTIVE',
      );

      const historicalDecisionCount = Math.max(
        0,
        allDecisions.length - activeDecisions.length,
      );

      // Deduplicate defensively by approval role.
      //
      // Under correct transactional governance there should be at most one
      // ACTIVE decision for each approval role. If bad historical data ever
      // contains more than one, prefer the highest decisionSequence / newest
      // row rather than counting duplicates toward workflow completion.
      const currentByRole = new Map<string, any>();

      for (const decision of activeDecisions) {
        const roleKey = String(
          decision.approverRole ?? decision.approverRoleName ?? '',
        ).toUpperCase();

        const existing = currentByRole.get(roleKey);

        if (!existing) {
          currentByRole.set(roleKey, decision);
          continue;
        }

        const existingSequence = Number(
          existing.decisionSequence ?? 0,
        );

        const incomingSequence = Number(
          decision.decisionSequence ?? 0,
        );

        if (incomingSequence > existingSequence) {
          currentByRole.set(roleKey, decision);
          continue;
        }

        if (incomingSequence === existingSequence) {
          const existingCreated = new Date(
            existing.createdAt ?? existing.decisionDate ?? 0,
          ).getTime();

          const incomingCreated = new Date(
            decision.createdAt ?? decision.decisionDate ?? 0,
          ).getTime();

          if (incomingCreated > existingCreated) {
            currentByRole.set(roleKey, decision);
          }
        }
      }

      const currentDecisions = Array.from(currentByRole.values()).sort(
        (a: any, b: any) => {
          const levelA = Number(a.approvalLevel ?? 0);
          const levelB = Number(b.approvalLevel ?? 0);

          if (levelA !== levelB) {
            return levelA - levelB;
          }

          const sequenceA = Number(a.decisionSequence ?? 0);
          const sequenceB = Number(b.decisionSequence ?? 0);

          if (sequenceA !== sequenceB) {
            return sequenceA - sequenceB;
          }

          return (
            new Date(
              a.decisionDate ?? a.createdAt ?? 0,
            ).getTime() -
            new Date(
              b.decisionDate ?? b.createdAt ?? 0,
            ).getTime()
          );
        },
      );

      const decisionCount = currentDecisions.length;

      const progressPercent =
        TOTAL_MCC_LEVELS > 0
          ? Math.min(
              100,
              Math.round(
                (decisionCount / TOTAL_MCC_LEVELS) * 100,
              ),
            )
          : 0;

      const isComplete =
        decisionCount >= TOTAL_MCC_LEVELS;

      // The last current ACTIVE decision is the authoritative latest
      // decision for the current workflow state.
      const latestMccDecision =
        currentDecisions.length > 0
          ? currentDecisions[currentDecisions.length - 1]
          : null;

      const latestDecisionType =
        latestMccDecision?.decisionType ?? null;

      // Prisma Decimal values must be normalized for the explicit response
      // contract used by the MCC UI.
      const finalAmountRaw =
        latestMccDecision?.recommendedAmount ??
        loan.finalAmount ??
        null;

      const finalAmount =
        finalAmountRaw == null
          ? null
          : Number(finalAmountRaw);

      const amount = Number(loan.amount ?? 0);

      const duration = Number(
        loan.duration ??
          loan.approvedTenor ??
          loan.vettedDuration ??
          0,
      );

      // ----------------------------------------------------------------------
      // Strip password from the returned customer record.
      // ----------------------------------------------------------------------

      const safeUser = loan.user
        ? {
            ...loan.user,
            password: undefined,
          }
        : null;

      const borrowerName = safeUser
        ? `${safeUser.firstName ?? ''} ${safeUser.lastName ?? ''}`.trim() ||
          'Unknown'
        : 'Unknown';

      const businessName =
        safeUser?.business?.name ??
        null;

      const sector =
        safeUser?.business?.sector ??
        null;

      return {
        id: loan.id,

        applicationRef:
          loan.applicationRef ?? null,

        amount,

        duration,

        status:
          loan.status ?? 'unknown',

        statusLabel:
          LOAN_STATUS_LABELS?.[loan.status] ??
          loan.status ??
          'Unknown',

        statusBadge:
          LOAN_STATUS_BADGES?.[loan.status] ??
          'default',

        currentStep:
          loan.currentStep ?? 'UNKNOWN',

        currentStepLabel:
          LOAN_STEP_LABELS?.[loan.currentStep] ??
          loan.currentStep ??
          'Unknown',

        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,

        user: safeUser,
        branch: loan.branch,
        plan: loan.plan,

        decisionCount,

        progressPercent,

        isComplete,

        latestDecisionType,

        latestMccDecision,

        finalAmount,

        borrowerName,

        businessName,

        sector,

        historicalDecisionCount,

        activeDecisions: currentDecisions,

        // Preserve the complete historical decision chain for audit/UI use.
        allMccDecisions: allDecisions,
      };
    });

    // ------------------------------------------------------------------------
    // 8. SEARCH FILTER
    // ------------------------------------------------------------------------

    if (search) {
      const q = search.toLowerCase();

      enriched = enriched.filter((loan) => {
        const applicationRef =
          loan.applicationRef?.toLowerCase() ?? '';

        const borrowerName =
          loan.borrowerName.toLowerCase();

        const businessName =
          loan.businessName?.toLowerCase() ?? '';

        const email =
          loan.user?.email?.toLowerCase() ?? '';

        return (
          applicationRef.includes(q) ||
          borrowerName.includes(q) ||
          businessName.includes(q) ||
          email.includes(q)
        );
      });
    }

    // ------------------------------------------------------------------------
    // 9. STATUS FILTER
    // ------------------------------------------------------------------------

    let filtered = enriched;

    if (status === 'pending') {
      filtered = enriched.filter((loan) => {
        return (
          !loan.isComplete &&
          loan.latestDecisionType !== 'rejected'
        );
      });
    } else if (status === 'approved') {
      filtered = enriched.filter((loan) => {
        return (
          loan.isComplete ||
          loan.latestDecisionType === 'approved' ||
          loan.latestDecisionType === 'conditional'
        );
      });
    } else if (status === 'rejected') {
      filtered = enriched.filter((loan) => {
        return loan.latestDecisionType === 'rejected';
      });
    }

    // ------------------------------------------------------------------------
    // 10. SUMMARY STATISTICS
    // ------------------------------------------------------------------------

    // Stats intentionally operate on the same enriched current-state records,
    // before the requested status filter is applied.
    const total = enriched.length;

    const pending = enriched.filter((loan) => {
      return (
        !loan.isComplete &&
        loan.latestDecisionType !== 'rejected'
      );
    }).length;

    const approved = enriched.filter((loan) => {
      return (
        loan.isComplete ||
        loan.latestDecisionType === 'approved' ||
        loan.latestDecisionType === 'conditional'
      );
    }).length;

    const rejected = enriched.filter((loan) => {
      return loan.latestDecisionType === 'rejected';
    }).length;

    // ------------------------------------------------------------------------
    // 11. RESPONSE
    // ------------------------------------------------------------------------

    return NextResponse.json({
      loans: filtered,

      stats: {
        total,
        pending,
        approved,
        rejected,
      },

      meta: {
        totalLevels: TOTAL_MCC_LEVELS,
        roleList: Object.values(MCC_ROLES),
        roleToMcc: ROLE_TO_MCC,

        // Useful to the UI/audit layer.
        appendOnlyDecisions: true,
        historicalDecisionsIncluded: true,
      },
    });
  } catch (error: unknown) {
    console.error('MCC list API error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
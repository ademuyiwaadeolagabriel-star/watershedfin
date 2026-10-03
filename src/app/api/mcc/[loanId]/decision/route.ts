import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { MCC_ROLES, ROLE_TO_MCC } from '@/lib/constants';
import { Prisma } from '@prisma/client';

// ============================================================================
// POST /api/mcc/[loanId]/decision
// Authorization: Bearer <admin-jwt>
//
// Body:
// {
//   recommendedAmount,
//   duration,
//   ccdPercentage,
//   upfrontFeePercentage,
//   interestRatePercentage,
//   comment,
//   decisionType,
//   conditions[],
//   signatureData?,
//   signatureType?
// }
//
// v55 — MCC GOVERNANCE / APPEND-ONLY DECISION FIX
//
// Security properties:
//   1. Approver identity comes ONLY from the verified JWT.
//   2. Approver role is derived from the server-side Admin record.
//   3. Workflow step must match the approver's MCC stage.
//   4. Rejection/defer decisions require a reason.
//   5. Conditional decisions require conditions.
//   6. MCC decisions are append-only.
//   7. Previous ACTIVE decision is superseded rather than overwritten.
//   8. decisionSequence is maintained per loan + MCC role.
//   9. All MCC mutation writes occur inside one SERIALIZABLE transaction.
//  10. ApprovalLog records the JWT-derived actor.
// ============================================================================

// Map MCC role code → expected workflow step(s) for that role.
const MCC_ROLE_TO_EXPECTED_STEPS: Record<string, string[]> = {
  LO: ['LO_ENTRY', 'LO_ASSESSMENT'],
  BM: ['BM_QC', 'BM_VETTING'],
  CA: ['ANALYST_STRUCTURING'],
  HOC: ['HOC_REVIEW', 'HOC_STRUCTURING'],
  CRO: ['CRO_RISK'],
  LEGAL: ['LEGAL_MCC', 'LEGAL_NAME_SEARCH'],
  GCFO: ['CFO_REVIEW'],
  MD: ['MD_APPROVAL'],
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> },
) {
  // ==========================================================================
  // 1. AUTHENTICATION
  // ==========================================================================

  const authResult = await requireRole(req, [
    'super',
    'md',
    'hoc',
    'cro',
    'mcc',
    'credit',
    'legal',
    'bm',
    'loan',
    'analyst',
    'cfo',
  ]);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const authPayload = authResult;

  // IMPORTANT:
  // Approver identity comes from the verified JWT only.
  // Never trust body.approverId.
  const approverId = authPayload.id;

  try {
    // ==========================================================================
    // 2. REQUEST
    // ==========================================================================

    const { loanId } = await params;

    if (!loanId) {
      return NextResponse.json(
        { error: 'Loan ID is required.' },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));

    // ==========================================================================
    // 3. VALIDATE NUMERIC INPUTS
    // ==========================================================================

    const recommendedAmount =
      body.recommendedAmount != null
        ? Number(body.recommendedAmount)
        : null;

    const duration =
      body.duration != null
        ? Number(body.duration)
        : null;

    const ccdPercentage =
      body.ccdPercentage != null
        ? Number(body.ccdPercentage)
        : null;

    const upfrontFeePercentage =
      body.upfrontFeePercentage != null
        ? Number(body.upfrontFeePercentage)
        : null;

    const interestRatePercentage =
      body.interestRatePercentage != null
        ? Number(body.interestRatePercentage)
        : null;

    const numericChecks: Array<
      [string, number | null, number, number]
    > = [
      [
        'recommendedAmount',
        recommendedAmount,
        0,
        Number.MAX_SAFE_INTEGER,
      ],
      [
        'duration',
        duration,
        1,
        120,
      ],
      [
        'ccdPercentage',
        ccdPercentage,
        0,
        100,
      ],
      [
        'upfrontFeePercentage',
        upfrontFeePercentage,
        0,
        100,
      ],
      [
        'interestRatePercentage',
        interestRatePercentage,
        0,
        100,
      ],
    ];

    for (const [name, value, min, max] of numericChecks) {
      if (
        value != null &&
        (
          !Number.isFinite(value) ||
          value < min ||
          value > max
        )
      ) {
        return NextResponse.json(
          {
            error: `${name} is outside the allowed range.`,
          },
          { status: 400 },
        );
      }
    }

    if (
      duration != null &&
      !Number.isInteger(duration)
    ) {
      return NextResponse.json(
        {
          error: 'duration must be a whole number of months.',
        },
        { status: 400 },
      );
    }

    // ==========================================================================
    // 4. DECISION VALIDATION
    // ==========================================================================

    const comment =
      body.comment != null
        ? String(body.comment)
        : null;

    const decisionType =
      String(body.decisionType || 'approved');

    const conditions: string[] =
      Array.isArray(body.conditions)
        ? body.conditions
            .map((value: unknown) => String(value))
            .filter(
              (value: string) =>
                value.trim().length > 0,
            )
        : [];

    const signatureData =
      body.signatureData != null
        ? String(body.signatureData)
        : null;

    const signatureType =
      body.signatureType != null
        ? String(body.signatureType)
        : 'typed';

    const validDecisions = [
      'approved',
      'rejected',
      'deferred',
      'conditional',
    ];

    if (!validDecisions.includes(decisionType)) {
      return NextResponse.json(
        {
          error:
            `decisionType must be one of ${validDecisions.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Rejection / defer MUST include a reason.
    if (
      (
        decisionType === 'rejected' ||
        decisionType === 'deferred'
      ) &&
      (
        !comment ||
        comment.trim().length === 0
      )
    ) {
      return NextResponse.json(
        {
          error:
            `A non-empty comment/reason is required for ${decisionType} decisions.`,
        },
        { status: 400 },
      );
    }

    // Conditional MUST have at least one condition.
    if (
      decisionType === 'conditional' &&
      conditions.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'Conditional decision requires at least one condition.',
        },
        { status: 400 },
      );
    }

    // ==========================================================================
    // 5. AUDIT METADATA
    // ==========================================================================

    const ipAddress =
      req.headers
        .get('x-forwarded-for')
        ?.split(',')[0]
        ?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    // ==========================================================================
    // 6. LOAD LOAN + AUTHENTICATED ADMIN
    // ==========================================================================

    const [loan, admin] = await Promise.all([
      db.loanApplicants.findUnique({
        where: {
          id: loanId,
        },
      }),

      db.admin.findUnique({
        where: {
          id: approverId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          roleType: true,
          branchId: true,
        },
      }),
    ]);

    if (!loan) {
      return NextResponse.json(
        {
          error: 'Loan not found.',
        },
        { status: 404 },
      );
    }

    if (!admin) {
      return NextResponse.json(
        {
          error: 'Approver admin record not found.',
        },
        { status: 404 },
      );
    }

    // ==========================================================================
    // 7. BRANCH SCOPE
    // ==========================================================================

    const branchScopedRoles = new Set([
      'bm',
      'loan',
      'frontdesk',
      'treasury',
    ]);

    const normalizedAdminRole =
      String(admin.role || '').toLowerCase();

    if (
      branchScopedRoles.has(normalizedAdminRole) &&
      admin.branchId &&
      loan.branchId &&
      admin.branchId !== loan.branchId
    ) {
      return NextResponse.json(
        {
          error:
            'Access denied — loan belongs to a different branch.',
        },
        { status: 403 },
      );
    }

    if (
      branchScopedRoles.has(normalizedAdminRole) &&
      !admin.branchId
    ) {
      return NextResponse.json(
        {
          error:
            'Your account is not assigned to a branch.',
        },
        { status: 403 },
      );
    }

    // ==========================================================================
    // 8. DETERMINE MCC ROLE FROM SERVER-SIDE ADMIN RECORD
    // ==========================================================================

    const sourceRole =
      admin.roleType ||
      admin.role ||
      '';

    const approverRoleCode =
      ROLE_TO_MCC[sourceRole] ||
      ROLE_TO_MCC[admin.role] ||
      'LO';

    const mccRoleMeta =
      (MCC_ROLES as any)[approverRoleCode] ||
      MCC_ROLES.LO;

    const approvalLevel: number =
      Number(mccRoleMeta.level);

    const approverName =
      `${admin.firstName} ${admin.lastName}`.trim();

    // ==========================================================================
    // 9. WORKFLOW-STATE CONSISTENCY
    // ==========================================================================

    const expectedSteps =
      MCC_ROLE_TO_EXPECTED_STEPS[
        approverRoleCode
      ] || [];

    if (
      expectedSteps.length > 0 &&
      !expectedSteps.includes(loan.currentStep)
    ) {
      return NextResponse.json(
        {
          error:
            `Out-of-sequence MCC decision: role '${approverRoleCode}' ` +
            `(level ${approvalLevel}) can only decide at step(s) ` +
            `${expectedSteps.join(', ')}, but loan is currently at ` +
            `'${loan.currentStep}'.`,
          currentStep: loan.currentStep,
          expectedSteps,
          approvalLevel,
          approverRole: approverRoleCode,
        },
        { status: 409 },
      );
    }

    // ==========================================================================
    // 10. APPEND-ONLY MCC TRANSACTION
    // ==========================================================================
    //
    // IMPORTANT:
    // priorActive and nextSequence remain INSIDE the transaction.
    //
    // They are returned from the transaction as part of `result`.
    // This completely avoids the previous TypeScript error:
    //
    //   Property 'id' does not exist on type 'never'
    //
    // caused by assigning a transaction-local value to an outer variable and
    // then reading that value later.
    // ==========================================================================

    const result = await db.$transaction(
      async (tx) => {
        // ----------------------------------------------------------------------
        // 10A. Find current ACTIVE decision.
        // ----------------------------------------------------------------------

        const priorActive =
          await tx.mccDecision.findFirst({
            where: {
              loanApplicantId: loanId,
              approverRole: approverRoleCode,
              status: 'ACTIVE',
            },
            orderBy: {
              decisionSequence: 'desc',
            },
            select: {
              id: true,
              decisionSequence: true,
            },
          });

        // ----------------------------------------------------------------------
        // 10B. Determine next sequence number.
        // ----------------------------------------------------------------------

        const maxSeqResult =
          await tx.mccDecision.aggregate({
            where: {
              loanApplicantId: loanId,
              approverRole: approverRoleCode,
            },
            _max: {
              decisionSequence: true,
            },
          });

        const nextSequence =
          (maxSeqResult._max.decisionSequence || 0) + 1;

        // ----------------------------------------------------------------------
        // 10C. Supersede previous ACTIVE decision.
        //
        // IMPORTANT:
        // The old decision remains in the database.
        // We only change its status to SUPERSEDED and preserve history.
        // ----------------------------------------------------------------------

        if (priorActive) {
          await tx.mccDecision.update({
            where: {
              id: priorActive.id,
            },
            data: {
              status: 'SUPERSEDED',
              supersededAt: new Date(),
              supersededById: approverId,
            },
          });
        }

        // ----------------------------------------------------------------------
        // 10D. Create NEW MCC decision.
        // ----------------------------------------------------------------------

        const decision =
          await tx.mccDecision.create({
            data: {
              loanApplicantId: loanId,

              // JWT-derived identity only.
              approverId,

              approverName,
              approverRole: approverRoleCode,
              approvalLevel,

              recommendedAmount,
              duration,
              ccdPercentage,
              upfrontFeePercentage,
              interestRatePercentage,

              comment,
              decisionType,

              decisionDate: new Date(),

              // Append-only governance.
              status: 'ACTIVE',
              decisionSequence: nextSequence,

              supersedesDecisionId:
                priorActive?.id || null,

              // Signature / audit.
              signatureData,
              signatureType,
              signedAt: new Date(),
              ipAddress,
            },

            include: {
              approver: true,
            },
          });

        // ----------------------------------------------------------------------
        // 10E. Protect response from nested admin password.
        // ----------------------------------------------------------------------

        if ((decision as any).approver) {
          (decision as any).approver = {
            ...(decision as any).approver,
            password: undefined,
          };
        }

        // ----------------------------------------------------------------------
        // 10F. Create compliance conditions.
        // ----------------------------------------------------------------------

        let createdConditions: any[] = [];

        if (
          decisionType === 'conditional' &&
          conditions.length > 0
        ) {
          const deadline = new Date();

          deadline.setDate(
            deadline.getDate() + 7,
          );

          createdConditions =
            await Promise.all(
              conditions.map((title) =>
                tx.complianceCondition.create({
                  data: {
                    loanApplicantId: loanId,
                    mccDecisionId: decision.id,
                    setBy: admin.id,
                    setByRole: approverRoleCode,

                    conditionType: 'other',

                    title: title.trim(),
                    description: title.trim(),

                    priority: 'high',

                    deadline,

                    status: 'pending',
                  },
                }),
              ),
            );

          await tx.loanApplicants.update({
            where: {
              id: loanId,
            },
            data: {
              hasComplianceConditions: true,
              complianceStatus:
                'conditions_pending',
            },
          });
        }

        // ----------------------------------------------------------------------
        // 10G. ApprovalLog.
        // ----------------------------------------------------------------------

        const actionMap: Record<
          string,
          string
        > = {
          approved: 'APPROVED',
          rejected: 'REJECTED',
          deferred: 'QUERIED',
          conditional: 'APPROVED',
        };

        await tx.approvalLog.create({
          data: {
            loanApplicantId: loanId,

            // JWT-derived actor.
            adminId: admin.id,

            action:
              actionMap[decisionType] ||
              'APPROVED',

            roleAtTimeOfAction:
              approverRoleCode,

            comments:
              comment ||
              `MCC decision: ${decisionType}`,

            metadata: JSON.stringify({
              mccDecisionId:
                decision.id,

              approvalLevel,

              recommendedAmount,
              duration,
              ccdPercentage,
              upfrontFeePercentage,
              interestRatePercentage,

              conditionsCount:
                createdConditions.length,

              decisionSequence:
                nextSequence,

              supersedesDecisionId:
                priorActive?.id || null,

              ipAddress,

              authSource: 'jwt',
            }),
          },
        });

        // ----------------------------------------------------------------------
        // 10H. Workflow-specific LoanApplicants updates.
        // ----------------------------------------------------------------------

        const loanUpdate: Record<
          string,
          unknown
        > = {};

        if (approverRoleCode === 'BM') {
          loanUpdate.bmRecommendedAmount =
            recommendedAmount;

          if (duration != null) {
            loanUpdate.bmRecommendedTenor =
              duration;
          }

          loanUpdate.bmComment =
            comment;

          loanUpdate.bmVerifiedAt =
            new Date();

          loanUpdate.bmValidatedBy =
            admin.id;
        }

        else if (
          approverRoleCode === 'HOC'
        ) {
          loanUpdate.hocRecommendedAmount =
            recommendedAmount;

          if (duration != null) {
            loanUpdate.hocRecommendedTenor =
              duration;
          }

          loanUpdate.hocComment =
            comment;

          loanUpdate.hocStructuredAt =
            new Date();
        }

        else if (
          approverRoleCode === 'MD'
        ) {
          // MD establishes/updates final sanctioned terms via
          // a NEW append-only MCC decision.

          if (
            recommendedAmount != null
          ) {
            loanUpdate.finalAmount =
              recommendedAmount;
          }

          if (duration != null) {
            loanUpdate.finalTenure =
              duration;
          }

          if (
            interestRatePercentage != null
          ) {
            loanUpdate.finalInterestRate =
              interestRatePercentage;
          }

          if (
            ccdPercentage != null
          ) {
            loanUpdate.finalCcdFeePercent =
              ccdPercentage;
          }

          if (
            upfrontFeePercentage != null
          ) {
            loanUpdate.finalUpfrontFeePercent =
              upfrontFeePercentage;
          }

          loanUpdate.mdApprovedAt =
            new Date();

          loanUpdate.finalApprovedAmount =
            recommendedAmount;

          if (duration != null) {
            loanUpdate.finalApprovedTenor =
              duration;
          }

          loanUpdate.approvedDate =
            new Date();

          loanUpdate.approvedAmount =
            recommendedAmount;

          if (duration != null) {
            loanUpdate.approvedTenor =
              duration;
          }

          if (
            interestRatePercentage != null
          ) {
            loanUpdate.percent =
              interestRatePercentage;
          }
        }

        else if (
          approverRoleCode === 'GCFO'
        ) {
          // CFO recommendation only.
          // CFO does not overwrite finalAmount.

          loanUpdate.cfoApprovedAmount =
            recommendedAmount;

          if (duration != null) {
            loanUpdate.cfoApprovedTenor =
              duration;
          }

          loanUpdate.cfoComment =
            comment;

          loanUpdate.cfoClearedAt =
            new Date();

          loanUpdate.cfoVerifiedAt =
            new Date();
        }

        else if (
          approverRoleCode === 'CRO'
        ) {
          // CRO records risk/exposure opinion.
          // CRO does not overwrite finalAmount.

          loanUpdate.riskApprovedAmount =
            recommendedAmount;

          loanUpdate.riskApprovedAt =
            new Date();

          loanUpdate.croCheckedAt =
            new Date();
        }

        else if (
          approverRoleCode === 'LEGAL'
        ) {
          loanUpdate.legalClearedAt =
            new Date();

          loanUpdate.legalStatus =
            'cleared';
        }

        else if (
          approverRoleCode === 'CA'
        ) {
          loanUpdate.analystReviewedAt =
            new Date();

          if (
            recommendedAmount != null
          ) {
            loanUpdate.appraisedAmount =
              recommendedAmount;
          }

          if (duration != null) {
            loanUpdate.appraisedTenor =
              duration;
          }
        }

        else if (
          approverRoleCode === 'LO'
        ) {
          if (
            recommendedAmount != null
          ) {
            loanUpdate.vettedAmount =
              recommendedAmount;
          }

          if (duration != null) {
            loanUpdate.vettedDuration =
              duration;
          }

          if (
            interestRatePercentage != null
          ) {
            loanUpdate.vettedInterestRate =
              interestRatePercentage;
          }

          loanUpdate.submittedAt =
            new Date();
        }

        // ----------------------------------------------------------------------
        // 10I. Persist LoanApplicants updates.
        // ----------------------------------------------------------------------

        if (
          Object.keys(loanUpdate).length > 0
        ) {
          await tx.loanApplicants.update({
            where: {
              id: loanId,
            },
            data: loanUpdate,
          });
        }

        // ----------------------------------------------------------------------
        // 10J. Return EVERYTHING needed by the HTTP response.
        // ----------------------------------------------------------------------

        return {
          decision,
          createdConditions,
          loanUpdate,
          priorActive,
          nextSequence,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,

        maxWait: 5000,
        timeout: 15000,
      },
    );

    // ==========================================================================
    // 11. RESPONSE
    // ==========================================================================

    return NextResponse.json({
      decision:
        result.decision,

      createdConditions:
        result.createdConditions,

      approverRole:
        approverRoleCode,

      approvalLevel,

      loanUpdate:
        result.loanUpdate,

      superseded:
        result.priorActive
          ? {
              id:
                result.priorActive.id,
              decisionSequence:
                result.priorActive
                  .decisionSequence,
            }
          : null,

      decisionSequence:
        result.nextSequence,

      authSource: 'jwt',
    });
  } catch (error: unknown) {
    console.error(
      'MCC decision POST error:',
      error,
    );

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

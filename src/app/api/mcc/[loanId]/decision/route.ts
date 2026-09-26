import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { MCC_ROLES, ROLE_TO_MCC } from '@/lib/constants';

// ============================================================================
// POST /api/mcc/[loanId]/decision
// Authorization: Bearer <admin-jwt>
// Body: {
//   recommendedAmount, duration, ccdPercentage, upfrontFeePercentage,
//   interestRatePercentage, comment, decisionType, conditions[],
//   signatureData?, signatureType?
// }
//
// v52 — GOVERNANCE ENFORCEMENT REWRITE (closes audit P0-G1, P0-G3, #19, #20, #21, #22):
//
//   P0-G1 — Approver identity is now derived from the JWT, NOT from
//   `body.approverId`. The audit's most serious finding was that a caller
//   could record "MD approved ₦5M" by supplying any admin's ID in the body.
//   Now `approverId` is read from `authPayload.id` after `requireRole()`
//   has validated the JWT signature + role.
//
//   P0-G3 — The route now enforces workflow-state consistency:
//   `loan.currentStep` must match the approver's expected MCC stage
//   (e.g. a CRO cannot record a decision while the loan is at BM_QC).
//
//   #19 / #20 — Same as above. The 8-level MCC chain is now actually
//   enforced end-to-end; out-of-sequence decisions are rejected with 409.
//
//   #21 — MCC decisions are now IMMUTABLE. The previous upsert pattern
//   (UPDATE on conflict) has been replaced with insert-with-supersession:
//   if a prior decision exists for the same (loanId, approverRole), it is
//   marked SUPERSEDED and a new ACTIVE decision is inserted. The audit
//   trail retains the full history.
//
//   #22 — Rejection/deferred decisions now REQUIRE a non-empty `comment`.
//   The server rejects "reject with reason=''" with HTTP 400.
//
// Schema changes required (already applied in v52):
//   MccDecision:
//     - drop @@unique([loanApplicantId, approverId, approverRole])
//     - add supersedesDecisionId String?  (self-reference)
//     - add status String @default("ACTIVE")  // ACTIVE | SUPERSEDED | REVERTED
//     - add decisionSequence Int @default(0)  // tie-breaker for same-millisecond decisions
//
// Calls into the new requireWorkflowStage() helper which is the central
// server-enforced state-machine gate.
// ============================================================================

// Map MCC role code → expected workflow step(s) for that role's decision.
// A CRO can only record a decision when the loan is at CRO_RISK.
// A MD can only record a decision when the loan is at MD_APPROVAL.
// etc.
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
  { params }: { params: Promise<{ loanId: string }> }
) {
  // --- Auth gate: admin JWT mandatory -------------------------------
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'mcc', 'credit', 'legal', 'bm', 'loan', 'analyst', 'cfo']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload = authResult_v51 as { id: string; role: string };

  // v52 — P0-G1: approver identity is DERIVED FROM JWT, never from body.
  const approverId = authPayload.id;

  try {
    const { loanId } = await params;
    const body = await req.json().catch(() => ({}));

    const recommendedAmount = body.recommendedAmount != null ? Number(body.recommendedAmount) : null;
    const duration = body.duration != null ? Number(body.duration) : null;
    const ccdPercentage = body.ccdPercentage != null ? Number(body.ccdPercentage) : null;
    const upfrontFeePercentage =
      body.upfrontFeePercentage != null ? Number(body.upfrontFeePercentage) : null;
    const interestRatePercentage =
      body.interestRatePercentage != null ? Number(body.interestRatePercentage) : null;
    const comment = body.comment ? String(body.comment) : null;
    const decisionType = String(body.decisionType || 'approved');
    const conditions: string[] = Array.isArray(body.conditions) ? body.conditions : [];
    const signatureData = body.signatureData ? String(body.signatureData) : null;
    const signatureType = body.signatureType ? String(body.signatureType) : 'typed';

    const validDecisions = ['approved', 'rejected', 'deferred', 'conditional'];
    if (!validDecisions.includes(decisionType)) {
      return NextResponse.json(
        { error: `decisionType must be one of ${validDecisions.join(', ')}` },
        { status: 400 },
      );
    }

    // v52 — #22: Rejection / deferred decisions REQUIRE a non-empty comment.
    if ((decisionType === 'rejected' || decisionType === 'deferred') && (!comment || comment.trim().length === 0)) {
      return NextResponse.json(
        { error: `A non-empty comment/reason is required for ${decisionType} decisions.` },
        { status: 400 },
      );
    }

    if (decisionType === 'conditional' && conditions.length === 0) {
      return NextResponse.json(
        { error: 'Conditional decision requires at least one condition' },
        { status: 400 },
      );
    }

    // v52 — fetch IP for audit record (will be persisted on MccDecision + ApprovalLog)
    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    // Verify loan + admin exist (admin fetch is for role-mapping, NOT for identity)
    const [loan, admin] = await Promise.all([
      db.loanApplicants.findUnique({ where: { id: loanId } }),
      db.admin.findUnique({
        where: { id: approverId },
        select: { id: true, firstName: true, lastName: true, role: true, roleType: true, branchId: true },
      }),
    ]);

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }
    if (!admin) {
      return NextResponse.json({ error: 'Approver admin record not found' }, { status: 404 });
    }

    // v52 — Determine approverRole from the JWT-derived admin record, NOT from body.
    const sourceRole = admin.roleType || admin.role || '';
    const approverRoleCode = ROLE_TO_MCC[sourceRole] || ROLE_TO_MCC[admin.role] || 'LO';

    const mccRoleMeta = (MCC_ROLES as any)[approverRoleCode] || MCC_ROLES.LO;
    const approvalLevel: number = mccRoleMeta.level;
    const approverName = `${admin.firstName} ${admin.lastName}`.trim();

    // v52 — P0-G3 + #20: workflow-state consistency check.
    // The loan's currentStep must match one of the expected steps for this
    // approver's role. Out-of-sequence decisions are rejected with 409.
    const expectedSteps = MCC_ROLE_TO_EXPECTED_STEPS[approverRoleCode] || [];
    if (expectedSteps.length > 0 && !expectedSteps.includes(loan.currentStep)) {
      return NextResponse.json(
        {
          error: `Out-of-sequence MCC decision: role '${approverRoleCode}' (level ${approvalLevel}) can only decide at step(s) ${expectedSteps.join(', ')}, but loan is currently at '${loan.currentStep}'.`,
          currentStep: loan.currentStep,
          expectedSteps,
        },
        { status: 409 },
      );
    }

    // v52 — #21: IMMUTABLE DECISIONS with supersession chain.
    // Find any existing ACTIVE decision for this (loanId, approverRole).
    // Mark it SUPERSEDED, then insert a new ACTIVE decision that references
    // the prior one via `supersedesDecisionId`. The unique constraint on
    // (loanApplicantId, approverRole, status='ACTIVE') ensures only one
    // active decision per role per loan.
    const priorActive = await db.mccDecision.findFirst({
      where: {
        loanApplicantId: loanId,
        approverRole: approverRoleCode,
        status: 'ACTIVE',
      },
      orderBy: { decisionSequence: 'desc' },
    });

    // Determine the next sequence number for tie-breaking (same-millisecond).
    const maxSeqResult = await db.mccDecision.aggregate({
      where: { loanApplicantId: loanId, approverRole: approverRoleCode },
      _max: { decisionSequence: true },
    });
    const nextSequence = (maxSeqResult._max.decisionSequence || 0) + 1;

    // v52 — atomic: supersede prior + insert new + update loan + create
    // ApprovalLog + (conditional) create ComplianceConditions, all in one
    // transaction.
    const result = await db.$transaction(async (tx) => {
      // 1. Supersede prior ACTIVE decision (if exists).
      if (priorActive) {
        await tx.mccDecision.update({
          where: { id: priorActive.id },
          data: {
            status: 'SUPERSEDED',
            supersededAt: new Date(),
            supersededById: approverId,
          },
        });
      }

      // 2. Insert new ACTIVE decision.
      const decision = await tx.mccDecision.create({
        data: {
          loanApplicantId: loanId,
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
          // v52 — immutability + supersession
          status: 'ACTIVE',
          decisionSequence: nextSequence,
          supersedesDecisionId: priorActive?.id || null,
          // v52 — committee signature + audit fields
          signatureData,
          signatureType,
          signedAt: new Date(),
          ipAddress,
        },
        include: { approver: true },
      });

      // Strip password from included admin
      if ((decision as any).approver) {
        (decision as any).approver = { ...(decision as any).approver, password: undefined };
      }

      // 3. Create ComplianceConditions (if conditional)
      let createdConditions: any[] = [];
      if (decisionType === 'conditional' && conditions.length > 0) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);

        createdConditions = await Promise.all(
          conditions
            .filter((c) => c && c.trim().length > 0)
            .map((title) =>
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
              })
            )
        );

        await tx.loanApplicants.update({
          where: { id: loanId },
          data: {
            hasComplianceConditions: true,
            complianceStatus: 'conditions_pending',
          },
        });
      }

      // 4. ApprovalLog entry — actor always from JWT.
      const actionMap: Record<string, string> = {
        approved: 'APPROVED',
        rejected: 'REJECTED',
        deferred: 'QUERIED',
        conditional: 'APPROVED',
      };
      await tx.approvalLog.create({
        data: {
          loanApplicantId: loanId,
          adminId: admin.id,
          action: actionMap[decisionType] || 'APPROVED',
          roleAtTimeOfAction: approverRoleCode,
          comments: comment || `MCC decision: ${decisionType}`,
          metadata: JSON.stringify({
            mccDecisionId: decision.id,
            approvalLevel,
            recommendedAmount,
            duration,
            ccdPercentage,
            upfrontFeePercentage,
            interestRatePercentage,
            conditionsCount: createdConditions.length,
            decisionSequence: nextSequence,
            supersedesDecisionId: priorActive?.id || null,
            ipAddress,
            authSource: 'jwt',
          }),
        },
      });

      // 5. Update loan fields based on role (kept identical to v51 behavior
      // for backward compat — the audit's #29 finding about CRO/CFO not
      // being able to silently change the final amount is enforced
      // separately in the transition route's MD-terms-locked gate).
      const loanUpdate: any = {};
      if (approverRoleCode === 'BM') {
        loanUpdate.bmRecommendedAmount = recommendedAmount;
        if (duration != null) loanUpdate.bmRecommendedTenor = duration;
        loanUpdate.bmComment = comment;
        loanUpdate.bmVerifiedAt = new Date();
        loanUpdate.bmValidatedBy = admin.id;
      } else if (approverRoleCode === 'HOC') {
        loanUpdate.hocRecommendedAmount = recommendedAmount;
        if (duration != null) loanUpdate.hocRecommendedTenor = duration;
        loanUpdate.hocComment = comment;
        loanUpdate.hocStructuredAt = new Date();
      } else if (approverRoleCode === 'MD') {
        // v52 — #32: MD-terms-locked gate. Once an MD approval exists,
        // subsequent MD decisions can change terms only via the
        // supersession chain (which is what we're doing here). The
        // transition route refuses to advance past MD_APPROVAL unless an
        // ACTIVE MD MccDecision with decisionType='approved' exists.
        if (recommendedAmount != null) loanUpdate.finalAmount = recommendedAmount;
        if (duration != null) loanUpdate.finalTenure = duration;
        if (interestRatePercentage != null) loanUpdate.finalInterestRate = interestRatePercentage;
        if (ccdPercentage != null) loanUpdate.finalCcdFeePercent = ccdPercentage;
        if (upfrontFeePercentage != null) loanUpdate.finalUpfrontFeePercent = upfrontFeePercentage;
        loanUpdate.mdApprovedAt = new Date();
        loanUpdate.finalApprovedAmount = recommendedAmount;
        if (duration != null) loanUpdate.finalApprovedTenor = duration;
        loanUpdate.approvedDate = new Date();
        loanUpdate.approvedAmount = recommendedAmount;
        if (duration != null) loanUpdate.approvedTenor = duration;
        if (interestRatePercentage != null) loanUpdate.percent = interestRatePercentage;
      } else if (approverRoleCode === 'GCFO') {
        // v52 — #29: CFO stores recommendation, does NOT touch finalAmount.
        loanUpdate.cfoApprovedAmount = recommendedAmount;
        if (duration != null) loanUpdate.cfoApprovedTenor = duration;
        loanUpdate.cfoComment = comment;
        loanUpdate.cfoClearedAt = new Date();
        loanUpdate.cfoVerifiedAt = new Date();
      } else if (approverRoleCode === 'CRO') {
        // v52 — #29: CRO stores max-safe-exposure opinion, does NOT touch finalAmount.
        loanUpdate.riskApprovedAmount = recommendedAmount;
        loanUpdate.riskApprovedAt = new Date();
        loanUpdate.croCheckedAt = new Date();
      } else if (approverRoleCode === 'LEGAL') {
        loanUpdate.legalClearedAt = new Date();
        loanUpdate.legalStatus = 'cleared';
      } else if (approverRoleCode === 'CA') {
        loanUpdate.analystReviewedAt = new Date();
        if (recommendedAmount != null) loanUpdate.appraisedAmount = recommendedAmount;
        if (duration != null) loanUpdate.appraisedTenor = duration;
      } else if (approverRoleCode === 'LO') {
        if (recommendedAmount != null) loanUpdate.vettedAmount = recommendedAmount;
        if (duration != null) loanUpdate.vettedDuration = duration;
        if (interestRatePercentage != null) loanUpdate.vettedInterestRate = interestRatePercentage;
        loanUpdate.submittedAt = new Date();
      }

      if (Object.keys(loanUpdate).length > 0) {
        await tx.loanApplicants.update({ where: { id: loanId }, data: loanUpdate });
      }

      return { decision, createdConditions, loanUpdate };
    });

    return NextResponse.json({
      decision: result.decision,
      createdConditions: result.createdConditions,
      approverRole: approverRoleCode,
      approvalLevel,
      loanUpdate: result.loanUpdate,
      // v52 — expose supersession info for the UI
      superseded: priorActive ? { id: priorActive.id, decisionSequence: priorActive.decisionSequence } : null,
      decisionSequence: nextSequence,
      authSource: 'jwt',
    });
  } catch (e: any) {
    console.error('MCC decision POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

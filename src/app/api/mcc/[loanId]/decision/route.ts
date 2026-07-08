import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCC_ROLES, ROLE_TO_MCC } from '@/lib/constants';

// ============================================================================
// MCC DECISION — Record (or update) an MCC decision
// Body: {
//   approverId, recommendedAmount, duration, ccdPercentage,
//   upfrontFeePercentage, interestRatePercentage, comment,
//   decisionType, conditions[]
// }
// ============================================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> }
) {
  try {
    const { loanId } = await params;
    const body = await req.json();

    const approverId = String(body.approverId || '');
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

    if (!approverId) {
      return NextResponse.json({ error: 'approverId is required' }, { status: 400 });
    }

    const validDecisions = ['approved', 'rejected', 'deferred', 'conditional'];
    if (!validDecisions.includes(decisionType)) {
      return NextResponse.json(
        { error: `decisionType must be one of ${validDecisions.join(', ')}` },
        { status: 400 }
      );
    }

    if (decisionType === 'conditional' && conditions.length === 0) {
      return NextResponse.json(
        { error: 'Conditional decision requires at least one condition' },
        { status: 400 }
      );
    }

    // Verify loan + admin exist
    const [loan, admin] = await Promise.all([
      db.loanApplicants.findUnique({ where: { id: loanId } }),
      db.admin.findUnique({ where: { id: approverId } }),
    ]);

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }
    if (!admin) {
      return NextResponse.json({ error: 'Approver not found' }, { status: 404 });
    }

    // Determine approverRole from ROLE_TO_MCC mapping based on admin.role or admin.roleType
    const sourceRole = admin.roleType || admin.role || '';
    const approverRoleCode = ROLE_TO_MCC[sourceRole] || ROLE_TO_MCC[admin.role] || 'LO';

    const mccRoleMeta = (MCC_ROLES as any)[approverRoleCode] || MCC_ROLES.LO;
    const approvalLevel: number = mccRoleMeta.level;
    const approverName = `${admin.firstName} ${admin.lastName}`.trim();

    // Upsert on (loanApplicantId, approverId, approverRole) — allows updating own decision
    const existing = await db.mccDecision.findFirst({
      where: {
        loanApplicantId: loanId,
        approverId,
        approverRole: approverRoleCode,
      },
    });

    const decisionData: any = {
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
    };

    let decision: any;
    if (existing) {
      decision = await db.mccDecision.update({
        where: { id: existing.id },
        data: decisionData,
        include: { approver: true },
      });
    } else {
      decision = await db.mccDecision.create({
        data: decisionData,
        include: { approver: true },
      });
    }

    // Strip password
    if (decision.approver) {
      decision.approver = { ...decision.approver, password: undefined };
    }

    // If conditional — create ComplianceCondition records from the conditions array
    let createdConditions: any[] = [];
    if (decisionType === 'conditional' && conditions.length > 0) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7); // 7-day default deadline

      createdConditions = await Promise.all(
        conditions
          .filter((c) => c && c.trim().length > 0)
          .map((title) =>
            db.complianceCondition.create({
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

      // Update loan compliance status to "conditions_pending"
      await db.loanApplicants.update({
        where: { id: loanId },
        data: {
          hasComplianceConditions: true,
          complianceStatus: 'conditions_pending',
        },
      });
    }

    // Create ApprovalLog entry
    const actionMap: Record<string, string> = {
      approved: 'APPROVED',
      rejected: 'REJECTED',
      deferred: 'QUERIED',
      conditional: 'APPROVED',
    };
    await db.approvalLog.create({
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
        }),
      },
    });

    // Update loan fields based on role
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
      loanUpdate.cfoApprovedAmount = recommendedAmount;
      if (duration != null) loanUpdate.cfoApprovedTenor = duration;
      loanUpdate.cfoComment = comment;
      loanUpdate.cfoClearedAt = new Date();
      loanUpdate.cfoVerifiedAt = new Date();
    } else if (approverRoleCode === 'CRO') {
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
      await db.loanApplicants.update({ where: { id: loanId }, data: loanUpdate });
    }

    return NextResponse.json({
      decision,
      createdConditions,
      approverRole: approverRoleCode,
      approvalLevel,
      loanUpdate,
    });
  } catch (e: any) {
    console.error('MCC decision POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

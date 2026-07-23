import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  MCC_ROLES,
  ROLE_TO_MCC,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_BADGES,
  LOAN_STEP_LABELS,
  CP_CHECKLIST_ITEMS,
  CP_CHECKLIST_TOTAL,
} from '@/lib/constants';

// ============================================================================
// MCC PAPER — Full MCC decision paper for one loan
// Returns: customer info + decisions + summary + loan status + CP checklist
// ============================================================================

// Standard 7 approver designations ordered by Excel "COMMITTEE'S DECISION" sheet
const STANDARD_APPROVERS: {
  code: string;
  designation: string;
  fullName: string;
}[] = [
  { code: 'LO', designation: 'LO', fullName: 'Loan Officer' },
  { code: 'CA', designation: 'CA', fullName: 'Credit Analyst' },
  { code: 'HOC', designation: 'HOC', fullName: 'Head of Credit' },
  { code: 'CRO', designation: 'CRO', fullName: 'Chief Risk Officer' },
  { code: 'LEGAL', designation: 'LEGAL', fullName: 'Legal Officer' },
  { code: 'GCFO', designation: 'GCFO', fullName: 'Group CFO' },
  { code: 'MD', designation: 'MD/CEO', fullName: 'MD / CEO' },
];

function buildChecklistPayload(
  conditions: any[],
  preDisbursement: any | null,
  internalControlMeta: {
    status: string;
    officerId: string | null;
    officerName: string | null;
    notes: string | null;
    verifiedAt: string | null;
  }
) {
  // Build a quick lookup from ComplianceCondition rows that match the standard
  // 22 CP items. We persist these with conditionType='document_upload' and the
  // item id stored in the `fieldName` column.
  const condByItemId: Record<string, any> = {};
  for (const c of conditions) {
    if (c.conditionType === 'document_upload' && c.fieldName) {
      condByItemId[c.fieldName] = c;
    }
  }

  const vehiclePapers: any[] = [];
  const legalMortgage: any[] = [];
  const loanSupport: any[] = [];

  let verifiedCount = 0;

  for (const def of CP_CHECKLIST_ITEMS) {
    const cond = condByItemId[def.id];
    const verified = cond?.status === 'verified';
    if (verified) verifiedCount += 1;

    const item: any = {
      id: def.id,
      label: def.label,
      category: def.category,
      verified,
      verifiedBy: cond?.verifiedBy ?? null,
      verifiedAt: cond?.verifiedAt ? new Date(cond.verifiedAt).toISOString() : null,
      conditionId: cond?.id ?? null,
      status: cond?.status ?? 'pending',
    };
    if (def.hasSatisfaction) {
      item.satisfaction = cond?.verificationNotes ?? '';
    }

    if (def.category === 'vehiclePapers') vehiclePapers.push(item);
    else if (def.category === 'legalMortgage') legalMortgage.push(item);
    else loanSupport.push(item);
  }

  return {
    checklist: { vehiclePapers, legalMortgage, loanSupport },
    totalItems: CP_CHECKLIST_TOTAL,
    verifiedCount,
    isComplete: verifiedCount >= CP_CHECKLIST_TOTAL,
    internalControlStatus: internalControlMeta.status,
    internalControlOfficer: internalControlMeta.officerName,
    internalControlOfficerId: internalControlMeta.officerId,
    internalControlNotes: internalControlMeta.notes,
    internalControlVerifiedAt: internalControlMeta.verifiedAt,
    preDisbursement: preDisbursement,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> }
) {
  try {
    const { loanId } = await params;

    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      include: {
        user: { include: { business: true } },
        branch: true,
        plan: true,
        loanOfficer: true,
        mccDecisions: {
          orderBy: [{ approvalLevel: 'asc' }, { decisionDate: 'asc' }],
          include: { approver: true },
        },
        complianceConditions: {
          orderBy: { createdAt: 'desc' },
        },
        preDisbursementChecklist: true,
        approvalLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { admin: true },
        },
      },
    });

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }

    // Strip passwords from related admins
    const safeUser = loan.user ? { ...loan.user, password: undefined } : null;
    const safeLoanOfficer = loan.loanOfficer
      ? { ...loan.loanOfficer, password: undefined }
      : null;
    const decisions = (loan.mccDecisions || []).map((d: any) => ({
      ...d,
      approver: d.approver ? { ...d.approver, password: undefined } : null,
    }));

    // Compute summary
    const TOTAL_MCC_LEVELS = Object.keys(MCC_ROLES).length; // 8
    const initialAmount = loan.amount || 0;
    const lastDecision = decisions.length > 0 ? decisions[decisions.length - 1] : null;
    const finalAmount = lastDecision?.recommendedAmount ?? loan.finalAmount ?? loan.approvedAmount ?? initialAmount;
    const amountChange = (finalAmount || 0) - initialAmount;
    const amountChangePercent =
      initialAmount > 0
        ? Number((((finalAmount || 0) - initialAmount) / initialAmount) * 100)
        : 0;
    const decisionCount = decisions.length;
    const progressPercent = Math.round((decisionCount / TOTAL_MCC_LEVELS) * 100);
    const isComplete = decisionCount >= TOTAL_MCC_LEVELS;

    // Latest rates come from the most recent decision that has values
    const latestWithRates = [...decisions]
      .reverse()
      .find((d) => d.ccdPercentage != null || d.interestRatePercentage != null || d.upfrontFeePercentage != null);

    const latestRates = latestWithRates
      ? {
          ccd: latestWithRates.ccdPercentage ?? loan.finalCcdFeePercent ?? null,
          upfront: latestWithRates.upfrontFeePercentage ?? loan.finalUpfrontFeePercent ?? null,
          interest: latestWithRates.interestRatePercentage ?? loan.finalInterestRate ?? loan.percent ?? null,
        }
      : {
          ccd: loan.finalCcdFeePercent ?? null,
          upfront: loan.finalUpfrontFeePercent ?? null,
          interest: loan.finalInterestRate ?? loan.percent ?? null,
        };

    // Customer info block (compact)
    const customerInfo = {
      borrowerName: safeUser ? `${safeUser.firstName} ${safeUser.lastName}` : '—',
      email: safeUser?.email ?? null,
      phone: safeUser?.phone ?? null,
      businessName: safeUser?.business?.name ?? null,
      sector: safeUser?.business?.sector ?? null,
      requestedAmount: initialAmount,
      tenure: loan.duration,
      bvn: safeUser?.bvn ?? null,
      accountNumber: safeUser?.accountNumber ?? null,
      branch: loan.branch?.name ?? null,
      loanOfficer: safeLoanOfficer
        ? `${safeLoanOfficer.firstName} ${safeLoanOfficer.lastName}`
        : null,
    };

    const summary = {
      initialAmount,
      finalAmount,
      amountChange,
      amountChangePercent: Number(amountChangePercent.toFixed(2)),
      progressPercent,
      decisionCount,
      totalLevels: TOTAL_MCC_LEVELS,
      isComplete,
      latestRates,
      latestDecisionType: lastDecision?.decisionType ?? null,
      latestDecisionDate: lastDecision?.decisionDate ?? null,
    };

    const loanStatus = {
      status: loan.status,
      statusLabel: LOAN_STATUS_LABELS[loan.status] || loan.status,
      statusBadge: LOAN_STATUS_BADGES[loan.status] || '',
      currentStep: loan.currentStep,
      currentStepLabel: LOAN_STEP_LABELS[loan.currentStep] || loan.currentStep,
      mdApprovedAt: loan.mdApprovedAt,
      auditPassedAt: loan.auditPassedAt,
      finalApprovedAmount: loan.finalApprovedAmount,
      finalApprovedTenor: loan.finalApprovedTenor,
    };

    // Build committee decision table rows — always 7 standard approvers,
    // overlaying the recorded decision if one exists for that role.
    const decisionsByRole: Record<string, any> = {};
    for (const d of decisions) {
      // Keep the latest decision per role (decisions are already ordered by level/date asc)
      decisionsByRole[d.approverRole] = d;
    }
    const committeeTable = STANDARD_APPROVERS.map((a, idx) => {
      const d = decisionsByRole[a.code];
      return {
        sn: idx + 1,
        roleCode: a.code,
        designation: a.designation,
        defaultName: a.fullName,
        decision: d
          ? {
              id: d.id,
              name: d.approverName,
              designation: a.designation,
              amount: d.recommendedAmount,
              duration: d.duration,
              ccdPercentage: d.ccdPercentage,
              upfrontFeePercentage: d.upfrontFeePercentage,
              interestRatePercentage: d.interestRatePercentage,
              comment: d.comment,
              decisionType: d.decisionType,
              decisionDate: d.decisionDate,
              approverId: d.approverId,
            }
          : null,
        status: d ? d.decisionType : 'pending',
      };
    });

    // Internal Control verification meta — comes from pre-disbursement checklist
    // (the IC officer's verification is recorded there) plus approval logs.
    const pd = loan.preDisbursementChecklist;
    const icApprovalLog = (loan.approvalLogs || []).find(
      (l: any) =>
        l.roleAtTimeOfAction === 'internalControl' ||
        l.roleAtTimeOfAction === 'INTERNAL_CONTROL' ||
        (l.metadata || '').includes('internal_control') ||
        (l.metadata || '').includes('INTERNAL_CONTROL_CHECK')
    );
    let icStatus: 'pending' | 'verified' | 'rejected' = 'pending';
    if (pd?.status === 'disbursement_approved' || loan.auditPassedAt) icStatus = 'verified';
    else if (pd?.status === 'disbursement_rejected') icStatus = 'rejected';

    const icOfficerId = pd?.approvedBy || pd?.rejectedBy || icApprovalLog?.adminId || null;
    let icOfficerName: string | null = null;
    if (icOfficerId) {
      const icAdmin =
        pd?.approvedBy || pd?.rejectedBy
          ? await db.admin.findUnique({ where: { id: icOfficerId } })
          : icApprovalLog?.admin;
      if (icAdmin) icOfficerName = `${icAdmin.firstName} ${icAdmin.lastName}`;
    }

    const checklistPayload = buildChecklistPayload(
      loan.complianceConditions || [],
      pd,
      {
        status: icStatus,
        officerId: icOfficerId,
        officerName: icOfficerName,
        notes: pd?.approvalNotes || pd?.rejectionReason || icApprovalLog?.comments || null,
        verifiedAt: (() => {
          const d = pd?.approvedAt || loan.auditPassedAt || null;
          return d ? d.toISOString() : null;
        })(),
      }
    );

    return NextResponse.json({
      loan: {
        id: loan.id,
        applicationRef: loan.applicationRef,
        reason: loan.reason,
        repaymentPlan: loan.repaymentPlan,
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
        user: safeUser,
        branch: loan.branch,
        plan: loan.plan,
        loanOfficer: safeLoanOfficer,
        complianceConditions: loan.complianceConditions,
      },
      customerInfo,
      decisions,
      committeeTable,
      summary,
      loanStatus,
      checklist: checklistPayload,
      meta: {
        mccRoles: MCC_ROLES,
        roleToMcc: ROLE_TO_MCC,
        standardApprovers: STANDARD_APPROVERS,
      },
    });
  } catch (e: any) {
    console.error('MCC paper API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

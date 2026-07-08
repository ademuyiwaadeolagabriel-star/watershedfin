import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  CP_CHECKLIST_ITEMS,
  CP_CHECKLIST_TOTAL,
  ROLE_TO_MCC,
} from '@/lib/constants';

// ============================================================================
// MCC CHECKLIST — Conditions Precedent to Drawdown
// GET    — returns the 22 standard checklist items + verification status
// POST   — toggles one item, or "verify_all" / "reject" the entire checklist
// ============================================================================

function buildChecklistPayload(conditions: any[], pd: any | null, loan: any) {
  const condByItemId: Record<string, any> = {};
  for (const c of conditions) {
    if (c.conditionType === 'document_upload' && c.fieldName) {
      condByItemId[c.fieldName] = c;
    }
  }

  const grouped: Record<string, any[]> = {
    vehiclePapers: [],
    legalMortgage: [],
    loanSupport: [],
  };

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
    grouped[def.category].push(item);
  }

  let icStatus: 'pending' | 'verified' | 'rejected' = 'pending';
  if (pd?.status === 'disbursement_approved' || loan.auditPassedAt) icStatus = 'verified';
  else if (pd?.status === 'disbursement_rejected') icStatus = 'rejected';

  return {
    checklist: {
      vehiclePapers: grouped.vehiclePapers,
      legalMortgage: grouped.legalMortgage,
      loanSupport: grouped.loanSupport,
    },
    totalItems: CP_CHECKLIST_TOTAL,
    verifiedCount,
    isComplete: verifiedCount >= CP_CHECKLIST_TOTAL,
    internalControlStatus: icStatus,
    internalControlOfficer: pd?.approvedBy || pd?.rejectedBy || null,
    internalControlNotes: pd?.approvalNotes || pd?.rejectionReason || null,
    internalControlVerifiedAt: pd?.approvedAt || loan.auditPassedAt || null,
  };
}

// GET /api/mcc/[loanId]/checklist
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> }
) {
  try {
    const { loanId } = await params;

    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      include: {
        complianceConditions: {
          orderBy: { createdAt: 'asc' },
        },
        preDisbursementChecklist: true,
      },
    });

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }

    return NextResponse.json(
      buildChecklistPayload(loan.complianceConditions || [], loan.preDisbursementChecklist, loan)
    );
  } catch (e: any) {
    console.error('MCC checklist GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/mcc/[loanId]/checklist
// Body variants:
//   { adminId, itemId, verified, satisfaction? }     → toggle one item
//   { adminId, action: 'verify_all', notes? }        → verify all + advance to CFO_DISBURSEMENT
//   { adminId, action: 'reject', reason }            → reject, send loan back to MD_APPROVAL
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> }
) {
  try {
    const { loanId } = await params;
    const body = await req.json();
    const adminId = String(body.adminId || '');

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    const [admin, loan] = await Promise.all([
      db.admin.findUnique({ where: { id: adminId } }),
      db.loanApplicants.findUnique({
        where: { id: loanId },
        include: {
          complianceConditions: { orderBy: { createdAt: 'asc' } },
          preDisbursementChecklist: true,
        },
      }),
    ]);

    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // Resolve admin role code (for the approval log + audit)
    const adminRoleType = admin.roleType || admin.role || '';
    const adminMccRole = ROLE_TO_MCC[adminRoleType] || ROLE_TO_MCC[admin.role] || 'LO';
    const adminName = `${admin.firstName} ${admin.lastName}`.trim();

    // -----------------------------------------------------------------
    // ACTION: verify_all
    // -----------------------------------------------------------------
    if (body.action === 'verify_all') {
      const notes = body.notes ? String(body.notes) : 'Internal Control verified all conditions precedent to drawdown.';

      // Upsert ComplianceCondition rows for every CP item with status='verified'
      for (const def of CP_CHECKLIST_ITEMS) {
        const existing = (loan.complianceConditions || []).find(
          (c: any) => c.conditionType === 'document_upload' && c.fieldName === def.id
        );
        if (existing) {
          await db.complianceCondition.update({
            where: { id: existing.id },
            data: {
              status: 'verified',
              verifiedBy: admin.id,
              verifiedAt: new Date(),
              verificationNotes: def.hasSatisfaction ? (body.satisfaction ?? 'Satisfactory') : null,
            },
          });
        } else {
          await db.complianceCondition.create({
            data: {
              loanApplicantId: loanId,
              setBy: admin.id,
              setByRole: 'INTERNAL_CONTROL',
              conditionType: 'document_upload',
              title: def.label,
              description: `Conditions precedent to drawdown — ${def.label}`,
              fieldName: def.id,
              priority: 'high',
              status: 'verified',
              verifiedBy: admin.id,
              verifiedAt: new Date(),
              verificationNotes: def.hasSatisfaction ? (body.satisfaction ?? 'Satisfactory') : null,
              metadata: JSON.stringify({ cpItem: def.id, category: def.category }),
            },
          });
        }
      }

      // Upsert PreDisbursementChecklist
      const pd = loan.preDisbursementChecklist;
      if (pd) {
        await db.preDisbursementChecklist.update({
          where: { id: pd.id },
          data: {
            allConditionsVerified: true,
            documentsComplete: true,
            collateralDocumented: true,
            offerLetterSigned: true,
            bankAccountVerified: true,
            status: 'disbursement_approved',
            approvedBy: admin.id,
            approvedAt: new Date(),
            approvalNotes: notes,
          },
        });
      } else {
        await db.preDisbursementChecklist.create({
          data: {
            loanApplicantId: loanId,
            allConditionsVerified: true,
            documentsComplete: true,
            collateralDocumented: true,
            offerLetterSigned: true,
            bankAccountVerified: true,
            status: 'disbursement_approved',
            approvedBy: admin.id,
            approvedAt: new Date(),
            approvalNotes: notes,
          },
        });
      }

      // Advance loan to CFO_DISBURSEMENT and stamp auditPassedAt
      await db.loanApplicants.update({
        where: { id: loanId },
        data: {
          currentStep: 'CFO_DISBURSEMENT',
          auditPassedAt: new Date(),
          complianceStatus: 'cleared_for_disbursement',
          hasComplianceConditions: false,
        },
      });

      // Approval log
      await db.approvalLog.create({
        data: {
          loanApplicantId: loanId,
          adminId: admin.id,
          action: 'APPROVED',
          roleAtTimeOfAction: 'internalControl',
          comments: notes,
          metadata: JSON.stringify({
            previousStep: 'INTERNAL_CONTROL_CHECK',
            newStep: 'CFO_DISBURSEMENT',
            action: 'verify_all',
            verifiedCount: CP_CHECKLIST_TOTAL,
          }),
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'verified',
          module: 'mcc',
          description: `Loan ${loan.applicationRef}: Internal Control verified all ${CP_CHECKLIST_TOTAL} conditions precedent to drawdown. Advanced to CFO_DISBURSEMENT.`,
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          severity: 'info',
          metadata: JSON.stringify({
            loanId,
            previousStep: 'INTERNAL_CONTROL_CHECK',
            newStep: 'CFO_DISBURSEMENT',
            verifiedCount: CP_CHECKLIST_TOTAL,
            adminMccRole,
          }),
        },
      });

      // Re-fetch fresh state
      const refreshed = await db.loanApplicants.findUnique({
        where: { id: loanId },
        include: {
          complianceConditions: { orderBy: { createdAt: 'asc' } },
          preDisbursementChecklist: true,
        },
      });
      return NextResponse.json({
        success: true,
        action: 'verify_all',
        ...buildChecklistPayload(
          refreshed?.complianceConditions || [],
          refreshed?.preDisbursementChecklist || null,
          refreshed || loan
        ),
        newStep: 'CFO_DISBURSEMENT',
      });
    }

    // -----------------------------------------------------------------
    // ACTION: reject
    // -----------------------------------------------------------------
    if (body.action === 'reject') {
      const reason = body.reason ? String(body.reason) : 'Conditions precedent not met.';
      const pd = loan.preDisbursementChecklist;
      if (pd) {
        await db.preDisbursementChecklist.update({
          where: { id: pd.id },
          data: {
            status: 'disbursement_rejected',
            rejectedBy: admin.id,
            rejectedAt: new Date(),
            rejectionReason: reason,
          },
        });
      } else {
        await db.preDisbursementChecklist.create({
          data: {
            loanApplicantId: loanId,
            status: 'disbursement_rejected',
            rejectedBy: admin.id,
            rejectedAt: new Date(),
            rejectionReason: reason,
          },
        });
      }

      // Return loan to MD_APPROVAL
      await db.loanApplicants.update({
        where: { id: loanId },
        data: {
          currentStep: 'MD_APPROVAL',
          complianceStatus: 'conditions_pending',
          hasComplianceConditions: true,
        },
      });

      // Approval log
      await db.approvalLog.create({
        data: {
          loanApplicantId: loanId,
          adminId: admin.id,
          action: 'REJECTED',
          roleAtTimeOfAction: 'internalControl',
          comments: reason,
          metadata: JSON.stringify({
            previousStep: 'INTERNAL_CONTROL_CHECK',
            newStep: 'MD_APPROVAL',
            action: 'reject',
          }),
        },
      });

      // Audit log
      await db.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'rejected',
          module: 'mcc',
          description: `Loan ${loan.applicationRef}: Internal Control rejected conditions precedent. Returned to MD_APPROVAL. Reason: ${reason}`,
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          severity: 'critical',
          metadata: JSON.stringify({
            loanId,
            previousStep: 'INTERNAL_CONTROL_CHECK',
            newStep: 'MD_APPROVAL',
            reason,
          }),
        },
      });

      const refreshed = await db.loanApplicants.findUnique({
        where: { id: loanId },
        include: {
          complianceConditions: { orderBy: { createdAt: 'asc' } },
          preDisbursementChecklist: true,
        },
      });
      return NextResponse.json({
        success: true,
        action: 'reject',
        ...buildChecklistPayload(
          refreshed?.complianceConditions || [],
          refreshed?.preDisbursementChecklist || null,
          refreshed || loan
        ),
        newStep: 'MD_APPROVAL',
      });
    }

    // -----------------------------------------------------------------
    // DEFAULT: toggle a single item
    // -----------------------------------------------------------------
    const itemId = String(body.itemId || '');
    const def = CP_CHECKLIST_ITEMS.find((i) => i.id === itemId);
    if (!def) {
      return NextResponse.json(
        { error: `Unknown itemId: ${itemId}` },
        { status: 400 }
      );
    }
    const verified = Boolean(body.verified);
    const satisfaction = body.satisfaction != null ? String(body.satisfaction) : null;

    const existing = (loan.complianceConditions || []).find(
      (c: any) => c.conditionType === 'document_upload' && c.fieldName === itemId
    );

    if (existing) {
      await db.complianceCondition.update({
        where: { id: existing.id },
        data: {
          status: verified ? 'verified' : 'pending',
          verifiedBy: verified ? admin.id : null,
          verifiedAt: verified ? new Date() : null,
          verificationNotes: verified && def.hasSatisfaction ? (satisfaction || 'Satisfactory') : null,
        },
      });
    } else {
      await db.complianceCondition.create({
        data: {
          loanApplicantId: loanId,
          setBy: admin.id,
          setByRole: 'INTERNAL_CONTROL',
          conditionType: 'document_upload',
          title: def.label,
          description: `Conditions precedent to drawdown — ${def.label}`,
          fieldName: itemId,
          priority: 'high',
          status: verified ? 'verified' : 'pending',
          verifiedBy: verified ? admin.id : null,
          verifiedAt: verified ? new Date() : null,
          verificationNotes: verified && def.hasSatisfaction ? (satisfaction || 'Satisfactory') : null,
          metadata: JSON.stringify({ cpItem: itemId, category: def.category }),
        },
      });
    }

    // Audit log for the single toggle
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: verified ? 'verified' : 'updated',
        module: 'mcc',
        description: `Loan ${loan.applicationRef}: Internal Control (${adminName}) ${verified ? 'verified' : 'unchecked'} "${def.label}".`,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        severity: 'info',
        metadata: JSON.stringify({ loanId, itemId, verified, adminMccRole }),
      },
    });

    // If the loan is still at INTERNAL_CONTROL_CHECK, update compliance flags
    if (loan.currentStep === 'INTERNAL_CONTROL_CHECK') {
      await db.loanApplicants.update({
        where: { id: loanId },
        data: {
          hasComplianceConditions: true,
          complianceStatus: 'conditions_pending',
        },
      });
    }

    const refreshed = await db.loanApplicants.findUnique({
      where: { id: loanId },
      include: {
        complianceConditions: { orderBy: { createdAt: 'asc' } },
        preDisbursementChecklist: true,
      },
    });
    return NextResponse.json({
      success: true,
      action: 'toggle',
      itemId,
      verified,
      ...buildChecklistPayload(
        refreshed?.complianceConditions || [],
        refreshed?.preDisbursementChecklist || null,
        refreshed || loan
      ),
    });
  } catch (e: any) {
    console.error('MCC checklist POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

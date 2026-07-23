import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// POST /api/compliance/checklist/[id]/reject
// v44: Added authentication + role check (was completely unauthenticated).
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const allowedRoles = ['super', 'hoc', 'cro', 'legal', 'admin'];
    if (!allowedRoles.includes(authPayload.role)) {
      return NextResponse.json(
        { error: 'Only HOC, CRO, Legal, or Super Admin can reject compliance checklists' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || body.notes || '';

    if (!reason.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    const checklist = await db.preDisbursementChecklist.findUnique({ where: { id } });
    if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await db.preDisbursementChecklist.update({
      where: { id },
      data: {
        status: 'disbursement_rejected',
        rejectedBy: authPayload.id,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    // v44: Return loan to HOC_SCHEDULING (re-do compliance)
    await db.loanApplicants.update({
      where: { id: checklist.loanApplicantId },
      data: {
        complianceStatus: 'conditions_pending',
        currentStep: 'HOC_SCHEDULING',
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        adminId: authPayload.id,
        action: 'compliance_checklist_rejected',
        module: 'compliance',
        description: `Pre-disbursement checklist rejected for loan ${checklist.loanApplicantId}: ${reason}`,
        severity: 'warning',
        metadata: JSON.stringify({ checklistId: id, loanId: checklist.loanApplicantId, reason }),
      },
    });

    // v44: Notify HOC that compliance was rejected
    try {
      const hocStaff = await db.admin.findMany({
        where: { role: { in: ['hoc', 'super'] }, status: 1 },
        select: { id: true },
      });
      await Promise.all(hocStaff.map(hoc =>
        createNotification({
          adminId: hoc.id,
          type: 'compliance_rejected',
          title: 'Compliance Checklist Rejected',
          message: `Pre-disbursement checklist rejected: ${reason}. Loan returned to HOC Scheduling.`,
          category: 'loan',
          actionLabel: 'View Loan',
          actionView: 'loan-finalization',
          metadata: { loanId: checklist.loanApplicantId },
        })
      ));
    } catch {}

    return NextResponse.json({ checklist: updated });
  } catch (e: any) {
    console.error('Reject checklist API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

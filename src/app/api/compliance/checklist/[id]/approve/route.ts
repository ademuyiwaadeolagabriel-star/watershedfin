import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// POST /api/compliance/checklist/[id]/approve
// v44: Added authentication + role check (was completely unauthenticated).
// Only super, hoc, cro, legal, or compliance roles can approve checklists.
// Also fixed: step now advances to CFO_DISBURSEMENT (not legacy TREASURY_PAYOUT).
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

    // v44: Role check — only governance roles can approve
    const allowedRoles = ['super', 'hoc', 'cro', 'legal', 'admin'];
    if (!allowedRoles.includes(authPayload.role)) {
      return NextResponse.json(
        { error: 'Only HOC, CRO, Legal, or Super Admin can approve compliance checklists' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const notes = body.notes || '';

    const checklist = await db.preDisbursementChecklist.findUnique({ where: { id } });
    if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // v44: Prevent double-approval
    if (checklist.status === 'disbursement_approved') {
      return NextResponse.json({ error: 'Checklist already approved' }, { status: 400 });
    }

    const updated = await db.preDisbursementChecklist.update({
      where: { id },
      data: {
        status: 'disbursement_approved',
        approvedBy: authPayload.id,
        approvedAt: new Date(),
        approvalNotes: notes,
      },
    });

    // v44: Advance loan to CFO_DISBURSEMENT (was TREASURY_PAYOUT — legacy step)
    await db.loanApplicants.update({
      where: { id: checklist.loanApplicantId },
      data: {
        complianceStatus: 'cleared_for_disbursement',
        currentStep: 'CFO_DISBURSEMENT',
      },
    });

    // v44: Audit log
    await db.auditLog.create({
      data: {
        adminId: authPayload.id,
        action: 'compliance_checklist_approved',
        module: 'compliance',
        description: `Pre-disbursement checklist approved for loan ${checklist.loanApplicantId}${notes ? ` — ${notes}` : ''}`,
        severity: 'info',
        metadata: JSON.stringify({ checklistId: id, loanId: checklist.loanApplicantId }),
      },
    });

    // v44: Notify CFO that loan is cleared for disbursement
    try {
      const cfoStaff = await db.admin.findMany({
        where: { role: { in: ['cfo', 'super'] }, status: 1, loanDisbursement: true },
        select: { id: true },
      });
      await Promise.all(cfoStaff.map(cfo =>
        createNotification({
          adminId: cfo.id,
          type: 'compliance_cleared',
          title: 'Loan Cleared for Disbursement',
          message: `Pre-disbursement checklist approved. Loan is ready for CFO disbursement.`,
          category: 'loan',
          actionLabel: 'View Loan',
          actionView: 'loan-disbursement',
          metadata: { loanId: checklist.loanApplicantId },
        })
      ));
    } catch {}

    return NextResponse.json({ checklist: updated });
  } catch (e: any) {
    console.error('Approve checklist API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

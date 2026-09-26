import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// POST /api/loans/[id]/verify
// Authorization: Bearer <admin-jwt>
// Body: { type: 'bvn'|'cac', action: 'verify'|'reject', notes? }
//
// v52 — P0-G5 FIX (#36 from governance audit):
//   Removed `body.adminId`. The actor is now derived from the JWT via
//   `requireRole()`. The previous implementation accepted any admin's ID
//   in the request body, looked up that admin, and recorded the
//   verification as if THAT admin had performed it — breaking the audit
//   trail. An attacker could perform a CAC verification and record it
//   as "performed by Legal Head A" even if Legal Head A never touched it.
//
//   The route now also enforces rejection-reason mandatory (#22):
//   `action === 'reject'` requires non-empty `notes`.
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v52 — auth gate: admin JWT mandatory. Role list widened to include
  // 'legal' so Legal can perform CAC verification.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'legal', 'bm']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload = authResult_v51 as { id: string; role: string };

  // v52 — P0-G5: adminId is DERIVED FROM JWT, never from body.
  const adminId = authPayload.id;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { type, action, notes } = body || {};

    if (!type || !action) {
      return NextResponse.json({ error: 'type and action required' }, { status: 400 });
    }

    // v52 — #22: rejection requires non-empty notes/reason.
    if (action === 'reject' && (!notes || String(notes).trim().length === 0)) {
      return NextResponse.json(
        { error: 'A non-empty notes/reason is required for reject actions.' },
        { status: 400 },
      );
    }

    const admin = await db.admin.findUnique({
      where: { id: adminId },
      select: { id: true, firstName: true, lastName: true, role: true, roleType: true, branchId: true, loanOrigination: true, loanLegal: true },
    });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { user: { include: { business: true } }, appraisal: true },
    });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    if (type === 'bvn') {
      if (admin.role !== 'super' && admin.role !== 'loan' && !admin.loanOrigination) {
        return NextResponse.json({ error: 'Only Loan Officers can verify BVN' }, { status: 403 });
      }

      if (action === 'verify') {
        await db.user.update({
          where: { id: loan.userId },
          data: { bvnVerified: true, bvnVerifiedAt: new Date(), bvnMatchScore: 100 },
        });
        if (loan.appraisal) {
          await db.creditAppraisal.update({
            where: { loanApplicantId: id },
            data: { bankAccountVerified: true },
          });
        }
        await db.auditLog.create({
          data: { adminId, action: 'verified', module: 'kyc',
            description: `BVN verified externally by LO for loan ${loan.applicationRef}`,
            severity: 'info', metadata: JSON.stringify({ loanId: id, type: 'bvn', authSource: 'jwt' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'BVN_VERIFIED',
            roleAtTimeOfAction: admin.role, comments: notes || 'BVN verified externally' },
        });

        void createNotification({
          userId: loan.userId,
          type: 'cp_verified',
          title: 'Your BVN has been verified',
          message: `Good news! Your BVN has been verified successfully for loan ${loan.applicationRef}. Your application is now moving to the next stage.`,
          category: 'kyc',
          actionLabel: 'View Loan',
          actionView: 'customer-loan-breakdown',
          actionParams: { loanId: id },
          metadata: { loanId: id, applicationRef: loan.applicationRef, type: 'bvn', action: 'verify' },
        });

        return NextResponse.json({ success: true, message: 'BVN verified successfully.', authSource: 'jwt' });
      }

      if (action === 'reject') {
        await db.loanApplicants.update({ where: { id }, data: { currentStep: 'LO_ENTRY', status: 'queried' } });
        await db.user.update({ where: { id: loan.userId }, data: { bvnVerified: false } });
        await db.auditLog.create({
          data: { adminId, action: 'rejected', module: 'kyc',
            description: `BVN verification FAILED for loan ${loan.applicationRef}. Reason: ${notes}`,
            severity: 'warning', metadata: JSON.stringify({ loanId: id, type: 'bvn', reason: notes, authSource: 'jwt' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'BVN_REJECTED',
            roleAtTimeOfAction: admin.role, comments: notes || 'BVN verification failed' },
        });

        void createNotification({
          userId: loan.userId,
          type: 'kyc_rejected',
          title: 'BVN verification failed',
          message: `Your BVN verification for loan ${loan.applicationRef} could not be completed. ${
            notes ? `Reason: ${notes}. ` : ''
          }Please contact your loan officer to update your details and resubmit.`,
          category: 'kyc',
          actionLabel: 'View Loan',
          actionView: 'customer-loan-breakdown',
          actionParams: { loanId: id },
          metadata: { loanId: id, applicationRef: loan.applicationRef, type: 'bvn', action: 'reject', notes },
        });

        return NextResponse.json({ success: true, message: 'BVN rejected. Application returned to LO.', authSource: 'jwt' });
      }
    }

    if (type === 'cac') {
      if (admin.role !== 'super' && admin.role !== 'legal' && !admin.loanLegal) {
        return NextResponse.json({ error: 'Only Legal officers can verify CAC' }, { status: 403 });
      }

      if (action === 'verify') {
        await db.loanApplicants.update({
          where: { id },
          data: { isCacVerified: true, cacStatusComment: notes || 'CAC verified', currentStep: 'BM_QC', status: 'processing' },
        });
        if (loan.user?.business) {
          await db.business.update({ where: { id: loan.user.business.id }, data: { cacVerifiedAt: new Date() } });
        }
        await db.auditLog.create({
          data: { adminId, action: 'verified', module: 'compliance',
            description: `CAC verified externally by Legal for loan ${loan.applicationRef}`,
            severity: 'info', metadata: JSON.stringify({ loanId: id, type: 'cac', authSource: 'jwt' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'CAC_VERIFIED',
            roleAtTimeOfAction: admin.role, comments: notes || 'CAC verified. Forwarded to BM.' },
        });

        void createNotification({
          userId: loan.userId,
          type: 'cp_verified',
          title: 'Your business registration (CAC) has been verified',
          message: `Your CAC registration has been verified for loan ${loan.applicationRef}. Your application has been forwarded to the Branch Manager for review.`,
          category: 'kyc',
          actionLabel: 'View Loan',
          actionView: 'customer-loan-breakdown',
          actionParams: { loanId: id },
          metadata: { loanId: id, applicationRef: loan.applicationRef, type: 'cac', action: 'verify' },
        });

        return NextResponse.json({ success: true, message: 'CAC verified. Forwarded to Branch Manager.', authSource: 'jwt' });
      }

      if (action === 'reject') {
        await db.loanApplicants.update({
          where: { id },
          data: { isCacVerified: false, cacStatusComment: notes || 'CAC failed', currentStep: 'LO_ENTRY', status: 'queried' },
        });
        await db.auditLog.create({
          data: { adminId, action: 'rejected', module: 'compliance',
            description: `CAC verification FAILED for loan ${loan.applicationRef}. Reason: ${notes}`,
            severity: 'warning', metadata: JSON.stringify({ loanId: id, type: 'cac', reason: notes, authSource: 'jwt' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'CAC_REJECTED',
            roleAtTimeOfAction: admin.role, comments: notes || 'CAC failed. Returned to LO.' },
        });

        void createNotification({
          userId: loan.userId,
          type: 'kyc_rejected',
          title: 'CAC verification failed',
          message: `Your CAC registration for loan ${loan.applicationRef} could not be verified. ${
            notes ? `Reason: ${notes}. ` : ''
          }Please contact your loan officer to update your business registration details.`,
          category: 'kyc',
          actionLabel: 'View Loan',
          actionView: 'customer-loan-breakdown',
          actionParams: { loanId: id },
          metadata: { loanId: id, applicationRef: loan.applicationRef, type: 'cac', action: 'reject', notes },
        });

        return NextResponse.json({ success: true, message: 'CAC rejected. Returned to Loan Officer.', authSource: 'jwt' });
      }
    }

    return NextResponse.json({ error: 'Unknown type or action' }, { status: 400 });
  } catch (e: any) {
    console.error('Verification error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// POST /api/loans/[id]/verify
// Body: { adminId, type: 'bvn'|'cac', action: 'verify'|'reject', notes? }
// BVN: done by Loan Officer during LO_ASSESSMENT
// CAC: done by Legal during LEGAL_CAC_CHECK
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { adminId, type, action, notes } = await req.json();

    if (!adminId || !type || !action) {
      return NextResponse.json({ error: 'adminId, type, and action required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { id: adminId } });
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
            severity: 'info', metadata: JSON.stringify({ loanId: id, type: 'bvn' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'BVN_VERIFIED',
            roleAtTimeOfAction: admin.role, comments: notes || 'BVN verified externally' },
        });

        // ── Notify customer (fire-and-forget) ────────────────────────────────
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

        return NextResponse.json({ success: true, message: 'BVN verified successfully.' });
      }

      if (action === 'reject') {
        await db.loanApplicants.update({ where: { id }, data: { currentStep: 'LO_ENTRY', status: 'queried' } });
        await db.user.update({ where: { id: loan.userId }, data: { bvnVerified: false } });
        await db.auditLog.create({
          data: { adminId, action: 'rejected', module: 'kyc',
            description: `BVN verification FAILED for loan ${loan.applicationRef}. Reason: ${notes}`,
            severity: 'warning', metadata: JSON.stringify({ loanId: id, type: 'bvn', reason: notes }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'BVN_REJECTED',
            roleAtTimeOfAction: admin.role, comments: notes || 'BVN verification failed' },
        });

        // ── Notify customer (fire-and-forget) ────────────────────────────────
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

        return NextResponse.json({ success: true, message: 'BVN rejected. Application returned to LO.' });
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
            severity: 'info', metadata: JSON.stringify({ loanId: id, type: 'cac' }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'CAC_VERIFIED',
            roleAtTimeOfAction: admin.role, comments: notes || 'CAC verified. Forwarded to BM.' },
        });

        // ── Notify customer (fire-and-forget) ────────────────────────────────
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

        return NextResponse.json({ success: true, message: 'CAC verified. Forwarded to Branch Manager.' });
      }

      if (action === 'reject') {
        await db.loanApplicants.update({
          where: { id },
          data: { isCacVerified: false, cacStatusComment: notes || 'CAC failed', currentStep: 'LO_ENTRY', status: 'queried' },
        });
        await db.auditLog.create({
          data: { adminId, action: 'rejected', module: 'compliance',
            description: `CAC verification FAILED for loan ${loan.applicationRef}. Reason: ${notes}`,
            severity: 'warning', metadata: JSON.stringify({ loanId: id, type: 'cac', reason: notes }) },
        });
        await db.approvalLog.create({
          data: { loanApplicantId: id, adminId, action: 'CAC_REJECTED',
            roleAtTimeOfAction: admin.role, comments: notes || 'CAC failed. Returned to LO.' },
        });

        // ── Notify customer (fire-and-forget) ────────────────────────────────
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

        return NextResponse.json({ success: true, message: 'CAC rejected. Returned to Loan Officer.' });
      }
    }

    return NextResponse.json({ error: 'Unknown type or action' }, { status: 400 });
  } catch (e: any) {
    console.error('Verification error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

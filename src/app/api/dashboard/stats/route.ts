import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'cfo', 'bm']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload = authResult_v51 as { id: string; role: string };

  try {
    const url = new URL(req.url);
    const role = url.searchParams.get('role') || '';
    // v54-Blocker1: adminId from JWT, not query string.
    const adminId = authPayload.id;
    const branchId = url.searchParams.get('branchId') || '';

    const [
      loansCount, customers, admins, mcc, transactions, savings,
      investments, branches, sectors,
    ] = await Promise.all([
      db.loanApplicants.count(),
      db.user.count(),
      db.admin.count(),
      db.mccDecision.count(),
      db.transactions.count(),
      db.savings.count(),
      db.treasuryInvestment.count(),
      db.branch.count(),
      db.sector.count(),
    ]);

    const [activeLoans, pendingLoans, processingLoans, declinedLoans, nplLoans, totalDisbursedAgg] = await Promise.all([
      db.loanApplicants.count({ where: { status: 'running' } }),
      db.loanApplicants.count({ where: { status: 'pending' } }),
      db.loanApplicants.count({ where: { status: 'processing' } }),
      db.loanApplicants.count({ where: { status: 'declined' } }),
      db.loanApplicants.count({ where: { defaulter: true } }),
      db.loanApplicants.aggregate({ _sum: { approvedAmount: true }, where: { status: 'running' } }),
    ]);

    // Recent loans
    const recentLoans = await db.loanApplicants.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { include: { business: true } },
        plan: true,
      },
    });

    // Recent audit
    const recentAudit = await db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { admin: true },
    });

    // My queue
    let myQueue: any[] = [];
    if (adminId) {
      const admin = await db.admin.findUnique({ where: { id: adminId } });
      if (admin) {
        const r = admin.role;
        let myStep = '';
        if (r === 'bm' || admin.loanVetting) myStep = 'BM_QC';
        else if (r === 'hoc' || admin.loanStructuring) myStep = 'HOC_STRUCTURING';
        else if (r === 'analyst' || r === 'credit_analyst' || admin.loanAnalyst) myStep = 'ANALYST_STRUCTURING';
        else if (r === 'cro' || admin.loanRisk) myStep = 'CRO_RISK';
        else if (r === 'cfo' || admin.loanCfoReview) myStep = 'CFO_REVIEW';
        else if (r === 'legal' || admin.loanLegal) myStep = 'LEGAL_REVIEW';
        else if (r === 'md' || admin.loanMcc) myStep = 'MD_APPROVAL';

        if (myStep) {
          myQueue = await db.loanApplicants.findMany({
            where: { currentStep: myStep, status: { in: ['pending', 'processing'] } },
            take: 5,
            include: { user: { include: { business: true } } },
          });
        } else if (r === 'loan' || admin.loanOrigination) {
          myQueue = await db.loanApplicants.findMany({
            where: {
              staffId: admin.id,
              currentStep: { in: ['DRAFT', 'LO_ENTRY', 'LO_ASSESSMENT'] },
            },
            take: 5,
            include: { user: { include: { business: true } } },
          });
        }
      }
    }

    // Sanitize passwords
    const sanitize = (u: any) => u ? { ...u, password: undefined } : null;
    const safeRecentLoans = recentLoans.map((l: any) => ({ ...l, user: sanitize(l.user) }));
    const safeMyQueue = myQueue.map((l: any) => ({ ...l, user: sanitize(l.user) }));
    const safeAudit = recentAudit.map((a: any) => ({ ...a, admin: sanitize(a.admin) }));

    return NextResponse.json({
      stats: {
        loans: loansCount, customers, admins, mcc, transactions, savings,
        investments, branches, sectors,
        activeLoans, pendingLoans, processingLoans, declinedLoans, nplLoans,
        totalDisbursed: totalDisbursedAgg._sum.approvedAmount || 0,
      },
      recentLoans: safeRecentLoans,
      recentAudit: safeAudit,
      myQueue: safeMyQueue,
    });
  } catch (e: any) {
    console.error('Dashboard stats error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

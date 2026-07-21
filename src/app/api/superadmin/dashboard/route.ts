import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  try {
    const [
      totalAdmins,
      activeAdmins,
      totalUsers,
      verifiedUsers,
      totalLoans,
      runningLoans,
      pendingLoans,
      closedLoans,
      nplLoans,
      totalBranches,
      activeSessions,
      auditLogsToday,
      recentErrors,
    ] = await Promise.all([
      db.admin.count(),
      db.admin.count({ where: { status: 1 } }),
      db.user.count(),
      db.user.count({ where: { profileStatus: 'verified' } }),
      db.loanApplicants.count(),
      db.loanApplicants.count({ where: { status: 'running' } }),
      db.loanApplicants.count({ where: { status: { in: ['processing', 'pending'] } } }),
      db.loanApplicants.count({ where: { status: 'paid' } }),
      db.loanApplicants.count({ where: { status: 'running', defaulter: true } }),
      db.branch.count(),
      db.activeSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      db.auditLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
      db.auditLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          action: { contains: 'error', mode: 'insensitive' },
        },
      }),
    ]);

    // Disbursement this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const disbursedThisMonth = await db.loanApplicants.aggregate({
      _sum: { approvedAmount: true },
      _count: true,
      where: {
        status: 'running',
        disbursedAt: { gte: monthStart },
      },
    });

    // Loan distribution by step
    const loansByStep = await db.loanApplicants.groupBy({
      by: ['currentStep'],
      _count: true,
    });

    // Admins by role
    const adminsByRole = await db.admin.groupBy({
      by: ['role'],
      _count: true,
    });

    // Feature flag summary
    const flagsTotal = await db.featureFlag.count();
    const flagsEnabled = await db.featureFlag.count({ where: { enabled: true } });

    // Maintenance mode status
    const maintenanceSetting = await db.systemSetting.findUnique({
      where: { key: 'maintenance_mode' },
    });
    const maintenanceMode = maintenanceSetting?.value === 'true';

    // Audit retention policy
    const retentionSetting = await db.systemSetting.findUnique({
      where: { key: 'audit_retention_days' },
    });
    const auditRetentionDays = retentionSetting ? parseInt(retentionSetting.value, 10) : 365;

    return NextResponse.json({
      totals: {
        admins: totalAdmins,
        activeAdmins,
        users: totalUsers,
        verifiedUsers,
        loans: totalLoans,
        runningLoans,
        pendingLoans,
        closedLoans,
        nplLoans,
        branches: totalBranches,
        activeSessions,
        auditLogsToday,
        recentErrors,
      },
      disbursedThisMonth: {
        count: disbursedThisMonth._count,
        amount: disbursedThisMonth._sum.approvedAmount || 0,
      },
      loansByStep: loansByStep.map((s) => ({ step: s.currentStep, count: s._count })),
      adminsByRole: adminsByRole.map((r) => ({ role: r.role, count: r._count })),
      featureFlags: { total: flagsTotal, enabled: flagsEnabled },
      maintenanceMode,
      auditRetentionDays,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

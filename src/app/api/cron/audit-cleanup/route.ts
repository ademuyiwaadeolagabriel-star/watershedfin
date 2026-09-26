import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCronAuth } from '@/lib/cron-auth';

// ============================================================================
// CRON — AUDIT LOG RETENTION PURGE
// ============================================================================
// GET /api/cron/audit-cleanup
//
// Run daily. Reads `audit_retention_days` from SystemSetting (default 365).
// Deletes AuditLog + LoginHistory rows older than the cutoff.
// Vercel cron config in vercel.json:
//   { "path": "/api/cron/audit-cleanup", "schedule": "0 2 * * *" }
// ============================================================================

export async function GET(req: NextRequest) {
  // v50 — fail-closed cron auth (no more hardcoded fallback secret).
  const cronAuth = requireCronAuth(req);
  if (cronAuth instanceof NextResponse) return cronAuth;

  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: 'audit_retention_days' },
    });
    const days = setting ? parseInt(setting.value, 10) : 365;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const r1 = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    const r2 = await db.loginHistory.deleteMany({ where: { createdAt: { lt: cutoff } } });

    return NextResponse.json({
      ok: true,
      retentionDays: days,
      cutoff: cutoff.toISOString(),
      purged: {
        auditLogs: r1.count,
        loginHistory: r2.count,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

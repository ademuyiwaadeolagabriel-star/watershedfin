import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  const setting = await db.systemSetting.findUnique({
    where: { key: 'audit_retention_days' },
  });

  const days = setting ? parseInt(setting.value, '10') : 365;

  // Compute what would be purged
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const auditLogsToPurge = await db.auditLog.count({ where: { createdAt: { lt: cutoff } } });
  const loginHistoryToPurge = await db.loginHistory.count({ where: { createdAt: { lt: cutoff } } });

  return NextResponse.json({
    retentionDays: days,
    cutoffDate: cutoff.toISOString(),
    auditLogsToPurge,
    loginHistoryToPurge,
    updatedAt: setting?.updatedAt || null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { days, runNow } = body;
    if (!days || days < 30) {
      return NextResponse.json({ error: 'days must be >= 30' }, { status: 400 });
    }

    const updated = await db.systemSetting.upsert({
      where: { key: 'audit_retention_days' },
      update: { value: String(days), type: 'number', category: 'retention', updatedBy: payload?.id },
      create: { key: 'audit_retention_days', value: String(days), type: 'number', category: 'retention', updatedBy: payload?.id },
    });

    let purged = { auditLogs: 0, loginHistory: 0 };
    if (runNow) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const r1 = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
      const r2 = await db.loginHistory.deleteMany({ where: { createdAt: { lt: cutoff } } });
      purged = { auditLogs: r1.count, loginHistory: r2.count };
    }

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'audit_retention_update',
        description: `Retention policy set to ${days} days${runNow ? ` (purged ${purged.auditLogs} logs, ${purged.loginHistory} login records)` : ''}`,
        module: 'superadmin',
        severity: 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ retentionDays: days, updatedAt: updated.updatedAt, purged });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

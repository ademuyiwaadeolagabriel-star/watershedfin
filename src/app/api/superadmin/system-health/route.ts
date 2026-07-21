import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  // DB connection check
  let dbStatus: 'ok' | 'degraded' | 'down' = 'ok';
  let dbLatencyMs = 0;
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbStatus = 'down';
  }

  // Counts for size telemetry
  const [admins, users, loans, auditLogs] = await Promise.all([
    db.admin.count().catch(() => -1),
    db.user.count().catch(() => -1),
    db.loanApplicants.count().catch(() => -1),
    db.auditLog.count().catch(() => -1),
  ]);

  // Feature flag summary
  const flagsTotal = await db.featureFlag.count().catch(() => 0);
  const flagsEnabled = await db.featureFlag.count({ where: { enabled: true } }).catch(() => 0);

  // Maintenance mode
  const maintenance = await db.systemSetting.findUnique({ where: { key: 'maintenance_mode' } });

  // Build info
  const buildInfo = {
    version: process.env.npm_package_version || '0.24.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSec: Math.round(process.uptime()),
    memoryUsageMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
  };

  return NextResponse.json({
    status: dbStatus,
    dbLatencyMs,
    counts: { admins, users, loans, auditLogs },
    featureFlags: { total: flagsTotal, enabled: flagsEnabled },
    maintenanceMode: maintenance?.value === 'true',
    buildInfo,
    timestamp: new Date().toISOString(),
  });
}

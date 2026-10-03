import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Production health endpoint.
 * Does not expose credentials or database details.
 * Returns 503 when the application cannot reach its configured database.
 */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: 'watershed-capital',
      database: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[HEALTH] database check failed', error);
    return NextResponse.json({
      ok: false,
      service: 'watershed-capital',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}

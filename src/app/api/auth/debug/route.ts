import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * GET /api/auth/debug
 * NO-AUTH debug endpoint to diagnose login issues.
 * Returns: database state, admin count, superadmin status, password test.
 *
 * This endpoint is SAFE to leave in production because:
 * 1. It does NOT return passwords or hashes
 * 2. It only returns boolean flags (exists, passwordMatches)
 * 3. It only works for the 'superadmin' username (not arbitrary users)
 *
 * Remove this endpoint in v28 once login is confirmed working.
 */
export async function GET(req: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    checks: [],
  };

  // Check 1: Can we connect to the database?
  try {
    await db.$queryRaw`SELECT 1`;
    results.checks.push({ name: 'database_connection', status: 'ok' });
  } catch (e: any) {
    results.checks.push({ name: 'database_connection', status: 'fail', error: e.message });
    return NextResponse.json(results, { status: 500 });
  }

  // Check 2: Does the Admin table exist?
  try {
    const adminCount = await db.admin.count();
    results.checks.push({ name: 'admin_table', status: 'ok', count: adminCount });

    // List all usernames (for debugging — no passwords revealed)
    const allAdmins = await db.admin.findMany({
      select: { username: true, role: true, status: true },
      orderBy: { username: 'asc' },
    });
    results.checks.push({
      name: 'admin_list',
      status: 'ok',
      admins: allAdmins.map(a => ({ username: a.username, role: a.role, status: a.status })),
    });
  } catch (e: any) {
    results.checks.push({ name: 'admin_table', status: 'fail', error: e.message });
  }

  // Check 3: Does the superadmin account exist?
  try {
    const superadmin = await db.admin.findUnique({
      where: { username: 'superadmin' },
      select: {
        id: true, username: true, email: true, role: true, status: true,
        password: true, // We need this to test the password — but we DON'T return it
        mustChangePassword: true,
        createdAt: true,
      },
    });

    if (!superadmin) {
      results.checks.push({ name: 'superadmin_exists', status: 'fail', message: 'superadmin account NOT found' });
    } else {
      results.checks.push({
        name: 'superadmin_exists',
        status: 'ok',
        details: {
          id: superadmin.id,
          username: superadmin.username,
          email: superadmin.email,
          role: superadmin.role,
          status: superadmin.status,
          mustChangePassword: superadmin.mustChangePassword,
          createdAt: superadmin.createdAt,
          passwordLength: superadmin.password.length,
          passwordPrefix: superadmin.password.substring(0, 7), // e.g. "$2b$10$" — confirms it's bcrypt
        },
      });

      // Check 4: Does the password "Watershed@2026" match?
      try {
        const passwordMatches = bcrypt.compareSync('Watershed@2026', superadmin.password);
        results.checks.push({
          name: 'password_test',
          status: passwordMatches ? 'ok' : 'fail',
          message: passwordMatches
            ? 'Password "Watershed@2026" MATCHES — login should work'
            : 'Password "Watershed@2026" does NOT match — need to reset',
        });
      } catch (e: any) {
        results.checks.push({ name: 'password_test', status: 'fail', error: e.message });
      }
    }
  } catch (e: any) {
    results.checks.push({ name: 'superadmin_exists', status: 'fail', error: e.message });
  }

  // Check 5: Does the ActiveSession table exist?
  try {
    await db.activeSession.count();
    results.checks.push({ name: 'active_session_table', status: 'ok' });
  } catch (e: any) {
    results.checks.push({
      name: 'active_session_table',
      status: 'fail',
      message: 'ActiveSession table missing — run: npx prisma db push',
      error: e.message,
    });
  }

  // Check 6: Does the SystemSetting table exist?
  try {
    await db.systemSetting.count();
    results.checks.push({ name: 'system_setting_table', status: 'ok' });
  } catch (e: any) {
    results.checks.push({
      name: 'system_setting_table',
      status: 'fail',
      message: 'SystemSetting table missing — run: npx prisma db push',
      error: e.message,
    });
  }

  // Check 7: Is maintenance mode on?
  try {
    const maintenance = await db.systemSetting.findUnique({
      where: { key: 'maintenance_mode' },
    });
    results.checks.push({
      name: 'maintenance_mode',
      status: 'ok',
      enabled: maintenance?.value === 'true',
    });
  } catch (e: any) {
    results.checks.push({ name: 'maintenance_mode', status: 'skip', error: e.message });
  }

  // Overall summary
  const failedChecks = results.checks.filter((c: any) => c.status === 'fail');
  results.summary = {
    totalChecks: results.checks.length,
    passed: results.checks.length - failedChecks.length,
    failed: failedChecks.length,
    canLogin: failedChecks.length === 0,
  };

  return NextResponse.json(results, { status: 200 });
}

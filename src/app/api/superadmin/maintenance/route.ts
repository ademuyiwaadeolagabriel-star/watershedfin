import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: 'maintenance_mode' },
    });
    const messageSetting = await db.systemSetting.findUnique({
      where: { key: 'maintenance_message' },
    });

    return NextResponse.json({
      enabled: setting?.value === 'true',
      message: messageSetting?.value || 'We are performing scheduled maintenance. Please check back shortly.',
      updatedAt: setting?.updatedAt || null,
    });
  } catch (e: any) {
    console.error('[MAINTENANCE] GET error:', e);
    return NextResponse.json(
      { error: 'Failed to load maintenance status. Run: npx prisma db push', details: e.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { enabled, message } = body;

    const value = enabled ? 'true' : 'false';
    const updated = await db.systemSetting.upsert({
      where: { key: 'maintenance_mode' },
      update: { value, type: 'boolean', category: 'maintenance', updatedBy: payload?.id },
      create: { key: 'maintenance_mode', value, type: 'boolean', category: 'maintenance', updatedBy: payload?.id },
    });

    if (message) {
      await db.systemSetting.upsert({
        where: { key: 'maintenance_message' },
        update: { value: message, type: 'string', category: 'maintenance', updatedBy: payload?.id },
        create: { key: 'maintenance_message', value: message, type: 'string', category: 'maintenance', updatedBy: payload?.id },
      });
    }

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'maintenance_mode_toggle',
        description: `Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'}`,
        module: 'superadmin',
        severity: enabled ? 'warning' : 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ enabled: updated.value === 'true', message: message ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

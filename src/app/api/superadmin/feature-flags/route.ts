import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  const flags = await db.featureFlag.findMany({
    orderBy: [{ enabled: 'desc' }, { key: 'asc' }],
  });
  return NextResponse.json({ flags });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { key, label, description, enabled, environment } = body;

    if (!key || !label) {
      return NextResponse.json({ error: 'key and label are required' }, { status: 400 });
    }

    const existing = await db.featureFlag.findUnique({ where: { key } });
    if (existing) {
      const updated = await db.featureFlag.update({
        where: { key },
        data: {
          label,
          description: description ?? existing.description,
          enabled: enabled ?? existing.enabled,
          environment: environment ?? existing.environment,
          updatedBy: payload?.id,
        },
      });
      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'feature_flag_update',
          description: `Updated flag "${key}" → enabled=${updated.enabled}`,
          module: 'superadmin',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });
      return NextResponse.json({ flag: updated });
    }

    const created = await db.featureFlag.create({
      data: {
        key,
        label,
        description,
        enabled: enabled ?? false,
        environment: environment ?? 'all',
        updatedBy: payload?.id,
      },
    });
    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'feature_flag_create',
        description: `Created flag "${key}" (enabled=${created.enabled})`,
        module: 'superadmin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });
    return NextResponse.json({ flag: created }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { id, enabled } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updated = await db.featureFlag.update({
      where: { id },
      data: { enabled, updatedBy: payload?.id },
    });
    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'feature_flag_toggle',
        description: `Toggled flag "${updated.key}" → enabled=${enabled}`,
        module: 'superadmin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });
    return NextResponse.json({ flag: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

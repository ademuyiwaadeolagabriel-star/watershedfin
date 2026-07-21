import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * PATCH /api/admin/kyc-fields/[id]
 * Update an existing KYC field (label, type, options, required, sortOrder, enabled, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super', 'md', 'hoc']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const body = await req.json();

    const existing = await db.kycField.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    // If changing key, must be unique
    if (body.key && body.key !== existing.key) {
      const dup = await db.kycField.findUnique({ where: { key: body.key } });
      if (dup) {
        return NextResponse.json({ error: `Field with key "${body.key}" already exists` }, { status: 409 });
      }
    }

    const updated = await db.kycField.update({
      where: { id },
      data: {
        ...(body.key !== undefined && { key: body.key }),
        ...(body.label !== undefined && { label: body.label }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.helpText !== undefined && { helpText: body.helpText }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.options !== undefined && { options: body.options ? JSON.stringify(body.options) : null }),
        ...(body.section !== undefined && { section: body.section }),
        ...(body.required !== undefined && { required: body.required }),
        ...(body.editable !== undefined && { editable: body.editable }),
        ...(body.needsVerification !== undefined && { needsVerification: body.needsVerification }),
        ...(body.placeholder !== undefined && { placeholder: body.placeholder }),
        ...(body.validationPattern !== undefined && { validationPattern: body.validationPattern }),
        ...(body.validationMessage !== undefined && { validationMessage: body.validationMessage }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.adminOnly !== undefined && { adminOnly: body.adminOnly }),
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'kyc_field_update',
        description: `Updated KYC field "${updated.key}"`,
        module: 'kyc',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ field: updated });
  } catch (e: any) {
    console.error('KYC field update error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/kyc-fields/[id]
 * Soft-delete (disable) by default. Use ?hard=true to hard-delete (also removes submissions).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const hard = searchParams.get('hard') === 'true';

    const existing = await db.kycField.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Field not found' }, { status: 404 });
    }

    if (hard) {
      // Hard delete — also removes submissions due to onDelete: Cascade
      await db.kycField.delete({ where: { id } });
    } else {
      // Soft delete — disable
      await db.kycField.update({ where: { id }, data: { enabled: false } });
    }

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'kyc_field_delete',
        description: `${hard ? 'Hard-deleted' : 'Disabled'} KYC field "${existing.key}"`,
        module: 'kyc',
        severity: 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ ok: true, hard });
  } catch (e: any) {
    console.error('KYC field delete error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

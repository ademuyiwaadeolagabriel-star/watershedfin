import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/admin/kyc-fields
 * Returns all KYC field definitions ordered by section + sortOrder
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'md', 'hoc', 'admin', 'legal']);
  if (auth instanceof NextResponse) return auth;

  const fields = await db.kycField.findMany({
    orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    include: {
      _count: { select: { submissions: true } },
    },
  });
  return NextResponse.json({ fields });
}

/**
 * POST /api/admin/kyc-fields
 * Create a new KYC field
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'md', 'hoc']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const {
      key, label, description, helpText, type, options, section,
      required, editable, needsVerification, placeholder,
      validationPattern, validationMessage, sortOrder, adminOnly,
    } = body;

    if (!key || !label || !type) {
      return NextResponse.json({ error: 'key, label, and type are required' }, { status: 400 });
    }

    const validTypes = ['text', 'number', 'email', 'phone', 'date', 'select', 'textarea', 'file', 'checkbox'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const existing = await db.kycField.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json({ error: `Field with key "${key}" already exists` }, { status: 409 });
    }

    const field = await db.kycField.create({
      data: {
        key,
        label,
        description: description || null,
        helpText: helpText || null,
        type,
        options: options ? JSON.stringify(options) : null,
        section: section || 'personal',
        required: required ?? true,
        editable: editable ?? true,
        needsVerification: needsVerification ?? false,
        placeholder: placeholder || null,
        validationPattern: validationPattern || null,
        validationMessage: validationMessage || null,
        sortOrder: sortOrder ?? 0,
        adminOnly: adminOnly ?? false,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'kyc_field_create',
        description: `Created KYC field "${key}" (${type}) in section ${section || 'personal'}`,
        module: 'kyc',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ field }, { status: 201 });
  } catch (e: any) {
    console.error('KYC field create error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

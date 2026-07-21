import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/customer/kyc-dynamic?userId=xxx
 * Returns all enabled KYC fields (grouped by section) + the user's submissions
 *
 * Response shape:
 *   {
 *     sections: [
 *       { name: 'personal', label: 'Personal Information', fields: [...] },
 *       ...
 *     ],
 *     submissions: { fieldId: { value, verified, ... } }
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, kycStatus: true, businessId: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all enabled KYC fields, ordered by section + sortOrder
    const fields = await db.kycField.findMany({
      where: { enabled: true },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
    });

    // Fetch user's submissions for these fields
    const submissions = await db.kycSubmission.findMany({
      where: { userId },
      include: { field: { select: { key: true } } },
    });

    // Group fields by section
    const sectionOrder = ['personal', 'physical', 'business', 'financial'];
    const sectionLabels: Record<string, string> = {
      personal: 'Personal Information',
      physical: 'Physical / Address',
      business: 'Business Details',
      financial: 'Financial Information',
    };

    const sectionsMap = new Map<string, any[]>();
    for (const f of fields) {
      if (!sectionsMap.has(f.section)) sectionsMap.set(f.section, []);
      const opts = f.options ? JSON.parse(f.options) : null;
      sectionsMap.get(f.section)!.push({
        id: f.id,
        key: f.key,
        label: f.label,
        description: f.description,
        helpText: f.helpText,
        type: f.type,
        options: opts,
        required: f.required,
        editable: f.editable,
        needsVerification: f.needsVerification,
        placeholder: f.placeholder,
        validationPattern: f.validationPattern,
        validationMessage: f.validationMessage,
        sortOrder: f.sortOrder,
        adminOnly: f.adminOnly,
      });
    }

    const sections = sectionOrder
      .filter(s => sectionsMap.has(s))
      .map(s => ({ name: s, label: sectionLabels[s] || s, fields: sectionsMap.get(s)! }));

    // Add any other sections not in the standard order
    for (const [s, fields] of sectionsMap.entries()) {
      if (!sectionOrder.includes(s)) {
        sections.push({ name: s, label: sectionLabels[s] || s, fields });
      }
    }

    // Build submissions map keyed by fieldId
    const submissionsMap: Record<string, any> = {};
    for (const sub of submissions) {
      submissionsMap[sub.fieldId] = {
        id: sub.id,
        value: sub.value,
        fileName: sub.fileName,
        filePath: sub.filePath,
        verified: sub.verified,
        verifiedAt: sub.verifiedAt,
        verificationNote: sub.verificationNote,
        editable: sub.field?.key ? fields.find(f => f.id === sub.fieldId)?.editable : true,
        editedAt: sub.editedAt,
      };
    }

    return NextResponse.json({
      userId: user.id,
      kycStatus: user.kycStatus || 'DRAFT',
      sections,
      submissions: submissionsMap,
    });
  } catch (e: any) {
    console.error('Dynamic KYC GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/customer/kyc-dynamic
 * Submit or update KYC field values
 *
 * Body:
 *   { userId, values: [{ fieldId, value, fileName?, filePath? }], submit?: boolean }
 *
 * - submit=true → set kycStatus to 'PROCESSING' for admin review
 * - submit=false → save as draft (kycStatus stays 'DRAFT')
 */
export async function POST(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { userId, values, submit } = body as {
      userId: string;
      values: Array<{ fieldId: string; value: string; fileName?: string; filePath?: string }>;
      submit?: boolean;
    };

    if (!userId || !Array.isArray(values)) {
      return NextResponse.json({ error: 'userId and values[] are required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, kycStatus: true, firstName: true, lastName: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If KYC is already APPROVED, block edits (admin must explicitly unlock)
    if (user.kycStatus === 'APPROVED') {
      return NextResponse.json(
        { error: 'KYC is already approved. Contact support to update your information.' },
        { status: 403 }
      );
    }

    // Validate required fields if submitting
    if (submit) {
      const allFields = await db.kycField.findMany({ where: { enabled: true } });
      const fieldMap = new Map(allFields.map(f => [f.id, f]));

      for (const f of allFields) {
        if (!f.required) continue;
        const submitted = values.find(v => v.fieldId === f.id);
        if (!submitted || !submitted.value || submitted.value.trim() === '') {
          return NextResponse.json(
            { error: `Required field missing: ${f.label}` },
            { status: 400 }
          );
        }
      }
    }

    // Upsert each value
    const now = new Date();
    let upsertedCount = 0;
    for (const v of values) {
      if (!v.fieldId) continue;

      const field = await db.kycField.findUnique({ where: { id: v.fieldId } });
      if (!field || !field.enabled) continue;

      // If field is not editable and a submission already exists, skip
      const existing = await db.kycSubmission.findUnique({
        where: { userId_fieldId: { userId, fieldId: v.fieldId } },
      });

      if (existing && !field.editable && existing.verified) {
        // Skip — verified non-editable field
        continue;
      }

      await db.kycSubmission.upsert({
        where: { userId_fieldId: { userId, fieldId: v.fieldId } },
        update: {
          value: String(v.value),
          fileName: v.fileName || null,
          filePath: v.filePath || null,
          editedAt: now,
          editedById: authPayload.id,
          // Reset verification on edit
          verified: false,
          verifiedAt: null,
          verificationNote: null,
        },
        create: {
          userId,
          fieldId: v.fieldId,
          value: String(v.value),
          fileName: v.fileName || null,
          filePath: v.filePath || null,
        },
      });
      upsertedCount++;
    }

    // If submit=true, update kycStatus to PROCESSING
    if (submit) {
      await db.user.update({
        where: { id: userId },
        data: { kycStatus: 'PROCESSING', profileStatus: 'pending_review' },
      });

      // Create notification for compliance team
      await db.notification.create({
        data: {
          userId,
          title: 'KYC Submitted',
          message: `Your KYC has been submitted for review. We will get back to you within 24 hours.`,
          type: 'kyc',
        },
      }).catch(() => {});
    } else {
      // Save as draft
      await db.user.update({
        where: { id: userId },
        data: { kycStatus: user.kycStatus || 'DRAFT' },
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      upsertedCount,
      kycStatus: submit ? 'PROCESSING' : (user.kycStatus || 'DRAFT'),
    });
  } catch (e: any) {
    console.error('Dynamic KYC POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

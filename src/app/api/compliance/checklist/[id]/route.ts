import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

const ITEMS = [
  'allConditionsVerified',
  'documentsComplete',
  'customerKycValid',
  'guarantorKycValid',
  'collateralDocumented',
  'offerLetterSigned',
  'bankAccountVerified',
  'disbursementAccountConfirmed',
] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'compliance']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    const body = await req.json();
    const { item, value } = body as { item: string; value: boolean };

    if (!ITEMS.includes(item as any)) {
      return NextResponse.json({ error: 'Unknown item' }, { status: 400 });
    }

    const existing = await db.preDisbursementChecklist.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = { [item]: value };

    // Recompute status: pending → in_progress → completed
    const fields = { ...existing, [item]: value } as any;
    const allChecked = ITEMS.every((k) => fields[k] === true);
    if (allChecked && existing.status === 'pending') {
      updateData.status = 'completed';
    } else if (!allChecked && existing.status === 'pending') {
      updateData.status = 'in_progress';
    }

    const checklist = await db.preDisbursementChecklist.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ checklist });
  } catch (e: any) {
    console.error('Toggle checklist item API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

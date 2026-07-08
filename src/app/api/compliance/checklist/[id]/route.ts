import { NextRequest, NextResponse } from 'next/server';
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

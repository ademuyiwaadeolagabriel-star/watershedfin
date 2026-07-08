import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rejectedBy = body.rejectedBy || null;
    const reason = body.reason || body.notes || '';

    const checklist = await db.preDisbursementChecklist.findUnique({ where: { id } });
    if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await db.preDisbursementChecklist.update({
      where: { id },
      data: {
        status: 'disbursement_rejected',
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    return NextResponse.json({ checklist: updated });
  } catch (e: any) {
    console.error('Reject checklist API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

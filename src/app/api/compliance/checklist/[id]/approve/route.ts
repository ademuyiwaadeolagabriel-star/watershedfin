import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const approvedBy = body.approvedBy || null;
    const notes = body.notes || '';

    const checklist = await db.preDisbursementChecklist.findUnique({ where: { id } });
    if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updated = await db.preDisbursementChecklist.update({
      where: { id },
      data: {
        status: 'disbursement_approved',
        approvedBy,
        approvedAt: new Date(),
        approvalNotes: notes,
      },
    });

    // Push loan to treasury payout
    await db.loanApplicants.update({
      where: { id: checklist.loanApplicantId },
      data: {
        complianceStatus: 'cleared_for_disbursement',
        currentStep: 'TREASURY_PAYOUT',
      },
    });

    return NextResponse.json({ checklist: updated });
  } catch (e: any) {
    console.error('Approve checklist API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

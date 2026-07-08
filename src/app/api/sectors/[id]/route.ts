import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.riskScore !== undefined) data.riskScore = Number(body.riskScore);
    if (body.riskScoreInt !== undefined) data.riskScoreInt = Number(body.riskScoreInt);
    if (body.benchmarkedMargin !== undefined) data.benchmarkedMargin = Number(body.benchmarkedMargin);
    const sector = await db.sector.update({ where: { id }, data });
    return NextResponse.json({ sector });
  } catch (e: any) {
    console.error('Update sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.sector.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

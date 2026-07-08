import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const sectors = await db.sector.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ sectors });
  } catch (e: any) {
    console.error('List sectors API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const sector = await db.sector.create({
      data: {
        name: body.name,
        riskScore: body.riskScore !== undefined ? Number(body.riskScore) : 0.5,
        riskScoreInt: body.riskScoreInt !== undefined ? Number(body.riskScoreInt) : null,
        benchmarkedMargin: body.benchmarkedMargin !== undefined ? Number(body.benchmarkedMargin) : null,
      },
    });
    return NextResponse.json({ sector });
  } catch (e: any) {
    console.error('Create sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

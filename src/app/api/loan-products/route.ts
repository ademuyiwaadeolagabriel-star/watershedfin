import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const products = await db.loanPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ products });
  } catch (e: any) {
    console.error('List loan products API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }
    const product = await db.loanPlan.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description || null,
        duration: Number(body.duration) || 12,
        interest: Number(body.interest) || 0,
        failedInterest: body.failedInterest ? Number(body.failedInterest) : null,
        installment: body.installment ? Number(body.installment) : null,
        min: body.min ? Number(body.min) : null,
        max: body.max ? Number(body.max) : null,
        type: body.type || null,
        productType: body.productType || null,
        minCreditScore: body.minCreditScore ? Number(body.minCreditScore) : 50,
        maxDebtServiceRatio: body.maxDebtServiceRatio ? Number(body.maxDebtServiceRatio) : 33,
        status: body.status !== undefined ? Number(body.status) : 1,
        createdBy: body.createdBy || null,
      },
    });
    return NextResponse.json({ product });
  } catch (e: any) {
    console.error('Create loan product API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

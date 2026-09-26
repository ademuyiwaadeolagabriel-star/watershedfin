import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v53 — auth gate: least-privilege role check.
  // Handler had no req param; inject one so requireRole can read the JWT.
  const authResult_v53 = await requireRole(req as NextRequest, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

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
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

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

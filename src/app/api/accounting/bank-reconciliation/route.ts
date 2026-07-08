import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: unreconciled bank transactions
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const accountId = url.searchParams.get('accountId');
    const where: any = { isReconciled: false };
    if (accountId) where.chartOfAccountId = accountId;

    const transactions = await db.bankTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: { account: true },
    });

    const accounts = await db.chartOfAccount.findMany({
      where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json({ transactions, accounts });
  } catch (e: any) {
    console.error('Bank reconciliation GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: reconcile selected transactions
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transactionIds, reconciledBy } = body;
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'transactionIds required' }, { status: 400 });
    }
    const result = await db.bankTransaction.updateMany({
      where: { id: { in: transactionIds }, isReconciled: false },
      data: { isReconciled: true, reconciledAt: new Date(), reconciledBy: reconciledBy || null },
    });
    return NextResponse.json({ reconciled: result.count });
  } catch (e: any) {
    console.error('Bank reconciliation POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

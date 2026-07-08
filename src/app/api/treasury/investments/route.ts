import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeMaturity, generateSubscriptionCode } from '@/lib/treasury';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const userId = url.searchParams.get('userId');
    const take = parseInt(url.searchParams.get('take') || '200');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (userId) where.userId = userId;

    const investments = await db.treasuryInvestment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        product: true,
      },
    });

    return NextResponse.json({ investments });
  } catch (e: any) {
    console.error('Treasury investments GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, productId, principal, tenorDays, rate, payoutType, rolloverType, payoutBankDetails, bookedBy } = body;

    if (!userId || !productId || !principal || !tenorDays) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const product = await db.treasuryProduct.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    if (!product.isActive) return NextResponse.json({ error: 'Product is inactive' }, { status: 400 });

    const principalNum = Number(principal);
    const tenor = Number(tenorDays);
    const interestRate = Number(rate ?? product.interestRatePa);

    if (principalNum < product.minAmount) {
      return NextResponse.json({ error: `Minimum amount is ₦${product.minAmount}` }, { status: 400 });
    }
    if (product.maxAmount && principalNum > product.maxAmount) {
      return NextResponse.json({ error: `Maximum amount is ₦${product.maxAmount}` }, { status: 400 });
    }
    if (tenor < product.minTenorDays || tenor > product.maxTenorDays) {
      return NextResponse.json(
        { error: `Tenor must be between ${product.minTenorDays} and ${product.maxTenorDays} days` },
        { status: 400 }
      );
    }

    const startDate = new Date();
    const maturityDate = computeMaturity(startDate, tenor);
    const subscriptionCode = await generateSubscriptionCode();

    const investment = await db.treasuryInvestment.create({
      data: {
        subscriptionCode,
        userId,
        productId,
        principal: principalNum,
        interestRate,
        tenorDays: tenor,
        startDate,
        maturityDate,
        accruedInterest: 0,
        whtDeducted: 0,
        payoutType: payoutType || 'backend',
        rolloverType: rolloverType || 'none',
        payoutBankDetails: payoutBankDetails ? JSON.stringify(payoutBankDetails) : null,
        status: 'active',
        bookedBy: bookedBy || null,
      },
      include: { product: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    // Record subscription transaction
    await db.treasuryTransaction.create({
      data: {
        investmentId: investment.id,
        type: 'subscription',
        amount: principalNum,
        direction: 'debit',
        reference: subscriptionCode,
      },
    });

    return NextResponse.json({ investment }, { status: 201 });
  } catch (e: any) {
    console.error('Treasury investment POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

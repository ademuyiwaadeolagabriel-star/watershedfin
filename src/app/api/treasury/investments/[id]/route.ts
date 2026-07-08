import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeMaturity, generateSubscriptionCode, refreshAccrual } from '@/lib/treasury';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await refreshAccrual(id);
    const investment = await db.treasuryInvestment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        product: true,
        dailyAccruals: { orderBy: { date: 'desc' }, take: 365 },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!investment) return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
    return NextResponse.json({ investment });
  } catch (e: any) {
    console.error('Treasury investment GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action; // redeem | rollover

    const inv = await refreshAccrual(id);
    if (!inv) return NextResponse.json({ error: 'Investment not found' }, { status: 404 });
    if (inv.status !== 'active' && inv.status !== 'matured') {
      return NextResponse.json({ error: `Cannot ${action} investment with status ${inv.status}` }, { status: 400 });
    }

    const product = await db.treasuryProduct.findUnique({ where: { id: inv.productId } });

    if (action === 'redeem') {
      // Liquidate: compute net payout (principal + accrued - penalty if early - wht)
      const isEarly = new Date() < new Date(inv.maturityDate);
      const penaltyRate = isEarly ? (product?.earlyLiquidationPenalty ?? 0) : 0;
      const penalty = (inv.accruedInterest * penaltyRate) / 100;
      const netPayout = inv.principal + inv.accruedInterest - penalty - inv.whtDeducted;

      await db.treasuryTransaction.create({
        data: {
          investmentId: id,
          type: 'full_redemption',
          amount: netPayout,
          direction: 'credit',
          reference: `REDEEM-${inv.subscriptionCode}`,
        },
      });

      const updated = await db.treasuryInvestment.update({
        where: { id },
        data: { status: 'liquidated' },
      });

      return NextResponse.json({
        investment: updated,
        payout: { principal: inv.principal, accrued: inv.accruedInterest, penalty, wht: inv.whtDeducted, net: netPayout },
      });
    }

    if (action === 'rollover') {
      const rolloverType = body.rolloverType || inv.rolloverType || 'principal_only';
      let newPrincipal = inv.principal;
      if (rolloverType === 'principal_plus_interest') {
        newPrincipal = inv.principal + inv.accruedInterest;
      }
      const newTenor = Number(body.tenorDays) || inv.tenorDays;
      const newRate = body.rate ? Number(body.rate) : inv.interestRate;
      const newStart = new Date();
      const newMaturity = computeMaturity(newStart, newTenor);
      const newCode = await generateSubscriptionCode();

      // Mark old as rolled_over
      await db.treasuryInvestment.update({
        where: { id },
        data: { status: 'rolled_over' },
      });
      await db.treasuryTransaction.create({
        data: {
          investmentId: id,
          type: 'full_redemption',
          amount: inv.principal + inv.accruedInterest,
          direction: 'credit',
          reference: `ROLLOUT-${inv.subscriptionCode}`,
        },
      });

      // Create new investment
      const newInv = await db.treasuryInvestment.create({
        data: {
          subscriptionCode: newCode,
          userId: inv.userId,
          productId: inv.productId,
          principal: newPrincipal,
          interestRate: newRate,
          tenorDays: newTenor,
          startDate: newStart,
          maturityDate: newMaturity,
          payoutType: inv.payoutType,
          rolloverType,
          payoutBankDetails: inv.payoutBankDetails,
          status: 'active',
          bookedBy: inv.bookedBy,
        },
      });
      await db.treasuryTransaction.create({
        data: {
          investmentId: newInv.id,
          type: 'subscription',
          amount: newPrincipal,
          direction: 'debit',
          reference: newCode,
        },
      });

      return NextResponse.json({ investment: newInv, previous: inv.subscriptionCode });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    console.error('Treasury investment POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

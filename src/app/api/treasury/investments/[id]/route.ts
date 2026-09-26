import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeMaturity, generateSubscriptionCode, refreshAccrual } from '@/lib/treasury';

export async function GET(req : NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

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
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  // v53-P4 (audit #43/#44) — maker-checker gate (graceful rollout).
  // Only enforced when the caller passes `?stage=propose|review|authorize|execute`.
  // Without a stage query param the route falls back to its existing behavior.
  // Applies to both `redeem` and `rollover` actions.
  const url_v53 = new URL(req.url);
  if (url_v53.searchParams.get('stage')) {
    const mc_v53 = await requireMakerChecker(req, {
      operation: 'treasury_investment_redeem_rollover',
      stages: ['propose', 'review', 'authorize', 'execute'],
      enforceSegregation: true,
      makerRoles: ['treasury', 'cfo', 'finance'],
      checkerRoles: ['treasury', 'cfo', 'finance'],
      authorizerRoles: ['cfo', 'super'],
      executorRoles: ['treasury', 'cfo', 'finance'],
    });
    if (mc_v53 instanceof NextResponse) return mc_v53;
  }

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
      // v51 — Decimal arithmetic: inv.accruedInterest is Decimal | null,
      // inv.principal is Decimal, inv.whtDeducted is Decimal | null. Wrap
      // each with Number() before arithmetic.
      const isEarly = new Date() < new Date(inv.maturityDate);
      const penaltyRate = isEarly ? (product?.earlyLiquidationPenalty ?? 0) : 0;
      const penalty = (Number(inv.accruedInterest || 0) * penaltyRate) / 100;
      const netPayout = Number(inv.principal) + Number(inv.accruedInterest || 0) - penalty - Number(inv.whtDeducted || 0);

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
      // v51 — Decimal arithmetic: inv.principal is Decimal, accruedInterest
      // is Decimal | null. Wrap with Number().
      let newPrincipal = Number(inv.principal);
      if (rolloverType === 'principal_plus_interest') {
        newPrincipal = Number(inv.principal) + Number(inv.accruedInterest || 0);
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
          // v51 — Decimal arithmetic: wrap inv.principal + accruedInterest.
          amount: Number(inv.principal) + Number(inv.accruedInterest || 0),
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

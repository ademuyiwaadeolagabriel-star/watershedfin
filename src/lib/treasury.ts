// Treasury domain helpers (server-side only)
import { db } from '@/lib/db';

// Compute accrued interest using simple interest: principal * rate/100/365 * daysElapsed
export function computeAccrued(principal: number, ratePa: number, startDate: Date, maturityDate: Date): number {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(maturityDate);
  const cutoff = now > end ? end : now;
  const ms = cutoff.getTime() - start.getTime();
  if (ms <= 0) return 0;
  const daysElapsed = Math.floor(ms / 86400000);
  const dailyRate = ratePa / 100 / 365;
  return principal * dailyRate * daysElapsed;
}

export function computeMaturity(startDate: Date, tenorDays: number): Date {
  const d = new Date(startDate);
  d.setDate(d.getDate() + tenorDays);
  return d;
}

// Generate subscription code: INV-YYYY-NNN
export async function generateSubscriptionCode(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.treasuryInvestment.count({
    where: { subscriptionCode: { startsWith: `INV-${year}-` } },
  });
  return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
}

// Recompute and persist accrued interest for an active investment
export async function refreshAccrual(investmentId: string) {
  const inv = await db.treasuryInvestment.findUnique({ where: { id: investmentId } });
  if (!inv) return null;
  if (inv.status !== 'active' && inv.status !== 'matured') return inv;
  const accrued = computeAccrued(inv.principal, inv.interestRate, inv.startDate, inv.maturityDate);
  const product = await db.treasuryProduct.findUnique({ where: { id: inv.productId } });
  const whtRate = product?.whtRate ?? 0;
  const wht = (accrued * whtRate) / 100;
  const updated = await db.treasuryInvestment.update({
    where: { id: investmentId },
    data: { accruedInterest: accrued, whtDeducted: wht },
  });
  // Auto-mark matured if past maturity
  if (updated.status === 'active' && new Date() >= new Date(updated.maturityDate)) {
    return db.treasuryInvestment.update({
      where: { id: investmentId },
      data: { status: 'matured' },
    });
  }
  return updated;
}

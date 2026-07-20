import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/portfolio/health
 * Returns portfolio health metrics:
 * - NPL ratio by branch
 * - Sector exposure concentration
 * - Aging buckets (current, 1-30, 31-60, 60+ days)
 * - Total portfolio value
 */
export async function GET(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // Get all running loans
    const loans = await db.loanApplicants.findMany({
      where: { status: 'running' },
      select: {
        id: true, amount: true, finalAmount: true,
        branchId: true, sectorId: true,
        disbursedAt: true, startDate: true,
        defaulter: true,
        branch: { select: { name: true, code: true } },
        sectorRef: { select: { name: true } },
      },
    });

    // Calculate portfolio totals
    const totalPortfolio = loans.reduce((s, l) => s + (l.finalAmount || l.amount), 0);
    const defaultedLoans = loans.filter(l => l.defaulter);
    const nplRatio = loans.length > 0 ? (defaultedLoans.length / loans.length) * 100 : 0;

    // NPL by branch
    const branchHealth = loans.reduce((acc: any, l) => {
      const branchName = l.branch?.name || 'Unassigned';
      if (!acc[branchName]) acc[branchName] = { total: 0, defaulted: 0, count: 0, value: 0 };
      acc[branchName].count++;
      acc[branchName].value += (l.finalAmount || l.amount);
      if (l.defaulter) acc[branchName].defaulted++;
      return acc;
    }, {});

    const branchHealthArray = Object.entries(branchHealth).map(([name, data]: [string, any]) => ({
      branch: name,
      loanCount: data.count,
      totalValue: data.value,
      defaulted: data.defaulted,
      nplRatio: data.count > 0 ? (data.defaulted / data.count) * 100 : 0,
      status: data.count > 0 && (data.defaulted / data.count) > 0.1 ? 'red' : (data.defaulted / data.count) > 0.05 ? 'amber' : 'green',
    }));

    // Sector exposure
    const sectorExposure = loans.reduce((acc: any, l) => {
      const sectorName = l.sectorRef?.name || 'Unknown';
      if (!acc[sectorName]) acc[sectorName] = { count: 0, value: 0 };
      acc[sectorName].count++;
      acc[sectorName].value += (l.finalAmount || l.amount);
      return acc;
    }, {});

    const sectorArray = Object.entries(sectorExposure)
      .map(([name, data]: [string, any]) => ({
        sector: name,
        loanCount: data.count,
        totalValue: data.value,
        concentration: totalPortfolio > 0 ? (data.value / totalPortfolio) * 100 : 0,
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);

    // Aging buckets
    const now = Date.now();
    const aging = { current: 0, days1to30: 0, days31to60: 0, days60plus: 0 };
    loans.forEach(l => {
      if (!l.startDate) { aging.current++; return; }
      const daysSinceStart = (now - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24);
      if (l.defaulter) {
        if (daysSinceStart > 60) aging.days60plus++;
        else if (daysSinceStart > 30) aging.days31to60++;
        else if (daysSinceStart > 0) aging.days1to30++;
        else aging.current++;
      } else {
        aging.current++;
      }
    });

    return NextResponse.json({
      totalLoans: loans.length,
      totalPortfolioValue: totalPortfolio,
      nplRatio,
      defaultedCount: defaultedLoans.length,
      branchHealth: branchHealthArray,
      sectorExposure: sectorArray,
      aging,
    });
  } catch (e: any) {
    console.error('Portfolio health error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getBranchPerformance, getCurrentPeriod } from '@/lib/branch-performance';

// ============================================================================
// GET /api/branches/[id]/performance?period=monthly|quarterly|annual|daily
// Authorization: Bearer <admin-jwt>
//
// v4 — Branch Performance Control Tower.
// Returns the full performance summary: actuals, pace-to-target forecast,
// LO allocation variance, application funnel, portfolio quality, collections,
// operations SLA, customer growth, field visits, and alerts.
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'cfo', 'bm', 'loan', 'lo', 'cs', 'compliance', 'credit', 'analyst']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    if (['bm', 'loan', 'lo', 'cs', 'compliance', 'credit', 'analyst'].includes(authResult.role)) {
      if (!authResult.branchId || authResult.branchId !== id) {
        return NextResponse.json({ error: 'Access denied — branch performance is restricted to your assigned branch.' }, { status: 403 });
      }
    }
    const url = new URL(req.url);
    const periodType = (url.searchParams.get('period') || 'monthly') as 'monthly' | 'quarterly' | 'annual' | 'daily';

    const performance = await getBranchPerformance(id, periodType);

    return NextResponse.json({
      branchId: id,
      branchName: performance.branchName,
      period: {
        type: performance.period.type,
        label: performance.period.label,
        start: performance.period.start.toISOString(),
        end: performance.period.end.toISOString(),
        elapsedPercent: Math.round(getCurrentPeriod(periodType).end.getTime() > Date.now()
          ? ((Date.now() - performance.period.start.getTime()) / (performance.period.end.getTime() - performance.period.start.getTime())) * 100
          : 100),
      },
      metrics: performance.metrics,
      forecast: performance.forecast,
      loAllocation: performance.loAllocation,
      applicationFunnel: performance.applicationFunnel,
      portfolioQuality: performance.portfolioQuality,
      collections: performance.collections,
      operations: performance.operations,
      customerGrowth: performance.customerGrowth,
      fieldVisits: performance.fieldVisits,
      alerts: performance.alerts,
    });
  } catch (e: any) {
    console.error('Branch performance error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

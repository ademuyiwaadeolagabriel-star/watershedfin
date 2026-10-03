import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getAllBranchesPerformance } from '@/lib/branch-performance';

// ============================================================================
// GET /api/branches/performance-comparison?period=monthly|quarterly|annual
// Authorization: Bearer <admin-jwt (super/md/hoc/cro)>
//
// v4 — Executive branch comparison dashboard.
// Returns a flat comparison table of all branches.
// ============================================================================

export async function GET(req: NextRequest) {
  const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'cfo']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const url = new URL(req.url);
    const periodType = (url.searchParams.get('period') || 'monthly') as 'monthly' | 'quarterly' | 'annual';

    const branches = await getAllBranchesPerformance(periodType);

    return NextResponse.json({ branches, period: periodType });
  } catch (e: any) {
    console.error('Branch comparison error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

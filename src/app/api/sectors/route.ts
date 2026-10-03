import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// ============================================================================
// /api/sectors
//   GET  — public: list all sectors (used by CAM UI + customer onboarding form)
//   POST — admin-only: create a new sector with benchmarked margin
//   (PUT/DELETE on /api/sectors/[id] — see that route)
//
// v50 FIX (Issue #26): POST/PUT/DELETE on sectors are now admin-only.
// The sector `benchmarkedMargin` is the AUTHORITATIVE source used by the
// CAM engine via computeMarginSummaryBase() — if any anonymous user could
// modify it, they could lower the benchmark to make risky loans look
// affordable. That is a direct financial-integrity risk.
//
// Allowed roles: super, md, hoc, cro, superadmin — anyone senior enough
// to set lending policy.
// ============================================================================

const SECTOR_EDITOR_ROLES = ['super', 'md', 'hoc', 'cro'];

export async function GET() {
  try {
    const sectors = await db.sector.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ sectors });
  } catch (e: any) {
    console.error('List sectors API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // v50 — auth gate: only senior admin roles may create / modify sectors.
    const authResult = await requireRole(req, SECTOR_EDITOR_ROLES);
    if (authResult instanceof NextResponse) return authResult;

    const body = await req.json().catch(() => ({}));
    if (!body.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const margin = body.benchmarkedMargin !== undefined ? Number(body.benchmarkedMargin) : null;
    const riskScore = body.riskScore !== undefined ? Number(body.riskScore) : 0.5;
    if (margin != null && (!Number.isFinite(margin) || margin < 0)) {
      return NextResponse.json({ error: 'benchmarkedMargin must be a finite non-negative percentage.' }, { status: 400 });
    }
    if (!Number.isFinite(riskScore) || riskScore < 0) {
      return NextResponse.json({ error: 'riskScore must be a finite non-negative number.' }, { status: 400 });
    }
    const sector = await db.sector.create({
      data: {
        name: String(body.name).trim(),
        riskScore,
        riskScoreInt: body.riskScoreInt !== undefined ? Number(body.riskScoreInt) : null,
        benchmarkedMargin: margin,
      },
    });
    await db.auditLog.create({
      data: {
        adminId: authResult.id,
        action: 'sector_created',
        module: 'settings',
        description: `Created sector ${sector.name}; benchmark margin=${sector.benchmarkedMargin ?? 'unset'}`,
        severity: 'info',
        metadata: JSON.stringify({ sectorId: sector.id, benchmarkedMargin: sector.benchmarkedMargin }),
      },
    });
    return NextResponse.json({ sector });
  } catch (e: any) {
    console.error('Create sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

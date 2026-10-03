import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

// ============================================================================
// /api/sectors/[id]
//   PUT    — admin-only: update sector fields (incl. benchmarkedMargin)
//   DELETE — admin-only: remove a sector
//
// v50 FIX (Issue #26): Both mutations are now admin-only. The
// benchmarkedMargin directly affects CAM affordability calculations
// (via computeMarginSummaryBase) — see Issue #2/#3 in the v50 audit.
// Unauthorized modification would let attackers manipulate loan
// approvals.
// ============================================================================

const SECTOR_EDITOR_ROLES = ['super', 'md', 'hoc', 'cro'];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // v50 — auth gate.
    const authResult = await requireRole(req, SECTOR_EDITOR_ROLES);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.riskScore !== undefined) data.riskScore = Number(body.riskScore);
    if (body.riskScoreInt !== undefined) data.riskScoreInt = Number(body.riskScoreInt);
    if (body.benchmarkedMargin !== undefined) {
      const margin = Number(body.benchmarkedMargin);
      if (!Number.isFinite(margin) || margin < 0) {
        return NextResponse.json({ error: 'benchmarkedMargin must be a finite non-negative percentage.' }, { status: 400 });
      }
      data.benchmarkedMargin = margin;
    }
    const sector = await db.sector.update({ where: { id }, data });
    await db.auditLog.create({
      data: {
        adminId: authResult.id,
        action: 'sector_updated',
        module: 'settings',
        description: `Updated sector ${sector.name}; benchmark margin=${sector.benchmarkedMargin}%`,
        severity: 'info',
        metadata: JSON.stringify({ sectorId: sector.id, benchmarkedMargin: Number(sector.benchmarkedMargin), riskScore: Number(sector.riskScore) }),
      },
    });
    return NextResponse.json({ sector });
  } catch (e: any) {
    console.error('Update sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // v50 — auth gate.
    const authResult = await requireRole(req, SECTOR_EDITOR_ROLES);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;
    await db.sector.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete sector API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

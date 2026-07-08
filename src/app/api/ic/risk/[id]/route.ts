import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function calcRating(score: number): string {
  if (score >= 20) return 'critical';
  if (score >= 15) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const risk = await db.riskAssessment.findUnique({
      where: { id },
      include: {
        riskOwner: { select: { id: true, firstName: true, lastName: true, username: true } },
        histories: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!risk) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ risk });
  } catch (e: any) {
    console.error('Get risk API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.riskAssessment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = {};
    for (const k of ['title', 'description', 'category', 'type', 'riskResponse', 'treatmentPlan', 'riskOwnerId', 'controlEffectiveness', 'status', 'nextReviewDate']) {
      if (k in body) updateData[k] = body[k];
    }

    // Recalculate inherent
    const likelihood = body.inherentLikelihood !== undefined ? Number(body.inherentLikelihood) : existing.inherentLikelihood;
    const impact = body.inherentImpact !== undefined ? Number(body.inherentImpact) : existing.inherentImpact;
    if (likelihood != null && impact != null) {
      updateData.inherentLikelihood = likelihood;
      updateData.inherentImpact = impact;
      updateData.inherentScore = likelihood * impact;
      updateData.inherentRiskRating = calcRating(likelihood * impact);
    }

    // Recalculate residual
    const rLik = body.residualLikelihood !== undefined ? Number(body.residualLikelihood) : existing.residualLikelihood;
    const rImp = body.residualImpact !== undefined ? Number(body.residualImpact) : existing.residualImpact;
    if (rLik != null && rImp != null) {
      updateData.residualLikelihood = rLik;
      updateData.residualImpact = rImp;
      updateData.residualScore = rLik * rImp;
      updateData.residualRiskRating = calcRating(rLik * rImp);
    }

    updateData.lastReviewDate = new Date();

    const risk = await db.riskAssessment.update({ where: { id }, data: updateData });

    await db.riskAssessmentHistory.create({
      data: {
        riskAssessmentId: id,
        assessorId: body.assessorId || null,
        action: 'updated',
        changes: JSON.stringify(updateData),
        notes: body.notes || 'Risk updated',
      },
    });

    return NextResponse.json({ risk });
  } catch (e: any) {
    console.error('Update risk API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.riskAssessment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete risk API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

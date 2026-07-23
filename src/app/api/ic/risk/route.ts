import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

function calcRating(score: number): string {
  if (score >= 20) return 'critical';
  if (score >= 15) return 'high';
  if (score >= 8) return 'medium';
  return 'low';
}

async function genRiskCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RSK-${year}-`;
  const last = await db.riskAssessment.findFirst({
    where: { riskCode: { startsWith: prefix } },
    orderBy: { riskCode: 'desc' },
    select: { riskCode: true },
  });
  let next = 1;
  if (last?.riskCode) {
    const m = last.riskCode.match(/(\d+)$/);
    if (m) next = parseInt(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

export async function GET(req: NextRequest) {
  // v44: Added auth check
  const authPayload = getAuthFromRequest(req);
  if (!authPayload) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const status = url.searchParams.get('status');
    const rating = url.searchParams.get('rating');

    const where: any = {};
    if (category && category !== 'all') where.category = category;
    if (status && status !== 'all') where.status = status;
    if (rating && rating !== 'all') where.inherentRiskRating = rating;

    const risks = await db.riskAssessment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        riskOwner: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });

    return NextResponse.json({ risks });
  } catch (e: any) {
    console.error('List risks API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v44: Added auth + role check — only CRO, HOC, internal control, or super can create risks
  const authPayload = getAuthFromRequest(req);
  if (!authPayload) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const allowedRoles = ['super', 'cro', 'hoc', 'admin'];
  if (!allowedRoles.includes(authPayload.role) && !(authPayload as any).internalControl) {
    return NextResponse.json(
      { error: 'Only CRO, HOC, Internal Control, or Super Admin can create risk assessments' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const likelihood = Number(body.inherentLikelihood) || 0;
    const impact = Number(body.inherentImpact) || 0;
    const score = likelihood * impact;
    const rating = calcRating(score);

    const riskCode = await genRiskCode();
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 90);

    const risk = await db.riskAssessment.create({
      data: {
        riskCode,
        title: body.title,
        description: body.description || null,
        category: body.category || null,
        type: body.type || null,
        inherentLikelihood: likelihood,
        inherentImpact: impact,
        inherentScore: score,
        inherentRiskRating: rating,
        residualLikelihood: body.residualLikelihood ? Number(body.residualLikelihood) : null,
        residualImpact: body.residualImpact ? Number(body.residualImpact) : null,
        residualScore: body.residualLikelihood && body.residualImpact ? Number(body.residualLikelihood) * Number(body.residualImpact) : null,
        residualRiskRating: body.residualLikelihood && body.residualImpact
          ? calcRating(Number(body.residualLikelihood) * Number(body.residualImpact))
          : null,
        riskResponse: body.riskResponse || null,
        treatmentPlan: body.treatmentPlan || null,
        riskOwnerId: body.riskOwnerId || authPayload.id,
        controlEffectiveness: body.controlEffectiveness || null,
        status: body.status || 'identified',
        nextReviewDate: nextReview,
      },
    });

    // History entry
    await db.riskAssessmentHistory.create({
      data: {
        riskAssessmentId: risk.id,
        assessorId: authPayload.id,
        action: 'created',
        notes: `Risk identified with score ${score} (${rating})`,
        changes: JSON.stringify({ likelihood, impact, score, rating }),
      },
    });

    // v44: Audit log
    await db.auditLog.create({
      data: {
        adminId: authPayload.id,
        action: 'risk_assessment_created',
        module: 'ic',
        description: `Risk assessment ${riskCode} created: ${body.title} (score: ${score}, rating: ${rating})`,
        severity: rating === 'critical' ? 'critical' : 'info',
        metadata: JSON.stringify({ riskId: risk.id, riskCode, score, rating }),
      },
    });

    return NextResponse.json({ risk });
  } catch (e: any) {
    console.error('Create risk API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

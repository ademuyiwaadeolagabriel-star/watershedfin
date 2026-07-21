import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/legal/cac-search
 * Returns pending Legal CAC Name Search cases (for Legal staff with legalCacSearch permission)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;

  const cases = await db.legalNameSearch.findMany({
    where: { status: { in: ['pending', 'in_review', 'customer_responded'] } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          business: { select: { name: true, rcBnNumber: true, businessType: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ cases });
}

/**
 * POST /api/legal/cac-search
 * Body: { caseId, action: 'approve' | 'reject', reason?, searchResult? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { caseId, action, reason, searchResult } = body;

    const legalCase = await db.legalNameSearch.findUnique({ where: { id: caseId } });
    if (!legalCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await db.legalNameSearch.update({
        where: { id: caseId },
        data: {
          status: 'approved',
          searchResult: searchResult || 'Approved',
          approvedById: payload?.id,
          approvedAt: new Date(),
        },
      });

      // Generate account number for the user
      const accountNumber = String(Math.floor(1000000000 + Math.random() * 9000000000));

      await db.user.update({
        where: { id: legalCase.userId },
        data: {
          accountNumber,
          accountNumberStatus: 'assigned',
          accountNumberAssignedAt: new Date(),
          accountNumberAssignedById: payload?.id,
          onboardingStage: 'onboarding_complete',
        },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'legal_cac_approved',
          description: `Approved CAC search for user ${legalCase.userId} — account number ${accountNumber} assigned`,
          module: 'legal',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      return NextResponse.json({ ok: true, accountNumber });
    } else if (action === 'reject') {
      await db.legalNameSearch.update({
        where: { id: caseId },
        data: {
          status: 'rejected',
          rejectionReason: reason || 'Rejected by Legal',
        },
      });

      await db.user.update({
        where: { id: legalCase.userId },
        data: { onboardingStage: 'legal_rejected' },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'legal_cac_rejected',
          description: `Rejected CAC search for user ${legalCase.userId}: ${reason}`,
          module: 'legal',
          severity: 'warning',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/admin/restructure
//   GET  — admin fetches the restructuring queue (all pending/all status)
//   POST — (not used; customers create requests via /api/customer/restructure)
// ============================================================================

export async function GET(req: NextRequest) {
  // v53 — admin auth gate.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;
  const authPayload = authResult_v53 as { id: string; role: string };

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const loanId = url.searchParams.get('loanId');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (loanId) where.loanApplicantId = loanId;

    const requests = await db.loanRestructuring.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with loan + user details
    const loanIds = Array.from(new Set(requests.map((r) => r.loanApplicantId).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(requests.map((r) => r.userId).filter(Boolean))) as string[];

    const [loans, users] = await Promise.all([
      loanIds.length > 0
        ? db.loanApplicants.findMany({
            where: { id: { in: loanIds } },
            select: { id: true, applicationRef: true, amount: true, approvedAmount: true, duration: true, status: true },
          }).catch(() => [])
        : Promise.resolve([]),
      userIds.length > 0
        ? db.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, accountNumber: true, phone: true },
          }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const loanMap = new Map<string, any>(loans.map((l: any) => [l.id, l] as [string, any]));
    const userMap = new Map<string, any>(users.map((u: any) => [u.id, u] as [string, any]));

    const enriched = requests.map((r) => ({
      ...r,
      loanApplicant: loanMap.get(r.loanApplicantId) || null,
      user: userMap.get(r.userId) || null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (e: any) {
    console.error('Admin restructure GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

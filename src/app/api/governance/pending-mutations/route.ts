import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, updatePendingMutationStatus } from '@/lib/auth';

const GOVERNANCE_ROLES = ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'treasury', 'teller'];

/**
 * Maker/checker queue. The queue never executes a mutation itself; execution
 * remains bound to the original protected business route and its exact
 * authorized payload.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, GOVERNANCE_ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'PENDING';
    const operation = url.searchParams.get('operation');
    const where: any = status === 'all' ? {} : { status };
    if (operation) where.operation = operation;
    const proposals = await db.pendingMutation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, operation: true, targetId: true, payloadJson: true, status: true,
        makerId: true, checkerId: true, authorizerId: true, rejectedById: true,
        reviewedAt: true, authorizedAt: true, rejectedAt: true, executedAt: true,
        expiresAt: true, createdAt: true,
      },
    });
    return NextResponse.json({ proposals });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, GOVERNANCE_ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const proposalId = String(body.proposalId || '');
    const action = String(body.action || '').toLowerCase();
    if (!proposalId || !['review', 'authorize', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'proposalId and action(review|authorize|reject) are required.' }, { status: 400 });
    }
    const proposal = await db.pendingMutation.findUnique({ where: { id: proposalId } });
    if (!proposal) return NextResponse.json({ error: 'Proposal not found.' }, { status: 404 });
    if (proposal.expiresAt && proposal.expiresAt < new Date()) {
      await db.pendingMutation.update({ where: { id: proposalId }, data: { status: 'EXPIRED' } });
      return NextResponse.json({ error: 'Proposal has expired.' }, { status: 409 });
    }
    if (proposal.makerId === auth.id) return NextResponse.json({ error: 'Segregation of duties: maker cannot approve their own proposal.' }, { status: 403 });

    if (action === 'review') {
      if (!['PENDING'].includes(proposal.status)) return NextResponse.json({ error: `Proposal is ${proposal.status}, cannot review.` }, { status: 409 });
      await updatePendingMutationStatus(proposalId, 'REVIEWED', auth.id);
    } else if (action === 'authorize') {
      if (!['REVIEWED'].includes(proposal.status)) return NextResponse.json({ error: `Proposal is ${proposal.status}, cannot authorize.` }, { status: 409 });
      if (!['super', 'cfo'].includes(auth.role)) return NextResponse.json({ error: 'Only CFO or superadmin may authorize.' }, { status: 403 });
      if (proposal.checkerId === auth.id) return NextResponse.json({ error: 'Segregation of duties: checker cannot authorize the same proposal.' }, { status: 403 });
      await updatePendingMutationStatus(proposalId, 'AUTHORIZED', auth.id);
    } else {
      if (['EXECUTED', 'REJECTED', 'EXPIRED'].includes(proposal.status)) return NextResponse.json({ error: `Proposal is already ${proposal.status}.` }, { status: 409 });
      await updatePendingMutationStatus(proposalId, 'REJECTED', auth.id);
    }
    return NextResponse.json({ ok: true, proposalId, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

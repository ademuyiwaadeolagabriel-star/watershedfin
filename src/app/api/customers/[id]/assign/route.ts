import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { notifyClientAssigned } from '@/lib/notification-service';

/**
 * POST /api/customers/[id]/assign
 * Assigns a client to a Branch Manager (by Frontdesk) or to a Loan Officer (by BM).
 *
 * Body for Frontdesk → BM assignment:
 *   { assignTo: 'bm', bmId: 'admin_id', branchId: 'branch_id' }
 *
 * Body for BM → LO assignment:
 *   { assignTo: 'lo', loId: 'admin_id' }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: userId } = await params;
    const body = await req.json();
    const { assignTo, bmId, loId, branchId } = body;

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { branch: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (assignTo === 'bm') {
      // Frontdesk assigns to Branch Manager
      if (!bmId) return NextResponse.json({ error: 'bmId required' }, { status: 400 });

      const bm = await db.admin.findUnique({ where: { id: bmId } });
      if (!bm || bm.role !== 'bm') {
        return NextResponse.json({ error: 'Invalid Branch Manager' }, { status: 400 });
      }

      await db.user.update({
        where: { id: userId },
        data: {
          assignedBmId: bmId,
          assignedBranchId: branchId || bm.branchId,
          branchId: branchId || bm.branchId,
          assignmentStatus: 'pending_lo_assignment',
          assignedBy: authPayload.id,
          assignedAt: new Date(),
          profileStatus: 'complete',
        },
      });

      // Notify BM
      const clientName = `${user.firstName} ${user.lastName}`.trim();
      const bmName = `${bm.firstName} ${bm.lastName}`.trim();
      await notifyClientAssigned(bmId, bmName, bm.email, clientName, 'Branch Manager');

      return NextResponse.json({ success: true, message: 'Client assigned to Branch Manager' });

    } else if (assignTo === 'lo') {
      // BM assigns to Loan Officer
      if (!loId) return NextResponse.json({ error: 'loId required' }, { status: 400 });

      const lo = await db.admin.findUnique({ where: { id: loId } });
      if (!lo || (lo.role !== 'loan' && lo.role !== 'super')) {
        return NextResponse.json({ error: 'Invalid Loan Officer' }, { status: 400 });
      }

      await db.user.update({
        where: { id: userId },
        data: {
          staffId: loId,
          assignmentStatus: 'assigned',
          assignedBy: authPayload.id,
          assignedAt: new Date(),
        },
      });

      // Notify LO
      const clientName = `${user.firstName} ${user.lastName}`.trim();
      const loName = `${lo.firstName} ${lo.lastName}`.trim();
      await notifyClientAssigned(loId, loName, lo.email, clientName, 'Loan Officer');

      return NextResponse.json({ success: true, message: 'Client assigned to Loan Officer' });
    }

    return NextResponse.json({ error: 'Invalid assignTo value. Use "bm" or "lo".' }, { status: 400 });
  } catch (e: any) {
    console.error('Assignment error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

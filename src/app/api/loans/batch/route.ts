import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * POST /api/loans/batch
 * Performs batch operations on multiple loans
 * Body: { action: 'assign_analyst'|'reject'|'export', loanIds: string[], analystId?: string }
 *
 * Accessible by: HOC, MD, Super
 */
export async function POST(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const allowedRoles = ['super', 'md', 'hoc'];
    if (!allowedRoles.includes(authPayload.role)) {
      return NextResponse.json({ error: 'Only HOC, MD, or Super Admin can perform batch operations' }, { status: 403 });
    }

    const body = await req.json();
    const { action, loanIds, analystId } = body;

    if (!action || !loanIds || !Array.isArray(loanIds) || loanIds.length === 0) {
      return NextResponse.json({ error: 'action and loanIds array are required' }, { status: 400 });
    }

    let updated = 0;

    switch (action) {
      case 'assign_analyst': {
        if (!analystId) return NextResponse.json({ error: 'analystId required for assign_analyst' }, { status: 400 });
        const result = await db.loanApplicants.updateMany({
          where: { id: { in: loanIds } },
          data: { assignedAnalystId: analystId },
        });
        updated = result.count;
        break;
      }
      case 'reject': {
        const result = await db.loanApplicants.updateMany({
          where: { id: { in: loanIds } },
          data: { status: 'declined', currentStep: 'LOAN_CLOSURE' },
        });
        updated = result.count;
        break;
      }
      case 'return_to_lo': {
        const result = await db.loanApplicants.updateMany({
          where: { id: { in: loanIds } },
          data: { status: 'queried', currentStep: 'LO_ENTRY' },
        });
        updated = result.count;
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Audit log
    await db.auditLog.create({
      data: {
        adminId: authPayload.id,
        action: 'updated',
        module: 'loan',
        description: `Batch ${action} on ${updated} loans by ${authPayload.id}`,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        severity: 'warning',
        metadata: JSON.stringify({ action, loanIds, updated }),
      },
    });

    return NextResponse.json({ success: true, action, updated, total: loanIds.length });
  } catch (e: any) {
    console.error('Batch operation error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

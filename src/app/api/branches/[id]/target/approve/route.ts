import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(req, ['super', 'md', 'hoc']);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id: branchId } = await params;
    const body = await req.json().catch(() => ({}));
    const targetIds = Array.isArray(body.targetIds) ? body.targetIds.map(String) : [];
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'targetIds array is required.' }, { status: 400 });
    }

    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
    if (!branch) return NextResponse.json({ error: 'Branch not found.' }, { status: 404 });

    const result = await db.$transaction(async (tx) => {
      const submitted = await tx.branchTarget.findMany({
        where: { id: { in: targetIds }, branchId, status: 'SUBMITTED' },
      });
      if (submitted.length !== targetIds.length) {
        throw new Error('One or more targets are not pending approval for this branch.');
      }

      const approved: any[] = [];
      for (const target of submitted) {
        await tx.branchTarget.updateMany({
          where: {
            branchId,
            metricKey: target.metricKey,
            periodType: target.periodType,
            periodStart: target.periodStart,
            status: 'ACTIVE',
          },
          data: { status: 'SUPERSEDED' },
        });
        const row = await tx.branchTarget.update({
          where: { id: target.id },
          data: {
            status: 'ACTIVE',
            approvedBy: auth.id,
            approvedAt: new Date(),
          },
        });
        approved.push(row);
      }

      await tx.auditLog.create({
        data: {
          adminId: auth.id,
          action: 'branch_target_approved',
          module: 'targets',
          description: `Approved ${approved.length} target(s) for ${branch.name}`,
          severity: 'info',
          metadata: JSON.stringify({ branchId, targetIds }),
        },
      });
      return approved;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    });

    return NextResponse.json({ success: true, targets: result });
  } catch (e: any) {
    console.error('Branch target approval error:', e);
    return NextResponse.json({ error: e.message || 'Target approval failed.' }, { status: 409 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const condition = await db.complianceCondition.findUnique({
      where: { id },
      include: {
        loan: {
          select: {
            id: true,
            applicationRef: true,
            amount: true,
            user: { select: { id: true, firstName: true, lastName: true, business: { select: { name: true } } } },
          },
        },
        setByAdmin: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
        verifiedAdmin: { select: { id: true, firstName: true, lastName: true, username: true } },
        documents: true,
        verifications: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!condition) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ condition });
  } catch (e: any) {
    console.error('Get condition API error:', e);
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
    const action = body.action; // 'verify' | 'reject' | 'waive'
    const notes = body.notes || '';
    const performedBy = body.performedBy || null;
    const performerRole = body.performerRole || null;

    const condition = await db.complianceCondition.findUnique({ where: { id } });
    if (!condition) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const previousStatus = condition.status;
    let newStatus = previousStatus;
    let updateData: any = { verificationNotes: notes };

    if (action === 'verify') {
      newStatus = 'verified';
      updateData.status = 'verified';
      updateData.verifiedBy = performedBy;
      updateData.verifiedAt = new Date();
      updateData.verificationNotes = notes;
    } else if (action === 'reject') {
      newStatus = 'rejected';
      updateData.status = 'rejected';
      updateData.rejectedBy = performedBy;
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = notes;
    } else if (action === 'waive') {
      newStatus = 'waived';
      updateData.status = 'waived';
      updateData.waivedBy = performedBy;
      updateData.waivedAt = new Date();
      updateData.waiverReason = notes;
    } else {
      // Generic update
      const allowed = ['status', 'priority', 'deadline', 'title', 'description', 'instructions'];
      for (const k of allowed) if (k in body) updateData[k] = body[k];
      newStatus = updateData.status || previousStatus;
    }

    const updated = await db.complianceCondition.update({
      where: { id },
      data: updateData,
    });

    // Create verification record
    const verificationAction =
      action === 'verify' ? 'verified' :
      action === 'reject' ? 'rejected' :
      action === 'waive' ? 'waived' : 'review_started';

    await db.complianceVerification.create({
      data: {
        complianceConditionId: id,
        loanApplicantId: condition.loanApplicantId,
        action: verificationAction,
        notes,
        performedBy,
        performerRole,
        previousStatus,
        newStatus,
      },
    });

    // If condition is on a loan, check if all conditions are verified/waived → set loan complianceStatus
    if (action === 'verify' || action === 'waive') {
      const remaining = await db.complianceCondition.count({
        where: {
          loanApplicantId: condition.loanApplicantId,
          status: { notIn: ['verified', 'waived'] },
        },
      });
      if (remaining === 0) {
        await db.loanApplicants.update({
          where: { id: condition.loanApplicantId },
          data: { complianceStatus: 'conditions_met', hasComplianceConditions: true },
        });
      }
    }

    return NextResponse.json({ condition: updated });
  } catch (e: any) {
    console.error('Update condition API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

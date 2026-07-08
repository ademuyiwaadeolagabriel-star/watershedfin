import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/constants';

// POST /api/loans/[id]/snapshot
// Body: { adminId, gate: 'lo'|'bm'|'analyst'|'hoc'|'cro'|'cfo'|'legal'|'md', data: {...}, lock?: boolean }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { adminId, gate, data, lock } = await req.json();

    if (!adminId || !gate || !data) {
      return NextResponse.json({ error: 'adminId, gate, data required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    const appraisal = await db.creditAppraisal.findUnique({
      where: { loanApplicantId: id },
    });
    if (!appraisal) return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });

    // Map gate to column
    const gateToColumn: Record<string, string> = {
      lo: 'loSnapshot',
      bm: 'bmSnapshot',
      analyst: 'analystSnapshot',
      hoc: 'hocSnapshot',
      cro: 'croSnapshot',
      cfo: 'cfoSnapshot',
      legal: 'legalSnapshot',
      md: 'mdSnapshot',
    };
    const column = gateToColumn[gate];
    if (!column) return NextResponse.json({ error: 'Invalid gate' }, { status: 400 });

    // Build new audit thread entry
    const auditEntry = {
      gate,
      author: `${admin.firstName} ${admin.lastName}`,
      role: admin.role,
      timestamp: new Date().toISOString(),
      action: 'snapshot_written',
    };

    // Append to governance_audits
    let governanceAudits: any[] = [];
    if (appraisal.governanceAudits) {
      try { governanceAudits = JSON.parse(appraisal.governanceAudits); } catch { governanceAudits = []; }
    }
    if (!Array.isArray(governanceAudits)) governanceAudits = [];
    governanceAudits.push(auditEntry);

    // Append to comment_trail
    let commentTrail: any[] = [];
    if (appraisal.commentTrail) {
      try { commentTrail = JSON.parse(appraisal.commentTrail); } catch { commentTrail = []; }
    }
    if (!Array.isArray(commentTrail)) commentTrail = [];
    commentTrail.push({
      author: `${admin.firstName} ${admin.lastName}`,
      role: admin.role,
      comment: `Snapshot written: ${gate.toUpperCase()} gate`,
      timestamp: new Date().toISOString(),
    });

    // Update
    const updateData: any = {
      [column]: JSON.stringify(data),
      governanceAudits: JSON.stringify(governanceAudits),
      commentTrail: JSON.stringify(commentTrail),
    };

    if (lock && gate === 'lo') {
      updateData.isSnapshotLocked = true;
      updateData.snapshotCreatedAt = new Date();
      updateData.submittedAt = new Date();
      updateData.status = 'submitted';
    }

    const updated = await db.creditAppraisal.update({
      where: { loanApplicantId: id },
      data: updateData,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'snapshot_written',
        module: 'appraisal',
        description: `Snapshot written for loan ${id} at gate ${gate.toUpperCase()}${lock ? ' (LOCKED)' : ''}`,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        severity: 'info',
        metadata: JSON.stringify({ loanId: id, gate, locked: !!lock }),
      },
    });

    return NextResponse.json({
      success: true,
      gate,
      column,
      locked: !!lock,
      auditEntries: governanceAudits.length,
    });
  } catch (e: any) {
    console.error('Snapshot write error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

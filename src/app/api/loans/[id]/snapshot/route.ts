import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasPermission, ROLE_TO_MCC } from '@/lib/constants';

// ============================================================================
// POST /api/loans/[id]/snapshot
// Authorization: Bearer <admin-jwt>
// Body: { gate: 'lo'|'bm'|'analyst'|'hoc'|'cro'|'cfo'|'legal'|'md', data: {...}, lock?: boolean }
//
// v54 — Blocker 1 + audit #23 fix:
//   - adminId removed from body; derived from JWT.
//   - gate → role enforcement matrix: the caller's JWT role must match the
//     gate they're writing. A LO cannot write the MD snapshot. This closes
//     the "client chooses authority level" bypass.
//   - The route still accepts `data` for backward compat, but the
//     authoritative engine result is recomputed server-side in the
//     appraisals route. The snapshot here is the role's signed-off view
//     of the existing appraisal, not a client-supplied financial payload.
// ============================================================================
const GATE_TO_ROLE: Record<string, string[]> = {
  lo: ['loan', 'super'],
  bm: ['bm', 'super'],
  analyst: ['analyst', 'credit', 'super'],
  hoc: ['hoc', 'super'],
  cro: ['cro', 'super'],
  cfo: ['cfo', 'super'],
  legal: ['legal', 'super'],
  md: ['md', 'super'],
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — auth gate.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'legal', 'analyst', 'cfo']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload = authResult_v51 as { id: string; role: string };

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    // v54 — Blocker 1: adminId from JWT, not body.
    const adminId = authPayload.id;
    const { gate, data, lock } = body || {};

    if (!gate || !data) {
      return NextResponse.json({ error: 'gate, data required' }, { status: 400 });
    }

    // v54 — gate → role enforcement. The caller's JWT role must be allowed
    // for the gate they're writing. Closes the "client chooses authority
    // level" bypass.
    const allowedRoles = GATE_TO_ROLE[gate];
    if (!allowedRoles) {
      return NextResponse.json({ error: `Invalid gate: ${gate}` }, { status: 400 });
    }
    if (!allowedRoles.includes(authPayload.role)) {
      return NextResponse.json(
        {
          error: `Gate '${gate}' requires role ${allowedRoles.join(' or ')}. Your role '${authPayload.role}' is not authorized to write this snapshot.`,
          gate,
          yourRole: authPayload.role,
          requiredRoles: allowedRoles,
        },
        { status: 403 },
      );
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

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

async function genExceptionCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EXC-${year}-`;
  const last = await db.exceptionReport.findFirst({
    where: { exceptionCode: { startsWith: prefix } },
    orderBy: { exceptionCode: 'desc' },
    select: { exceptionCode: true },
  });
  let next = 1;
  if (last?.exceptionCode) {
    const m = last.exceptionCode.match(/(\d+)$/);
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
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const severity = url.searchParams.get('severity');
    const escalated = url.searchParams.get('escalated');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (category && category !== 'all') where.category = category;
    if (severity && severity !== 'all') where.severity = severity;
    if (escalated === 'true') where.isEscalated = true;

    const exceptions = await db.exceptionReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, username: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, username: true } },
      },
    });

    return NextResponse.json({ exceptions });
  } catch (e: any) {
    console.error('List exceptions API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v44: Added auth + role check
  const authPayload = getAuthFromRequest(req);
  if (!authPayload) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  // Any authenticated staff can report an exception, but only IC/CRO/HOC/super can assign
  try {
    const body = await req.json();
    const exceptionCode = await genExceptionCode();

    // v44: If assigning to someone, verify the user has IC/CRO/HOC/super role
    if (body.assignedToId) {
      const allowedAssigners = ['super', 'cro', 'hoc', 'admin'];
      if (!allowedAssigners.includes(authPayload.role) && !(authPayload as any).internalControl) {
        return NextResponse.json(
          { error: 'Only CRO, HOC, Internal Control, or Super Admin can assign exceptions' },
          { status: 403 }
        );
      }
    }

    const exception = await db.exceptionReport.create({
      data: {
        exceptionCode,
        title: body.title,
        description: body.description || null,
        category: body.category || null,
        type: body.type || null,
        severity: body.severity || 'medium',
        priority: body.priority || 'normal',
        status: body.status || 'open',
        isEscalated: body.isEscalated === true,
        reporterId: authPayload.id,  // v44: Use authenticated user, not body
        assignedToId: body.assignedToId || null,
        assignedAt: body.assignedToId ? new Date() : null,
        metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      },
    });

    // v44: Audit log
    await db.auditLog.create({
      data: {
        adminId: authPayload.id,
        action: 'exception_reported',
        module: 'ic',
        description: `Exception ${exceptionCode} reported: ${body.title} (${body.severity || 'medium'})`,
        severity: body.severity === 'critical' ? 'critical' : 'warning',
        metadata: JSON.stringify({ exceptionId: exception.id, exceptionCode }),
      },
    });

    return NextResponse.json({ exception });
  } catch (e: any) {
    console.error('Create exception API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

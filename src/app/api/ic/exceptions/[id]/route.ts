import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exception = await db.exceptionReport.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
      },
    });
    if (!exception) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ exception });
  } catch (e: any) {
    console.error('Get exception API error:', e);
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
    const existing = await db.exceptionReport.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updateData: any = {};
    for (const k of ['title', 'description', 'category', 'type', 'severity', 'priority', 'status', 'isEscalated', 'resolutionType', 'resolutionNotes']) {
      if (k in body) updateData[k] = body[k];
    }

    // Assign
    if (body.assignedToId !== undefined) {
      updateData.assignedToId = body.assignedToId || null;
      updateData.assignedAt = body.assignedToId ? new Date() : null;
      if (body.assignedToId && existing.status === 'open') {
        updateData.status = 'under_review';
      }
    }

    // Resolve
    if (body.action === 'resolve' || body.resolutionType) {
      updateData.status = 'resolved';
      updateData.resolvedById = body.resolvedById || null;
      updateData.resolvedAt = new Date();
      updateData.resolutionType = body.resolutionType || 'other';
      updateData.resolutionNotes = body.resolutionNotes || '';
    }

    const exception = await db.exceptionReport.update({ where: { id }, data: updateData });
    return NextResponse.json({ exception });
  } catch (e: any) {
    console.error('Update exception API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

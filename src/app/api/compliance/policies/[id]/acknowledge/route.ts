import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const adminId = authPayload.id;
    const metadata = body.metadata ? JSON.stringify(body.metadata) : null;

    // Upsert acknowledgment (unique [policyDocumentId, adminId])
    if (!adminId) {
      return NextResponse.json({ error: 'adminId required' }, { status: 400 });
    }

    const existing = await db.policyAcknowledgment.findUnique({
      where: { policyDocumentId_adminId: { policyDocumentId: id, adminId } },
    });
    if (existing) {
      return NextResponse.json({ acknowledgment: existing, alreadyExists: true });
    }

    const acknowledgment = await db.policyAcknowledgment.create({
      data: {
        policyDocumentId: id,
        adminId,
        acknowledgedAt: new Date(),
        metadata,
      },
    });

    return NextResponse.json({ acknowledgment });
  } catch (e: any) {
    console.error('Acknowledge policy API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

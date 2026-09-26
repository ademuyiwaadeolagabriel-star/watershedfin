import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'cfo', 'cs', 'compliance', 'bm', 'lo', 'legal', 'credit', 'analyst', 'treasury', 'ic', 'loan']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;
  const authPayload = authResult_v53 as { id: string; role: string };

  try {
    const url = new URL(req.url);
    // v54-Blocker1: adminId from JWT, not query string.
    const adminId = authPayload.id;
    if (!adminId) {
      return NextResponse.json({ error: 'adminId required' }, { status: 400 });
    }
    const admin = await db.admin.findUnique({
      where: { id: adminId },
      include: { branch: true },
    });
    if (!admin) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { password, ...safe } = admin as any;
    return NextResponse.json({ admin: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

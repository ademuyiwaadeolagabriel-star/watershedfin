import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const adminId = url.searchParams.get('adminId');
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

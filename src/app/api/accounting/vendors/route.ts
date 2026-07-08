import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const vendors = await db.vendor.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { bills: true } } },
    });
    return NextResponse.json({ vendors });
  } catch (e: any) {
    console.error('Vendors GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, address, taxId, bankName, accountNumber, accountName, paymentTerms, payableAccountId, notes } = body;
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const vendor = await db.vendor.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        taxId: taxId || null,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        accountName: accountName || null,
        paymentTerms: Number(paymentTerms) || 30,
        payableAccountId: payableAccountId || null,
        notes: notes || null,
        isActive: true,
      },
    });
    return NextResponse.json({ vendor }, { status: 201 });
  } catch (e: any) {
    console.error('Vendor POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

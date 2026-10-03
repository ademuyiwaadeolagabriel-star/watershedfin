import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker, completeMakerCheckerExecution } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    const invoices = await db.invoice.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: {
        payments: true,
      },
    });
    return NextResponse.json({ invoices });
  } catch (e: any) {
    console.error('Invoices GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  // v53-P4 (audit #43/#44) — maker-checker gate (graceful rollout).
  // Only enforced when the caller passes `?stage=propose|review|authorize|execute`.
  // Without a stage query param the route falls back to its existing behavior.
  const url_v53 = new URL(req.url);
  let mc_v53: any;
  {
    mc_v53 = await requireMakerChecker(req, {
      operation: 'invoice_post',
      stages: ['propose', 'review', 'authorize', 'execute'],
      enforceSegregation: true,
      makerRoles: ['finance', 'accountant', 'cfo'],
      checkerRoles: ['finance', 'accountant', 'cfo'],
      authorizerRoles: ['cfo', 'super'],
      executorRoles: ['finance', 'accountant', 'cfo'],
    });
    if (mc_v53 instanceof NextResponse) return mc_v53;
  }

  try {
    const body = await req.json();
    const { userId, date, dueDate, lineItems, taxRate, notes, revenueAccountId, description } = body;

    if (!dueDate) return NextResponse.json({ error: 'dueDate required' }, { status: 400 });

    const items = Array.isArray(lineItems) ? lineItems : [];
    const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const taxAmount = (subtotal * (Number(taxRate) || 0)) / 100;
    const totalAmount = subtotal + taxAmount;

    const invoiceNumber = await generateInvoiceNumber(date ? new Date(date) : new Date());

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        userId: userId || null,
        date: date ? new Date(date) : new Date(),
        dueDate: new Date(dueDate),
        description: description || (items[0]?.description ? String(items[0].description) : null),
        subtotal,
        taxAmount,
        totalAmount,
        totalPaid: 0,
        notes: notes || (items.length ? JSON.stringify(items) : null),
        status: 'sent',
        revenueAccountId: revenueAccountId || null,
      },
      include: { payments: true },
    });
    if (mc_v53.stage === 'execute' && mc_v53.proposalId) await completeMakerCheckerExecution(mc_v53.proposalId, mc_v53.actorId);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e: any) {
    console.error('Invoice POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
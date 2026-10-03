import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker, completeMakerCheckerExecution } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateBillNumber, postJournal } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    const bills = await db.vendorBill.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: { vendor: true, payments: true, expenseAccount: true },
    });
    return NextResponse.json({ bills });
  } catch (e: any) {
    console.error('Bills GET error:', e);
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
      operation: 'bill_post',
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
    const { vendorId, date, dueDate, subtotal, taxAmount, totalAmount, expenseAccountId, description} = body;

    if (!vendorId || !dueDate) return NextResponse.json({ error: 'vendorId, dueDate required' }, { status: 400 });
    const sub = Number(subtotal) || 0;
    const tax = Number(taxAmount) || 0;
    const total = Number(totalAmount) || sub + tax;

    const billNumber = await generateBillNumber();
    const bill = await db.vendorBill.create({
      data: {
        billNumber,
        vendorId,
        date: date ? new Date(date) : new Date(),
        dueDate: new Date(dueDate),
        subtotal: sub,
        taxAmount: tax,
        totalAmount: total,
        totalPaid: 0,
        expenseAccountId: expenseAccountId || null,
        description: description || null,
        status: 'pending',
        createdById: authResult_v51.id,
      },
      include: { vendor: true },
    });

    // Post journal: Dr Expense / Cr Accounts Payable
    try {
      const apAcc = await db.chartOfAccount.findFirst({
        where: { OR: [{ subType: 'accounts_payable' }, { name: { contains: 'payable', mode: 'insensitive' } }] },
      });
      if (expenseAccountId && apAcc) {
        const je = await postJournal({
          date: bill.date,
          description: `Vendor bill ${billNumber} - ${bill.vendor?.name || ''}`,
          items: [
            { accountId: expenseAccountId, debit: total, credit: 0 },
            { accountId: apAcc.id, debit: 0, credit: total },
          ],
          createdById: authResult_v51.id,
          sourceType: 'vendor_bill',
          sourceId: bill.id,
        });
        await db.vendorBill.update({ where: { id: bill.id }, data: { journalEntryId: je.id } });
      }
    } catch (jeErr) {
      console.error('Bill JE failed (non-fatal):', jeErr);
    }
    if (mc_v53.stage === 'execute' && mc_v53.proposalId) await completeMakerCheckerExecution(mc_v53.proposalId, mc_v53.actorId);
    return NextResponse.json({ bill }, { status: 201 });
  } catch (e: any) {
    console.error('Bill POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker } from '@/lib/auth';
import { db } from '@/lib/db';
import { generatePayslipNumber } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');

    if (mode === 'staff') {
      const salaries = await db.staffSalary.findMany({
        where: { isActive: true },
        include: { staff: { select: { id: true, firstName: true, lastName: true, role: true } } },
        orderBy: { staff: { firstName: 'asc' } },
      });
      return NextResponse.json({ staff: salaries });
    }

    const batches = await db.payrollBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { payslips: true } } },
    });
    return NextResponse.json({ batches });
  } catch (e: any) {
    console.error('Payroll GET error:', e);
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
  if (url_v53.searchParams.get('stage')) {
    const mc_v53 = await requireMakerChecker(req, {
      operation: 'payroll_post',
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
    const { period, paymentDate, staffIds, paymentAccountId, salaryExpenseAccountId, processedById } = body;

    if (!period) return NextResponse.json({ error: 'period required' }, { status: 400 });

    const dup = await db.payrollBatch.findUnique({ where: { period } });
    if (dup) return NextResponse.json({ error: 'Payroll batch already exists for this period' }, { status: 400 });

    const salaries = await db.staffSalary.findMany({
      where: { isActive: true, ...(staffIds?.length ? { staffId: { in: staffIds } } : {}) },
      include: { staff: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (salaries.length === 0) {
      return NextResponse.json({ error: 'No active staff salaries found' }, { status: 400 });
    }

    let grossPay = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let netPay = 0;
    const payslipData: any[] = [];

    for (const s of salaries) {
      const allowances = s.housingAllowance + s.transportAllowance + s.mealAllowance + s.utilityAllowance + s.otherAllowances;
      const gross = Number(s.basicSalary) + allowances;
      const tax = (gross * (s.taxRate || 0)) / 100;
      const pension = ((Number(s.basicSalary) + s.housingAllowance + s.transportAllowance) * (s.pensionRate || 0)) / 100;
      const deductions = tax + pension;
      const net = gross - deductions;
      grossPay += gross;
      totalAllowances += allowances;
      totalDeductions += deductions;
      netPay += net;
      payslipData.push({
        staffId: s.staffId,
        basicSalary: s.basicSalary,
        totalAllowances: allowances,
        totalDeductions: deductions,
        taxDeduction: tax,
        pensionDeduction: pension,
        otherDeductions: 0,
        netPay: net,
        status: 'pending',
      });
    }

    const batch = await db.payrollBatch.create({
      data: {
        period,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        staffCount: salaries.length,
        grossPay,
        totalAllowances,
        totalDeductions,
        netPay,
        status: 'pending',
        paymentAccountId: paymentAccountId || null,
        salaryExpenseAccountId: salaryExpenseAccountId || null,
        processedById: processedById || null,
        payslips: {
          create: payslipData.map((p) => ({
            payslipNumber: '', // temp; update below
            ...p,
          })),
        },
      },
      include: { payslips: true },
    });

    // Assign payslip numbers
    for (const ps of batch.payslips) {
      const num = await generatePayslipNumber(period);
      await db.payslip.update({ where: { id: ps.id }, data: { payslipNumber: num } });
    }

    return NextResponse.json({ batch }, { status: 201 });
  } catch (e: any) {
    console.error('Payroll POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

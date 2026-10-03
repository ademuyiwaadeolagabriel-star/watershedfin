import { NextRequest, NextResponse } from 'next/server';
import {
  requireRole,
  requireMakerChecker,
  completeMakerCheckerExecution,
} from '@/lib/auth';
import { db } from '@/lib/db';
import { generatePayslipNumber } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check.
  const authResult_v51 = await requireRole(req, [
    'super',
    'md',
    'cfo',
    'hoc',
    'cro',
    'finance',
    'accountant',
  ]);

  if (authResult_v51 instanceof NextResponse) {
    return authResult_v51;
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode');

    if (mode === 'staff') {
      const salaries = await db.staffSalary.findMany({
        where: { isActive: true },
        include: {
          staff: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
        orderBy: {
          staff: {
            firstName: 'asc',
          },
        },
      });

      return NextResponse.json({ staff: salaries });
    }

    const batches = await db.payrollBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            payslips: true,
          },
        },
      },
    });

    return NextResponse.json({ batches });
  } catch (e: unknown) {
    console.error('Payroll GET error:', e);

    const message =
      e instanceof Error ? e.message : 'An unexpected error occurred';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check.
  const authResult_v51 = await requireRole(req, [
    'super',
    'md',
    'cfo',
    'hoc',
    'cro',
    'finance',
    'accountant',
  ]);

  if (authResult_v51 instanceof NextResponse) {
    return authResult_v51;
  }

  // v53-P4 (audit #43/#44) — maker-checker gate.
  // Only enforced when the caller passes:
  // ?stage=propose|review|authorize|execute
  //
  // Without a stage query parameter, the route falls back
  // to its existing behavior.
  const url_v53 = new URL(req.url);

  let mc_v53: any;

  {
    mc_v53 = await requireMakerChecker(req, {
      operation: 'payroll_post',
      stages: ['propose', 'review', 'authorize', 'execute'],
      enforceSegregation: true,
      makerRoles: ['finance', 'accountant', 'cfo'],
      checkerRoles: ['finance', 'accountant', 'cfo'],
      authorizerRoles: ['cfo', 'super'],
      executorRoles: ['finance', 'accountant', 'cfo'],
    });

    if (mc_v53 instanceof NextResponse) {
      return mc_v53;
    }
  }

  try {
    const body = await req.json();

    const {
      period,
      paymentDate,
      staffIds,
      paymentAccountId,
      salaryExpenseAccountId,
    } = body;

    if (!period) {
      return NextResponse.json(
        { error: 'period required' },
        { status: 400 }
      );
    }

    const dup = await db.payrollBatch.findUnique({
      where: { period },
    });

    if (dup) {
      return NextResponse.json(
        { error: 'Payroll batch already exists for this period' },
        { status: 400 }
      );
    }

    const salaries = await db.staffSalary.findMany({
      where: {
        isActive: true,
        ...(staffIds?.length
          ? {
              staffId: {
                in: staffIds,
              },
            }
          : {}),
      },
      include: {
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (salaries.length === 0) {
      return NextResponse.json(
        { error: 'No active staff salaries found' },
        { status: 400 }
      );
    }

    let grossPay = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    let netPay = 0;

    const payslipData: any[] = [];

    for (const s of salaries) {
      // Prisma Decimal -> number before JavaScript arithmetic.
      const basicSalary = Number(s.basicSalary ?? 0);

      const housingAllowance = Number(
        s.housingAllowance ?? 0
      );

      const transportAllowance = Number(
        s.transportAllowance ?? 0
      );

      const mealAllowance = Number(
        s.mealAllowance ?? 0
      );

      const utilityAllowance = Number(
        s.utilityAllowance ?? 0
      );

      const otherAllowances = Number(
        s.otherAllowances ?? 0
      );

      const taxRate = Number(s.taxRate ?? 0);
      const pensionRate = Number(s.pensionRate ?? 0);

      const allowances =
        housingAllowance +
        transportAllowance +
        mealAllowance +
        utilityAllowance +
        otherAllowances;

      const gross = basicSalary + allowances;

      const tax = (gross * taxRate) / 100;

      const pension =
        ((basicSalary +
          housingAllowance +
          transportAllowance) *
          pensionRate) /
        100;

      const deductions = tax + pension;

      const net = gross - deductions;

      grossPay += gross;
      totalAllowances += allowances;
      totalDeductions += deductions;
      netPay += net;

      payslipData.push({
        staffId: s.staffId,

        // Prisma Decimal field accepts the original Decimal value.
        basicSalary: s.basicSalary,

        // These calculated monetary values are numbers and are accepted
        // by Prisma Decimal fields.
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
        paymentDate: paymentDate
          ? new Date(paymentDate)
          : new Date(),

        staffCount: salaries.length,

        // Decimal database fields accept these numeric values.
        grossPay,
        totalAllowances,
        totalDeductions,
        netPay,

        status: 'pending',

        paymentAccountId:
          paymentAccountId || null,

        salaryExpenseAccountId:
          salaryExpenseAccountId || null,

        processedById: authResult_v51.id,

        payslips: {
          create: payslipData.map((p) => ({
            payslipNumber: '', // temp; updated below
            ...p,
          })),
        },
      },

      include: {
        payslips: true,
      },
    });

    // Assign payslip numbers.
    for (const ps of batch.payslips) {
      const num = await generatePayslipNumber(period);

      await db.payslip.update({
        where: {
          id: ps.id,
        },
        data: {
          payslipNumber: num,
        },
      });
    }

    // Complete maker-checker execution only at execute stage.
    if (
      mc_v53.stage === 'execute' &&
      mc_v53.proposalId
    ) {
      await completeMakerCheckerExecution(
        mc_v53.proposalId,
        mc_v53.actorId
      );
    }

    return NextResponse.json(
      { batch },
      { status: 201 }
    );
  } catch (e: unknown) {
    console.error('Payroll POST error:', e);

    const message =
      e instanceof Error ? e.message : 'An unexpected error occurred';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
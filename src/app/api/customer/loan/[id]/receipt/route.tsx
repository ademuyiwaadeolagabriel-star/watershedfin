import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { renderToBuffer } from '@react-pdf/renderer';
import { PaymentReceiptPDF } from '@/components/pdf/payment-receipt';

// ============================================================================
// PAYMENT RECEIPT PDF — server-side render & stream
// ============================================================================
// GET /api/customer/loan/[id]/receipt?userId=&paymentId=
//
// Loads the loan + the specific LoanTransaction (repayment) and renders the
// PaymentReceiptPDF on the server using @react-pdf/renderer's renderToBuffer,
// then streams it back as application/pdf (Content-Disposition: inline +
// attachment fallback).
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = authPayload_v51.id; // v53 - derived from JWT
    const paymentId = url.searchParams.get('paymentId');
    const download = url.searchParams.get('download') === '1';

    if (!userId || !paymentId) {
      return NextResponse.json(
        { error: 'userId and paymentId are required' },
        { status: 400 },
      );
    }

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: {
        user: true,
        loanTransactions: {
          where: { type: 'repayment' },
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }
    if (loan.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const payment = loan.loanTransactions.find((t) => t.id === paymentId);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Compute outstanding balance after this payment (sum of all repayments
    // recorded up to and including this one).
    const allRepayments = await db.loanTransaction.findMany({
      where: { loanApplicantId: id, type: 'repayment' },
      orderBy: { transactionDate: 'asc' },
    });
    const totalPaid = allRepayments.reduce((s, t) => s + Number(t.amount), 0);

    // v51 — Decimal arithmetic: wrap each Decimal field with Number()
    // so the resulting values are plain numbers (not number | Decimal).
    const principal =
      Number(loan.finalAmount) ||
      Number(loan.vettedAmount) ||
      Number(loan.approvedAmount) ||
      Number(loan.amount);
    const tenorMonths =
      Number(loan.finalTenure) ||
      Number(loan.vettedDuration) ||
      Number(loan.approvedTenor) ||
      Number(loan.duration);
    const annualRate = Number(loan.finalInterestRate) || Number(loan.percent); // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
    const repaymentMethod =
      (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || loan.disbursementDate || new Date();

    const { calculateLoanSchedule, applyPaymentsToSchedule, computeLoanProgress } =
      await import('@/lib/loan-calc');
    const calc = calculateLoanSchedule(
      principal,
      annualRate,
      tenorMonths,
      repaymentMethod,
      startDate,
      0,
      0,
      0,
    );
    const scheduleWithPayments = applyPaymentsToSchedule(
      calc.schedule,
      totalPaid,
      new Date(),
    );
    const progress = computeLoanProgress(scheduleWithPayments, totalPaid);

    // Parse payment metadata for payment method (if recorded)
    let paymentMethod = 'bank_transfer';
    try {
      if (payment.metadata) {
        const meta = JSON.parse(payment.metadata);
        if (meta.paymentMethod) paymentMethod = String(meta.paymentMethod);
      }
    } catch {
      /* ignore */
    }

    const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();

    const receiptNumber = `RCP-${(loan.applicationRef || id).slice(-6).toUpperCase()}-${payment.id.slice(-6).toUpperCase()}`;
    const outstandingBalance = Math.max(0, progress.outstandingBalance);
    const nextDueDate = progress.nextDue?.dueDate || null;
    const nextDueAmount = progress.nextDue?.installment ?? null;

    const pdfBuffer = await renderToBuffer(
      <PaymentReceiptPDF
        receiptNumber={receiptNumber}
        loanRef={loan.applicationRef || id}
        customerName={customerName}
        accountNumber={loan.user?.accountNumber || ''}
        amount={Number(payment.amount)}
        paymentMethod={paymentMethod}
        paymentDate={payment.transactionDate}
        reference={payment.reference || receiptNumber}
        outstandingBalance={outstandingBalance}
        nextDueDate={nextDueDate}
        nextDueAmount={nextDueAmount}
        generatedAt={new Date()}
      />,
    );

    const filename = `Receipt_${loan.applicationRef || id}_${payment.id.slice(-6)}.pdf`;
    const disposition = download ? 'attachment' : 'inline';

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (e: any) {
    console.error('[receipt API] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

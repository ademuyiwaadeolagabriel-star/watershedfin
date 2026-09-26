import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/customer/loan/[id]/agreement?userId=
// Returns the loan + security agreement data for PDF generation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = authPayload_v51.id; // v53 - derived from JWT

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: {
        user: { include: { business: true } },
        plan: true,
        branch: true,
        loanOfficer: true,
        appraisal: true,
        mccDecisions: { orderBy: { approvalLevel: 'asc' }, include: { approver: true } },
        loanTransactions: { orderBy: { transactionDate: 'desc' } },
      },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (userId && loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Only allow agreement download if loan is disbursed or offer accepted
    const canAccess = loan.status === 'running' || loan.status === 'paid' ||
                      loan.acceptedAt || loan.currentStep === 'CUSTOMER_ACCEPTANCE' ||
                      ['HOC_FINALIZATION', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT', 'TREASURY_PAYOUT', 'INTERNAL_CONTROL_CHECK'].includes(loan.currentStep);

    if (!canAccess) {
      return NextResponse.json({ 
        error: 'Agreement is not yet available. The loan must be approved and offer accepted first.' 
      }, { status: 403 });
    }

    // v51 — Decimal arithmetic: wrap each Decimal field with Number()
    // so the resulting principal is a plain number (not number | Decimal).
    const principal = Number(loan.finalAmount) || Number(loan.vettedAmount) || Number(loan.approvedAmount) || Number(loan.amount);
    const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = Number(loan.finalInterestRate) || Number(loan.percent); // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
    const ccdPercent = Number(loan.finalCcdFeePercent); // v53-P3: removed || 10 fallback
      if (ccdPercent == null || isNaN(Number(ccdPercent))) {
        return NextResponse.json({ error: "Loan is missing finalCcdFeePercent." }, { status: 400 });
      }
    const upfrontFeePercent = Number(loan.finalUpfrontFeePercent); // v53-P3: removed || 1 fallback
      if (upfrontFeePercent == null || isNaN(Number(upfrontFeePercent))) {
        return NextResponse.json({ error: "Loan is missing finalUpfrontFeePercent." }, { status: 400 });
      }
    const repaymentMethod = loan.repaymentPlan || 'REDUCING';

    // Build agreement data matching the DOCX structure
    const safe: any = {
      ...loan,
      user: loan.user ? { ...loan.user, password: undefined } : null,
      loanOfficer: loan.loanOfficer ? { ...loan.loanOfficer, password: undefined } : null,
      mccDecisions: loan.mccDecisions.map((d: any) => ({ ...d, approver: d.approver ? { ...d.approver, password: undefined } : null })),
    };

    return NextResponse.json({
      loan: safe,
      agreement: {
        borrower: {
          name: `${loan.user?.firstName} ${loan.user?.lastName}`,
          tradingAs: loan.user?.business?.name,
          address: loan.user?.address || loan.user?.business?.shopAddress,
          bvn: loan.user?.bvn,
          phone: loan.user?.phone,
        },
        lender: {
          name: 'Watershed Capital',
          address: 'No 8, Jubilee/CMD Road (By Magodo GRA II 2nd gate), opposite secretariat Alausa, Magodo GRA II, Lagos',
          cbnLicense: 'Licensed Loan Company',
        },
        loanTerms: {
          principal,
          tenorMonths,
          annualRate,
          monthlyRate: annualRate / 100 / 12,
          repaymentMethod,
          ccdPercent,
          upfrontFeePercent,
          ccdAmount: principal * (ccdPercent / 100),
          upfrontFeeAmount: principal * (upfrontFeePercent / 100),
          netDisbursement: principal - (principal * (upfrontFeePercent / 100)),
          purpose: loan.reason || 'Business Expansion',
        },
        agreementDate: loan.acceptedAt || loan.disbursedAt || new Date(),
        maturityDate: loan.maturityDate,
        digitalSignature: loan.digitalSignature ? JSON.parse(loan.digitalSignature) : null,
        mccDecisions: loan.mccDecisions,
      },
    });
  } catch (e: any) {
    console.error('Agreement API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

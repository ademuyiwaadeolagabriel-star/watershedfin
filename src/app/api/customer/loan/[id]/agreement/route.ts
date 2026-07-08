import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/customer/loan/[id]/agreement?userId=
// Returns the loan + security agreement data for PDF generation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

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

    const principal = loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
    const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const ccdPercent = loan.finalCcdFeePercent || 10;
    const upfrontFeePercent = loan.finalUpfrontFeePercent || 1;
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

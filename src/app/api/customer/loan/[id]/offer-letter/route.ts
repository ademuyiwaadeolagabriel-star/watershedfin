import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule } from '@/lib/loan-calc';

// GET /api/customer/loan/[id]/offer-letter?userId=
// Returns offer letter data matching the DOCX structure
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
        appraisal: true,
      },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (userId && loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const principal = loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
    const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const ccdPercent = loan.finalCcdFeePercent || 10;
    const upfrontFeePercent = loan.finalUpfrontFeePercent || 1;
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || new Date();

    // Calculate full repayment schedule
    const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, startDate, ccdPercent, upfrontFeePercent, 0);

    // Build offer letter data matching DOCX structure
    const offerLetter = {
      header: {
        title: 'PROVISIONAL OFFER LETTER',
        date: new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }),
        lender: 'Watershed Capital',
        lenderAddress: 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos',
      },
      borrower: {
        name: `${loan.user?.firstName} ${loan.user?.lastName}`,
        tradingAs: loan.user?.business?.name,
        address: loan.user?.address || loan.user?.business?.shopAddress,
      },
      salutation: 'Dear Sir/Madam,',
      intro: 'We are pleased to offer you a loan. Below is the Summary of the Loan Offer',
      summary: {
        'Borrowers Facility': 'Business Loan',
        'Type Facility': 'Business Loan',
        'Loan Amount': `₦${principal.toLocaleString('en-NG')}`,
        'Tenor': `${tenorMonths} Months`,
        'Purpose': loan.reason || 'Business Expansion',
        'Repayment Source': 'Business Proceeds',
        'Repayment Date': 'Every 30 days',
        'First Repayment Date': calc.schedule[0] ? new Date(calc.schedule[0].dueDate).toLocaleDateString('en-NG') : '—',
        'Maturity Date': calc.schedule[calc.schedule.length - 1] ? new Date(calc.schedule[calc.schedule.length - 1].dueDate).toLocaleDateString('en-NG') : '—',
        'Interest rate': `${annualRate}% Reducing Balance Monthly`,
        'Total interest charges': `₦${calc.totalInterest.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`,
        'Total other charges': `₦${(calc.upfrontFeeAmount + calc.ccdAmount).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`,
        'Total cost of credit': `₦${calc.totalCostOfCredit.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`,
        'Repayment amount': `₦${calc.monthlyInstallment.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`,
      },
      repaymentSchedule: calc.schedule.map(row => ({
        sn: row.month,
        date: new Date(row.dueDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }),
        balance: row.openingBalance,
        installment: row.installment,
        interest: row.interest,
        principal: row.principal,
      })),
      generalTerms: [
        '1. Advance and Repayment: Watershed Capital agrees to advance the Loan and the Obligor agrees to take the loan subject to the terms and conditions set out herein.',
        '2. Penalties: Late Payment — If a repayment is more than 2 days later than the due date, you will be charged 0.03% per day on the outstanding sums. Cooling Off Period — You may cancel your loan contract within 3 days after signing.',
        '3. Payments: The Borrower agrees that payments shall be made in accordance with the attached repayment schedule.',
        '4. Repayment: The Borrower shall repay the loan amount in accordance with the terms of the loan agreement.',
        '5. Costs, Expenses and Charges: Processing, Insurance and Commission Fee — 3.2% of the Loan, to be paid upfront. All fees are exclusive of VAT.',
        '6. Duration of Facility: The loan facility shall be for the duration stated in this offer letter.',
        '7. Events of Default: Failure to pay any installment when due; Breach of any terms; Bankruptcy or insolvency; Misrepresentation.',
      ],
      signature: {
        lender: 'For: WATERSHED CAPITAL',
        signatoryName: 'Authorised Signatory',
        date: new Date().toLocaleDateString('en-NG'),
      },
      digitalSignature: loan.digitalSignature ? JSON.parse(loan.digitalSignature) : null,
    };

    return NextResponse.json({ loan: { ...loan, user: { ...loan.user, password: undefined } }, offerLetter });
  } catch (e: any) {
    console.error('Offer letter API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DEFAULT_FAQS = [
  { question: 'How do I apply for a loan?', answer: 'Log in to your customer portal, click "Apply for Loan", select a loan product, enter the amount and tenor, and submit. Your Loan Officer will review and verify your BVN externally.', category: 'Loans' },
  { question: 'What documents do I need?', answer: 'You need: Valid ID (NIN Slip, Drivers License, or Passport), proof of address (utility bill), passport photo, and business documents (CAC certificate if registered).', category: 'KYC' },
  { question: 'How long does approval take?', answer: 'Typically 48 hours from submission to disbursement for qualified applicants. The process includes BVN verification by your Loan Officer, CAC verification by Legal, credit assessment, and MD approval.', category: 'Loans' },
  { question: 'What is the minimum loan amount?', answer: 'The minimum loan amount is ₦20,000 (Emergency Cash product). For SME Working Capital, the minimum is ₦100,000.', category: 'Loans' },
  { question: 'How do I make a payment?', answer: 'Log in to your portal, go to "Make a Payment", enter the amount, select payment method (bank transfer or card), and confirm. You can pay your monthly installment or pay off the loan early.', category: 'Payments' },
  { question: 'Can I pay early?', answer: 'Yes! You can pay early and save on remaining interest. A 2% penalty applies on remaining interest, but you still save significantly. Use the Early Payoff Calculator on the Pay Back page.', category: 'Payments' },
  { question: 'What happens if I am late on payment?', answer: 'A late payment penalty of 0.03% per day is charged on the overdue amount after 2 days grace. SMS and email reminders are sent 3 days before due date, on due date, and after overdue.', category: 'Payments' },
  { question: 'How is my interest calculated?', answer: 'Interest is calculated on reducing balance method (most common) or flat rate, depending on your loan product. The monthly installment is calculated using the PMT formula: (P × r × (1+r)^n) / ((1+r)^n - 1).', category: 'Loans' },
  { question: 'What is CCD?', answer: 'CCD stands for Credit Confirmation Deposit. It is a percentage of your loan amount (typically 5-10%) held as security during the loan tenure and refunded upon full repayment.', category: 'Loans' },
  { question: 'Can I get another loan?', answer: 'If you have paid 55%+ of your existing loan principal, you are eligible for another loan. If you have paid 45-55%, it is at supervisor discretion. Below 45%, you must wait.', category: 'Loans' },
  { question: 'How do I update my KYC?', answer: 'Go to Profile & KYC in your portal. If your KYC was declined, you can resubmit your documents. The compliance team will review within 24 hours.', category: 'KYC' },
  { question: 'What is my credit tier?', answer: 'Your credit tier (Bronze, Silver, Gold, Platinum) is based on loyalty points earned from on-time payments. Higher tiers get interest discounts of up to 1.5%.', category: 'Account' },
  { question: 'How do loyalty points work?', answer: 'You earn 10 points per on-time payment, 5 bonus points for paying 3+ days early, and 50 points when you complete a loan. Points determine your credit tier.', category: 'Account' },
  { question: 'Can I restructure my loan?', answer: 'Yes. Open your active loan, click "Request Restructuring", choose extend tenor or reduce payment, and submit. Your Loan Officer will review and respond.', category: 'Loans' },
  { question: 'How do I contact my Loan Officer?', answer: 'Use the "Chat with Loan Officer" feature in your portal, or find their phone and email on your dashboard under "Your Loan Officer".', category: 'Account' },
];

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');

    let where: any = { status: 'published' };
    if (category && category !== 'all') where.category = category;

    let faqs = await db.faqArticle.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }).catch(() => []);

    if (faqs.length === 0) {
      faqs = DEFAULT_FAQS.map((f, i) => ({ id: `default-${i}`, ...f, sortOrder: i, views: 0, createdAt: new Date(), updatedAt: new Date() })) as any;
    }

    if (search) {
      const q = search.toLowerCase();
      faqs = faqs.filter((f: any) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q));
    }

    return NextResponse.json({ faqs });
  } catch (e: any) {
    return NextResponse.json({ faqs: DEFAULT_FAQS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { adminId, question, answer, category } = await req.json();
    if (!adminId || !question || !answer) return NextResponse.json({ error: 'adminId, question, answer required' }, { status: 400 });
    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const faq = await db.faqArticle.create({ data: { question, answer, category: category || 'General' } });
    return NextResponse.json({ faq });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

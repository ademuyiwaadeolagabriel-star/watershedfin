// ============================================================================
// WATERSHED CAPITAL — Database Seed Script (INFRASTRUCTURE ONLY)
// ----------------------------------------------------------------------------
// Run with:  bun run scripts/seed.ts
//
// Seeds ONLY real infrastructure — NO demo customers, NO demo loans, NO fake data:
//   1.  Settings (1 row)
//   2.  Branches (5)
//   3.  Sectors (10)
//   4.  Admins / Staff (13 — one per role, bcrypt-hashed passwords)
//   5.  Loan Plans / Products (4)
//   6.  Risk Configuration (7 rows)
//   7.  Chart of Accounts (NGN GAAP template, ~29 accounts)
//   8.  Treasury Product (1)
//   9.  Policy Document (1)
//
// NO demo customers, NO demo loans, NO demo MCC decisions, NO fake audit logs.
// ============================================================================

import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import {
  DEFAULT_SECTORS,
  ROLE_PERMISSIONS,
  PERMISSION_FLAGS,
} from '../src/lib/constants';

const tryStep = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
  }
};

async function main() {
  console.log('Seeding infrastructure data (NO demo data)...\n');

  // ── 1. Settings ──
  await tryStep('Settings', async () => {
    await db.settings.upsert({
      where: { id: 1 },
      update: {
        siteName: 'Watershed Capital',
        siteShortName: 'Watershed',
        tagline: 'Banking · Credit · Treasury',
        email: 'info@watershedcapital.com',
        supportEmail: 'support@watershedcapital.com',
        mobile: '+234 803 000 0000',
        address: 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos',
        currency: 'NGN',
        defaultFont: 'Inter',
        brandColor: '#1F7A4A',
        brandColorDark: '#145233',
        brandColorLight: '#f1f8f4',
        accentColor: '#0ea5e9',
        cbnLicense: 'Licensed Lender',
        footerNote: 'Watershed Capital · Licensed Loan Company',
        logoUrl: '/watershed-logo.png',
        logoDarkUrl: '/watershed-logo.png',
        faviconUrl: '/watershed-logo.png',
        registration: true,
        loan: true,
        savings: false,
        mutualFund: false,
        projectInvestment: false,
      },
      create: {
        id: 1,
        siteName: 'Watershed Capital',
        siteShortName: 'Watershed',
        tagline: 'Banking · Credit · Treasury',
        email: 'info@watershedcapital.com',
        supportEmail: 'support@watershedcapital.com',
        mobile: '+234 803 000 0000',
        address: 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos',
        currency: 'NGN',
        defaultFont: 'Inter',
        brandColor: '#1F7A4A',
        brandColorDark: '#145233',
        brandColorLight: '#f1f8f4',
        accentColor: '#0ea5e9',
        cbnLicense: 'Licensed Lender',
        footerNote: 'Watershed Capital · Licensed Loan Company',
        logoUrl: '/watershed-logo.png',
        logoDarkUrl: '/watershed-logo.png',
        faviconUrl: '/watershed-logo.png',
        registration: true,
        loan: true,
        savings: false,
        mutualFund: false,
        projectInvestment: false,
      },
    });
  });

  // ── 2. Branches ──
  await tryStep('Branches', async () => {
    const branches = [
      { name: 'Lagos Main', code: 'LAG-01', state: 'Lagos', address: 'Ikeja, Lagos', phoneContact: '+234 803 000 0001' },
      { name: 'Abuja Central', code: 'ABJ-01', state: 'FCT (Abuja)', address: 'Wuse II, Abuja', phoneContact: '+234 803 000 0002' },
      { name: 'Port Harcourt', code: 'PHC-01', state: 'Rivers', address: 'GRA Phase 2, Port Harcourt', phoneContact: '+234 803 000 0003' },
      { name: 'Kano North', code: 'KAN-01', state: 'Kano', address: 'Sabon Gari, Kano', phoneContact: '+234 803 000 0004' },
      { name: 'Enugu East', code: 'ENU-01', state: 'Enugu', address: 'Independence Layout, Enugu', phoneContact: '+234 803 000 0005' },
    ];
    for (const b of branches) {
      await db.branch.upsert({
        where: { code: b.code },
        update: b,
        create: { ...b, status: 'active' },
      });
    }
  });

  // ── 3. Sectors ──
  await tryStep('Sectors', async () => {
    for (const s of DEFAULT_SECTORS) {
      await db.sector.upsert({
        where: { name: s.name },
        update: { riskScore: s.riskScore, benchmarkedMargin: s.benchmarkedMargin },
        create: { name: s.name, riskScore: s.riskScore, benchmarkedMargin: s.benchmarkedMargin },
      });
    }
  });

  // ── 4. Super Admin ONLY (no demo staff accounts) ──
  // v26: Only the super admin is seeded. All other staff accounts must be
  // created manually by the super admin via the admin panel.
  // The default password is "Watershed@2026" — change it immediately after first login.
  await tryStep('Super Admin (sole seeded account)', async () => {
    const pw = bcrypt.hashSync('Watershed@2026', 10);
    const superPerms: Record<string, boolean> = {};
    for (const p of PERMISSION_FLAGS) {
      superPerms[p] = true; // super gets ALL flags
    }
    await db.admin.upsert({
      where: { username: 'superadmin' },
      update: {
        firstName: 'Super',
        lastName: 'Admin',
        email: 'superadmin@watershedcapital.com',
        password: pw,
        role: 'super',
        roleType: 'super',
        status: 1,
        ...superPerms,
      },
      create: {
        firstName: 'Super',
        lastName: 'Admin',
        username: 'superadmin',
        email: 'superadmin@watershedcapital.com',
        password: pw,
        role: 'super',
        roleType: 'super',
        status: 1,
        mustChangePassword: false,
        ...superPerms,
      },
    });
  });

  // ── 5. Loan Plans / Products ──
  await tryStep('Loan Plans (4 products)', async () => {
    const plans = [
      { name: 'SME Working Capital', slug: 'sme-working-capital', duration: 12, interest: 24, min: 100000, max: 10000000, type: 'loan', description: 'Working capital for SME businesses' },
      { name: 'Asset Finance', slug: 'asset-finance', duration: 24, interest: 22, min: 200000, max: 20000000, type: 'loan', description: 'Finance for vehicles, equipment, machinery' },
      { name: 'LPO Finance', slug: 'lpo-finance', duration: 6, interest: 18, min: 50000, max: 5000000, type: 'loan', description: 'Purchase order finance' },
      { name: 'Emergency Cash', slug: 'emergency-cash', duration: 3, interest: 30, min: 20000, max: 500000, type: 'loan', description: 'Short-term emergency funds' },
    ];
    for (const p of plans) {
      await db.loanPlan.upsert({
        where: { slug: p.slug },
        update: { ...p, status: 1 },
        create: { ...p, status: 1 },
      });
    }
  });

  // ── 6. Risk Configuration ──
  await tryStep('Risk Configuration', async () => {
    const configs = [
      { key: 'dsr_limit_green', label: 'DSR Limit (Pass)', value: '35', type: 'percentage', category: 'financial' },
      { key: 'dsr_limit_amber', label: 'DSR Limit (Review)', value: '45', type: 'percentage', category: 'financial' },
      { key: 'weight_financial', label: 'Financial Score Weight', value: '40', type: 'number', category: 'scoring' },
      { key: 'weight_business', label: 'Business/Industry Score Weight', value: '30', type: 'number', category: 'scoring' },
      { key: 'weight_character', label: 'Character/Soft Score Weight', value: '30', type: 'number', category: 'scoring' },
      { key: 'gearing_limit', label: 'Max Gearing Ratio', value: '100', type: 'percentage', category: 'financial' },
      { key: 'default_margin', label: 'Default Industry Margin', value: '20', type: 'percentage', category: 'financial' },
    ];
    for (const c of configs) {
      await db.riskConfiguration.upsert({
        where: { key: c.key },
        update: c,
        create: { ...c, description: c.label },
      });
    }
  });

  // ── 7. Chart of Accounts ──
  await tryStep('Chart of Accounts (29 accounts)', async () => {
    const accounts = [
      { code: '1000', name: 'Cash on Hand', type: 'asset', subType: 'cash' },
      { code: '1010', name: 'Bank — CBN', type: 'asset', subType: 'bank' },
      { code: '1020', name: 'Bank — Deposit Bank', type: 'asset', subType: 'bank' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'current_asset' },
      { code: '1200', name: 'Loans Receivable', type: 'asset', subType: 'current_asset' },
      { code: '1300', name: 'Inventory', type: 'asset', subType: 'current_asset' },
      { code: '1500', name: 'Fixed Assets', type: 'asset', subType: 'fixed_asset' },
      { code: '1600', name: 'Treasury Investments', type: 'asset', subType: 'current_asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability', subType: 'current_liability' },
      { code: '2100', name: 'Customer Deposits', type: 'liability', subType: 'current_liability' },
      { code: '2200', name: 'Savings Accounts', type: 'liability', subType: 'current_liability' },
      { code: '2300', name: 'Withholding Tax Payable', type: 'liability', subType: 'current_liability' },
      { code: '2400', name: 'Pension Payable', type: 'liability', subType: 'current_liability' },
      { code: '2500', name: 'Tax Payable', type: 'liability', subType: 'current_liability' },
      { code: '2600', name: 'Long-Term Debt', type: 'liability', subType: 'long_term_liability' },
      { code: '3000', name: 'Share Capital', type: 'equity', subType: null },
      { code: '3100', name: 'Retained Earnings', type: 'equity', subType: null },
      { code: '3200', name: 'Capital Reserve', type: 'equity', subType: null },
      { code: '4000', name: 'Interest Income', type: 'revenue', subType: 'operating_revenue' },
      { code: '4100', name: 'Fee Income', type: 'revenue', subType: 'operating_revenue' },
      { code: '4200', name: 'Treasury Income', type: 'revenue', subType: 'operating_revenue' },
      { code: '4300', name: 'Other Income', type: 'revenue', subType: 'other_income' },
      { code: '5000', name: 'Interest Expense', type: 'expense', subType: 'direct_expense' },
      { code: '5100', name: 'Salary Expense', type: 'expense', subType: 'salary_expense' as any },
      { code: '5200', name: 'Rent Expense', type: 'expense', subType: 'overhead_expense' },
      { code: '5300', name: 'Utilities Expense', type: 'expense', subType: 'overhead_expense' },
      { code: '5400', name: 'Admin Expense', type: 'expense', subType: 'overhead_expense' },
      { code: '5500', name: 'Depreciation', type: 'expense', subType: 'overhead_expense' },
      { code: '5600', name: 'Loan Loss Provision', type: 'expense', subType: 'direct_expense' },
    ];
    for (const a of accounts) {
      await db.chartOfAccount.upsert({
        where: { code: a.code },
        update: { name: a.name, type: a.type, subType: a.subType as any, isActive: true },
        create: { ...a, subType: a.subType as any, currency: 'NGN', isActive: true, balance: 0, isSystem: false },
      });
    }
  });

  // ── 8. Treasury Product ──
  await tryStep('Treasury Product', async () => {
    await db.treasuryProduct.deleteMany({ where: { name: 'Diamond Fixed Deposit' } });
    await db.treasuryProduct.create({
      data: {
        name: 'Diamond Fixed Deposit',
        description: 'Fixed deposit investment with competitive returns',
        minAmount: 100000,
        maxAmount: 50000000,
        interestRatePa: 15,
        minTenorDays: 30,
        maxTenorDays: 365,
        whtRate: 10,
        earlyLiquidationPenalty: 20,
        isActive: true,
      },
    });
  });

  // ── 9. Policy Document ──
  await tryStep('Policy Document', async () => {
    await db.policyDocument.deleteMany({ where: { title: 'Anti-Money Laundering Policy' } });
    await db.policyDocument.create({
      data: {
        title: 'Anti-Money Laundering Policy',
        category: 'Compliance',
        version: '1.0',
        effectiveDate: new Date(),
        status: 'active',
        body: 'This policy outlines the AML/CFT requirements for all staff.',
        createdBy: 'system',
      },
    });
  });

  // ── 10. FAQ Knowledge Base ──
  await tryStep('FAQ Articles (15)', async () => {
    const faqs = [
      {
        question: 'How do I apply for a loan?',
        answer:
          'Sign in to your borrower portal, click "Apply for Loan", select a product (SME Working Capital, Asset Finance, LPO Finance, or Emergency Cash), enter the amount and tenor, then submit. Our team reviews each application within 48 hours and you\'ll see live status updates on your dashboard.',
        category: 'General',
      },
      {
        question: 'What documents do I need?',
        answer:
          'For KYC you\'ll need: (1) Valid government-issued ID (NIN, Driver\'s License, International Passport, or Voters Card), (2) Recent passport photograph, (3) Proof of business address (utility bill or CAC certificate), (4) 6 months bank statements, (5) Guarantor form (for loans above ₦500,000). Upload all documents through the KYC tab in your portal.',
        category: 'KYC',
      },
      {
        question: 'How long does approval take?',
        answer:
          'Our standard turnaround time is 48 hours from submission of a complete application with all required documents. Applications are reviewed by your Loan Officer, Branch Manager, Head of Credit, Risk, and MD. You\'ll see real-time progress on the "Decision Timeline" view inside your loan detail page.',
        category: 'Loans',
      },
      {
        question: 'What is the minimum loan amount?',
        answer:
          'The minimum loan amount depends on the product: Emergency Cash starts at ₦20,000, LPO Finance at ₦50,000, SME Working Capital at ₦100,000, and Asset Finance at ₦200,000. The maximum amounts are ₦500,000, ₦5M, ₦10M, and ₦20M respectively.',
        category: 'Loans',
      },
      {
        question: 'How do I make a payment?',
        answer:
          'Open your active loan, click "Make a Payment", enter the amount, and choose bank transfer or card. We support transfers to your dedicated Watershed Capital account, debit card payments, and direct debit. You\'ll receive an instant payment confirmation with a downloadable receipt.',
        category: 'Payments',
      },
      {
        question: 'Can I pay early?',
        answer:
          'Yes! Early payments are rewarded with loyalty points and boost your credit tier. Pay 3+ days before your due date to earn an "Early Bird" bonus. There are no prepayment penalties — you can pay off your entire loan early and save on remaining interest. Use the Early Payoff Calculator on the loan breakdown page.',
        category: 'Payments',
      },
      {
        question: 'What happens if I\'m late?',
        answer:
          'If a payment is late, a 1% late fee applies per week on the overdue installment amount. Your credit standing will be marked as "Overdue" and your on-time payment streak will reset. After 30 days overdue, the loan moves to NPL classification. Please contact your Loan Officer immediately if you anticipate difficulty — we offer restructuring options.',
        category: 'Payments',
      },
      {
        question: 'How is my interest calculated?',
        answer:
          'Interest is calculated on a reducing balance basis (most common) or flat basis depending on your loan product. For reducing balance: Monthly Interest = Outstanding Principal × (Annual Rate / 12). Example: ₦1M at 24% p.a. = ₦20,000 interest in month 1. As principal is repaid, interest decreases. Use our Loan Calculator for a full amortization schedule.',
        category: 'Loans',
      },
      {
        question: 'What is CCD?',
        answer:
          'CCD stands for Credit Confirmation Deposit — a one-time fee (typically 10% of principal) deducted from your loan disbursement to secure the credit line. The CCD is refundable on full repayment. It is part of your "fees & disbursement" breakdown shown on the loan detail page.',
        category: 'Loans',
      },
      {
        question: 'Can I get another loan?',
        answer:
          'Yes — once your current loan is fully repaid (status: Closed/Paid), you can apply for a new loan immediately. Customers with a strong repayment history and higher credit tier (Gold/Platinum) may qualify for pre-approved offers with faster processing and reduced interest rates. Check your "Pre-Qualified Offers" tab.',
        category: 'Loans',
      },
      {
        question: 'How do I update my KYC?',
        answer:
          'Go to "Profile & KYC" in your portal sidebar. You can re-upload documents if your KYC was rejected, update your BVN/NIN, edit your residential address, kin details, and bank account. Changes go through re-verification by our KYC team (typically 24 hours). You\'ll be notified by email and in-app when approved.',
        category: 'KYC',
      },
      {
        question: 'What is my credit tier?',
        answer:
          'Your credit tier (Bronze, Silver, Gold, Platinum) is based on loyalty points earned from on-time payments (+10 pts each), early payments (+5 bonus), and loan completions (+50 pts). Higher tiers unlock interest discounts: Silver 0.5%, Gold 1%, Platinum 1.5%. View your current tier, points, and streak on the dashboard "Loyalty & Rewards" card.',
        category: 'Account',
      },
      {
        question: 'How do loyalty points work?',
        answer:
          'You earn loyalty points for positive financial behavior: +10 per on-time payment, +5 bonus for paying 3+ days early, +50 per loan fully repaid, +25 per successful referral. Points accumulate over your lifetime with Watershed and determine your credit tier. Higher tiers unlock interest discounts, priority support, and pre-qualified offers. Points never expire.',
        category: 'Account',
      },
      {
        question: 'Can I restructure my loan?',
        answer:
          'Yes — if you\'re experiencing cashflow difficulties, you can request a loan restructuring from the loan detail page. Options include: Extend Tenor (lower monthly payment), Reduce Payment (custom plan), or Grace Period (pause payments briefly). Submit your request with a reason and our team reviews within 48 hours. There are no fees for restructuring.',
        category: 'Loans',
      },
      {
        question: 'How do I contact my Loan Officer?',
        answer:
          'Your Loan Officer\'s name, phone, and email appear on your dashboard and loan detail pages. You can: (1) Chat with them in real-time using the "Chat with Loan Officer" feature, (2) Request a callback from the Help Center, (3) Open a support ticket for non-urgent matters, or (4) Call our main line at +234 803 000 0000 (Mon–Fri, 8am–6pm WAT).',
        category: 'Account',
      },
    ];

    for (let i = 0; i < faqs.length; i++) {
      const f = faqs[i];
      const existing = await db.faqArticle.findFirst({ where: { question: f.question } });
      if (existing) {
        await db.faqArticle.update({
          where: { id: existing.id },
          data: { answer: f.answer, category: f.category, sortOrder: i + 1, status: 'published' },
        });
      } else {
        await db.faqArticle.create({
          data: {
            question: f.question,
            answer: f.answer,
            category: f.category,
            sortOrder: i + 1,
            status: 'published',
          },
        });
      }
    }
  });

  // ── CLEAN UP: Delete any demo data that might exist ──
  await tryStep('Cleaning up demo data', async () => {
    await db.mccDecision.deleteMany({});
    await db.approvalLog.deleteMany({});
    await db.loanTransaction.deleteMany({});
    await db.loanRepayment.deleteMany({});
    await db.loanDocument.deleteMany({});
    await db.preDisbursementChecklist.deleteMany({});
    await db.complianceVerification.deleteMany({});
    await db.complianceDocument.deleteMany({});
    await db.complianceCondition.deleteMany({});
    await db.creditAppraisal.deleteMany({});
    await db.loanApplicants.deleteMany({});
    await db.transactions.deleteMany({});
    await db.balance.deleteMany({});
    await db.savings.deleteMany({});
    await db.treasuryInvestment.deleteMany({});
    await db.treasuryTransaction.deleteMany({});
    await db.treasuryDailyAccrual.deleteMany({});
    await db.ticket.deleteMany({});
    await db.auditLog.deleteMany({});
    await db.loginHistory.deleteMany({});
    await db.user.deleteMany({});
    await db.business.deleteMany({});
    console.log('    (All demo customers, loans, transactions, and audit logs deleted)');
  });

  // ── Summary ──
  const branchCount = await db.branch.count();
  const sectorCount = await db.sector.count();
  const staffCount = await db.admin.count();
  const planCount = await db.loanPlan.count();
  const coaCount = await db.chartOfAccount.count();
  const userCount = await db.user.count();
  const loanCount = await db.loanApplicants.count();
  const faqCount = await db.faqArticle.count();

  console.log('\n═══════════════════════════════════════════════');
  console.log('  SEED COMPLETE — Infrastructure Only');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Branches:          ${branchCount}`);
  console.log(`  Sectors:           ${sectorCount}`);
  console.log(`  Staff:             ${staffCount}`);
  console.log(`  Loan Products:     ${planCount}`);
  console.log(`  Chart of Accounts: ${coaCount}`);
  console.log(`  FAQ Articles:      ${faqCount}`);
  console.log(`  Customers:         ${userCount} (0 = clean)`);
  console.log(`  Loans:             ${loanCount} (0 = clean)`);
  console.log('');
  console.log('  ─────────────────────────────────────────────');
  console.log('  SUPER ADMIN LOGIN (sole seeded account):');
  console.log('    Username: superadmin');
  console.log('    Password: Watershed@2026');
  console.log('  ─────────────────────────────────────────────');
  console.log('  ⚠️  Change this password immediately after first login.');
  console.log('  ⚠️  All other staff accounts must be created via admin panel.');
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

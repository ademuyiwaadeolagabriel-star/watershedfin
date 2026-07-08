import { db } from '@/lib/db';

async function check() {
  console.log('=== DATABASE CONTENTS ===');
  const users = await db.user.count();
  const loans = await db.loanApplicants.count();
  const appraisals = await db.creditAppraisal.count();
  const mccDecisions = await db.mccDecision.count();
  const transactions = await db.loanTransaction.count();
  const repayments = await db.loanRepayment.count();
  const auditLogs = await db.auditLog.count();
  const tickets = await db.ticket.count();
  const treasury = await db.treasuryInvestment.count();
  const savings = await db.savings.count();

  console.log(`Users (customers): ${users}`);
  console.log(`Loans: ${loans}`);
  console.log(`Appraisals: ${appraisals}`);
  console.log(`MCC Decisions: ${mccDecisions}`);
  console.log(`Loan Transactions: ${transactions}`);
  console.log(`Loan Repayments: ${repayments}`);
  console.log(`Audit Logs: ${auditLogs}`);
  console.log(`Tickets: ${tickets}`);
  console.log(`Treasury Investments: ${treasury}`);
  console.log(`Savings: ${savings}`);

  if (loans > 0) {
    const sampleLoans = await db.loanApplicants.findMany({ take: 5, select: { applicationRef: true, status: true, amount: true, createdAt: true } });
    console.log('\nSample loans in DB:');
    sampleLoans.forEach(l => console.log(`  ${l.applicationRef} - ${l.status} - ₦${l.amount} - ${l.createdAt}`));
  }

  await db.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });

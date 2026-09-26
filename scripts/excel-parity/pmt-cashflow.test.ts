/**
 * Excel Parity Test Suite — PMT, DSR, Cashflow, Collateral
 * =================================================================
 *
 * v51 — Second Excel-parity regression suite. Exercises:
 *   - PMT calculation (annual rate interpretation, reducing vs flat)
 *   - DSR (Debt Service Ratio)
 *   - 12-month cashflow projection
 *   - Collateral coverage (FSV haircuts)
 *   - Risk grade thresholds
 *
 * Run with:
 *   npx tsx scripts/excel-parity/pmt-cashflow.test.ts
 */

import {
  calculatePMT,
  calculateRatios,
  generateProjections,
  calculateCollateralCoverage,
  calculateRiskGrade,
  executeFullAppraisal,
  type EngineInput,
} from '../../src/lib/credit-engine';

const results: { name: string; pass: boolean; expected: any; actual: any }[] = [];

function expectApprox(name: string, expected: number, actual: number, tolerance = 1e-6): void {
  const pass = Math.abs(expected - actual) <= tolerance;
  results.push({ name, pass, expected, actual });
  console.log(`${pass ? '✓' : '✗'} ${name}: expected ${expected}, got ${actual}`);
}

function expectEqual<T>(name: string, expected: T, actual: T): void {
  const pass = expected === actual;
  results.push({ name, pass, expected, actual });
  console.log(`${pass ? '✓' : '✗'} ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ============================================================================
// TEST 1: PMT — reducing balance, annual rate
// Excel: =PMT(27.5%/12, 12, -100000) = monthly installment
//   r = 0.275 / 12 = 0.022917
//   factor = (1+r)^12 ≈ 1.3125
//   PMT = P * r * factor / (factor - 1) = 100000 * 0.022917 * 1.3125 / 0.3125 ≈ 9626.15
// ============================================================================
(function testPmtReducing() {
  const pmt = calculatePMT(100000, 27.5, 12, 'REDUCING');
  // Expected PMT for 100k @ 27.5%/yr over 12 months = ~9626.15
  expectApprox('test1: PMT reducing balance (100k @ 27.5%/yr, 12mo)', 9626.15, pmt.installment, 1);
  // Monthly rate
  expectApprox('test1: monthlyRate = annualRate / 12 / 100', 27.5 / 12 / 100, pmt.monthlyRate);
  // Total repayment = installment × months
  expectApprox('test1: totalRepayment = installment × months', pmt.installment * 12, pmt.totalRepayment, 1);
  // Total interest = total - principal
  expectApprox('test1: totalInterest = total - principal', pmt.totalRepayment - 100000, pmt.totalInterest, 1);
})();

// ============================================================================
// TEST 2: PMT — flat method
// Excel: installment = principal/n + (principal × monthlyRate)
//   monthlyRate = 0.275/12 = 0.022917
//   monthlyPrincipal = 100000/12 = 8333.33
//   monthlyInterest = 100000 × 0.022917 = 2291.67
//   installment = 8333.33 + 2291.67 = 10625
// ============================================================================
(function testPmtFlat() {
  const pmt = calculatePMT(100000, 27.5, 12, 'FLAT');
  expectApprox('test2: PMT flat (100k @ 27.5%/yr, 12mo)', 10625, pmt.installment, 1);
})();

// ============================================================================
// TEST 3: PMT — zero interest (interest-free loan)
//   installment = principal / months = 100000 / 12 = 8333.33
// ============================================================================
(function testPmtZeroInterest() {
  const pmt = calculatePMT(100000, 0, 12, 'REDUCING');
  expectApprox('test3: PMT zero interest (100k, 12mo)', 8333.333, pmt.installment, 0.01);
})();

// ============================================================================
// TEST 4: DSR (Debt Service Ratio)
// Excel: DSR = installment / netOperatingIncome
//   netOperatingIncome = grossProfit - opex - living - existingDebts
//   installment = 9626.15
//   sales = 200000, cogs = 200000 × (1 - 0.25) = 150000, grossProfit = 50000
//   opex = 20000, living = 5000, existingDebts = 0
//   netCashflowAvailable = 25000
//   DSR = 9626.15 / 25000 = 0.3850
// ============================================================================
(function testDSR() {
  const input: EngineInput = {
    sales: { clientEstimate: 100000, spotCheck: 100000, bankStatement: 100000, bookRecords: 100000 },
    inventory: [
      { description: 'item', qty: 10, cost: 70, sell: 100 },  // 30% margin
    ],
    sectorBenchmarkMargin: 25,
    loan: { principal: 100000, annualInterestRate: 27.5, tenorMonths: 12, repaymentMethod: 'REDUCING', upfrontFeePercent: 0, ccdPercent: 0 },
    expenses: {
      businessRegular: 20000,
      businessIrregular: 0,
      familyRegular: 5000,
      familyIrregular: 0,
      otherLoanInstallments: 0,
    },
    bufferRate: 0,
    openingCash: 10000,
    balanceSheet: {
      cashAtHand: 10000,
      cashInBanks: 0,
      receivables: 0,
      stockValue: 700,
      fixedBusinessAssets: 0,
      fixedFamilyAssets: 0,
      shortTermLiabilities: 0,
      longTermLiabilities: 0,
    },
    riskInputs: {
      sectorRiskScore: 0.5,
      previousDefault: false,
    },
    loanBaseAmount: 100000,
    collaterals: [],
    guarantor: { monthlyIncome: 100000, existingInstallments: 0, monthlyLivingExpenses: 5000 },
    // v51 — stress test parameters (required by runStressTest)
    stress: {
      salesHaircut: 10,        // -10% sales
      marginCompression: 5,   // -5pp margin
      opexIncrease: 10,       // +10% opex
    },
  };

  const input2: EngineInput = {
    ...input,
    sales: { clientEstimate: 200000, spotCheck: 200000, bankStatement: 200000, bookRecords: 200000 },
  };
  const result2 = executeFullAppraisal(input2);
  // marginUsed = lowest of avg(0.30), weighted(0.30), sector(0.25) = 0.25
  // cogs = 200000 × (1 - 0.25) = 150000
  // grossProfit = 50000, opex = 20000, living = 5000, NOI = 25000
  // installment ≈ 9626.15, DSR = 9626.15/25000 ≈ 0.3850
  expectApprox('test4: DSR < 0.45 hard gate (NOI=25k, installment=9626.15)', 0.3850, result2.ratios.dsr, 0.01);
})();

// ============================================================================
// TEST 5: 12-month cashflow projection — solvent path
//   positive monthly surplus → no negative closing balance
// ============================================================================
(function testCashflowProjectionSolvent() {
  const monthlyNet = 10000;  // surplus
  const installment = 5000;
  const opening = 5000;
  const months = 12;
  const proj = generateProjections(opening, monthlyNet, installment, months);
  // Each month: opening + monthlyNet - installment = closing
  // Month 1: 5000 + 10000 - 5000 = 10000
  // Month 2: 10000 + 10000 - 5000 = 15000
  // ... never negative
  expectEqual('test5: 12 months projected', 12, proj.length);
  expectApprox('test5: month 1 opening = 5000', 5000, proj[0].opening);
  expectApprox('test5: month 1 closing = 10000', 10000, proj[0].closing);
  expectApprox('test5: month 12 closing = 65000', 65000, proj[11].closing);
  expectEqual('test5: all months solvent', false, proj.some(r => r.isNegative));
})();

// ============================================================================
// TEST 6: 12-month cashflow projection — insolvent path
//   negative monthly surplus → eventually negative
// ============================================================================
(function testCashflowProjectionInsolvent() {
  const monthlyNet = -3000;  // deficit (more outflow than inflow)
  const installment = 5000;
  const opening = 10000;
  const months = 12;
  const proj = generateProjections(opening, monthlyNet, installment, months);
  // Month 1: 10000 - 3000 - 5000 = 2000
  // Month 2: 2000 - 3000 - 5000 = -6000 (NEGATIVE)
  expectEqual('test6: insolvent path triggers negative balance', true, proj.some(r => r.isNegative));
  expectApprox('test6: month 2 closing is negative', -6000, proj[1].closing, 1);
})();

// ============================================================================
// TEST 7: Collateral coverage — FSV haircuts
//   MOVABLE → 80% of market value
//   IMMOVABLE → 60%
//   CASH → 100%
//   Stock added at 10% of book value
// ============================================================================
(function testCollateralCoverage() {
  const collaterals = [
    { type: 'MOVABLE' as const, marketValue: 100000 },
    { type: 'IMMOVABLE' as const, marketValue: 100000 },
    { type: 'CASH' as const, marketValue: 50000 },
  ];
  // FSV: 100000*0.8 + 100000*0.6 + 50000*1.0 = 80000+60000+50000 = 190000
  // + stock at 10%: 10000*0.1 = 1000 → total 191000
  // Coverage: 191000 / 100000 = 1.91 = 191%
  const result = calculateCollateralCoverage(collaterals, 10000, 100000);
  // The function returns totalFSV = collateral FSV + stockCollateral (191000)
  expectApprox('test7: totalFSV (collateral + stock) = 191000', 191000, result.totalFSV, 1);
  expectApprox('test7: coveragePercent = 191%', 191, result.coveragePercent, 1);
})();

// ============================================================================
// TEST 8: Risk grade — score >= 85 = APPROVE
// ============================================================================
(function testRiskGradeApprove() {
  const grade = calculateRiskGrade(90, true, 0.3);
  expectEqual('test8: high score + solvent + good DSR = APPROVE', 'APPROVE', grade.verdict);
})();

// ============================================================================
// TEST 9: Risk grade — score 60-84 = APPROVE (grade B/C)
// ============================================================================
(function testRiskGradeMediumApprove() {
  // v51 — score 70 (>=60) is APPROVE with grade B. The hard-gate check
  // only triggers on insolvency OR DSR > 1.0. With DSR=0.4 (under the gate)
  // and solvent, score 70 → APPROVE.
  const grade = calculateRiskGrade(70, true, 0.4);
  expectEqual('test9: medium score (solvent, DSR=0.4) = APPROVE', 'APPROVE', grade.verdict);
})();

// ============================================================================
// TEST 10: Risk grade — score < 60 = REJECT
// ============================================================================
(function testRiskGradeReject() {
  const grade = calculateRiskGrade(40, true, 0.5);
  expectEqual('test10: low score = REJECT', 'REJECT', grade.verdict);
})();

// ============================================================================
// TEST 11: Risk grade — insolvent always REJECT regardless of score
// ============================================================================
(function testRiskGradeInsolventAlwaysReject() {
  const grade = calculateRiskGrade(95, false, 0.2);
  expectEqual('test11: insolvent → REJECT even with high score', 'REJECT', grade.verdict);
})();

// ============================================================================
// Summary
// ============================================================================
const pass = results.filter(r => r.pass).length;
const fail = results.filter(r => !r.pass).length;
console.log(`\n${'='.repeat(60)}`);
console.log(`Excel parity (PMT/DSR/cashflow/collateral): ${pass} passed, ${fail} failed (${results.length} total)`);
console.log(`${'='.repeat(60)}`);
if (fail > 0) {
  process.exit(1);
}

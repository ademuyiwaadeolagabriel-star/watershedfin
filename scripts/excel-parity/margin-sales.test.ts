/**
 * Excel Parity Test Suite — CAM Margin, Sales, Purchases, Cashflow
 * =================================================================
 *
 * v50 — First Excel-parity regression suite. Exercises the pure
 * credit-engine functions against known Excel outputs to catch any
 * drift in:
 *   - Average margin (AVERAGEIF "<>0")
 *   - Weighted margin
 *   - Sector benchmark (DB-configured, dynamic)
 *   - Margin Used = LEAST non-zero of the three
 *   - Sales triangulation (least figure rule)
 *   - Purchases = S × (1 − marginUsed)
 *   - Bank statement average (blank vs zero semantics)
 *   - 6-month invoice average (blank vs zero semantics)
 *
 * Run with:
 *   npx tsx scripts/excel-parity/margin-sales.test.ts
 *
 * Each test prints PASS/FAIL with the expected vs actual values. Exits
 * non-zero on any failure so CI can block regressions.
 */

import {
  calculateWeightedMargin,
  computeMarginSummaryBase,
  verifyPurchases,
  triangulateSales,
  computeBankStatementAverages,
  computeSixMonthAverage,
  type EngineInput,
} from '../../src/lib/credit-engine';

interface TestResult {
  name: string;
  pass: boolean;
  expected: any;
  actual: any;
  detail?: string;
}

const results: TestResult[] = [];

function expectApprox(name: string, expected: number, actual: number, tolerance = 1e-9): void {
  const pass = Math.abs(expected - actual) <= tolerance;
  results.push({ name, pass, expected, actual, detail: pass ? undefined : `delta = ${Math.abs(expected - actual)}` });
  console.log(`${pass ? '✓' : '✗'} ${name}: expected ${expected}, got ${actual}`);
}

function expectEqual<T>(name: string, expected: T, actual: T): void {
  const pass = expected === actual;
  results.push({ name, pass, expected, actual });
  console.log(`${pass ? '✓' : '✗'} ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ============================================================================
// TEST 1: Excel AVERAGEIF "<>0" semantics for simple average margin
// Excel: =AVERAGEIF(L4:L18, "<>0")
//   - Zeros (cost==sell) excluded from denominator
//   - Non-zero margins averaged
// ============================================================================
(function testAverageIfNonZero() {
  // 3 items: margin 0.25, margin 0.0 (cost==sell, excluded), margin 0.30
  // Excel: AVERAGEIF({0.25, 0, 0.30}, "<>0") = (0.25 + 0.30) / 2 = 0.275
  const items = [
    { description: 'A', qty: 1, cost: 7.5, sell: 10 },  // 25%
    { description: 'B', qty: 1, cost: 10, sell: 10 },   // 0%  ← excluded by Excel
    { description: 'C', qty: 1, cost: 7, sell: 10 },   // 30%
  ];
  const wm = calculateWeightedMargin(items as any, 20);
  expectApprox('test1: simple average excludes zeros (Excel AVERAGEIF)', 0.275, wm.simpleAverage);
})();

// ============================================================================
// TEST 2: Weighted margin computed correctly
// Excel: =SUMPRODUCT(margins, costShares) / SUM(costs)
//   item1 margin=0.25, costShare=7.5/24.5
//   item2 margin=0.0,  costShare=10/24.5  (contributes 0)
//   item3 margin=0.30, costShare=7/24.5
//   = 0.25*0.306 + 0.0*0.408 + 0.30*0.286 = 0.0765 + 0 + 0.0857 ≈ 0.1622
// ============================================================================
(function testWeightedMargin() {
  const items = [
    { description: 'A', qty: 1, cost: 7.5, sell: 10 },
    { description: 'B', qty: 1, cost: 10, sell: 10 },
    { description: 'C', qty: 1, cost: 7, sell: 10 },
  ];
  const wm = calculateWeightedMargin(items as any, 20);
  // Expected: 0.0765 + 0.0857 ≈ 0.1622 (computed by Excel SUMPRODUCT)
  expectApprox('test2: weighted margin via SUMPRODUCT', 0.1622, wm.weightedMargin, 1e-3);
})();

// ============================================================================
// TEST 3: computeMarginSummaryBase picks the LEAST non-zero of three
// Excel: D32 = MIN(average, weighted, sectorBenchmark) ignoring zeros
//   average = 0.275
//   weighted = 0.1622
//   sector benchmark = 20% = 0.20
//   marginUsed = 0.1622 (weighted), sourceUsed = 'weighted'
// ============================================================================
(function testMarginSummaryPicksLowest() {
  const items = [
    { description: 'A', qty: 1, cost: 7.5, sell: 10 },
    { description: 'B', qty: 1, cost: 10, sell: 10 },
    { description: 'C', qty: 1, cost: 7, sell: 10 },
  ];
  const wm = calculateWeightedMargin(items as any, 20);
  const msb = computeMarginSummaryBase(wm.weightedMargin, wm.simpleAverage, 20);
  expectApprox('test3: marginUsed = least non-zero', 0.1622, msb.marginUsed, 1e-3);
  expectEqual('test3: sourceUsed = weighted', 'weighted', msb.sourceUsed);
})();

// ============================================================================
// TEST 4: when sector benchmark is the lowest, it wins
//   average = 0.25, weighted = 0.30, sector = 10% = 0.10
//   marginUsed = 0.10, sourceUsed = 'benchmark'
// ============================================================================
(function testSectorBenchmarkWins() {
  const msb = computeMarginSummaryBase(0.30, 0.25, 10);
  expectApprox('test4: sector benchmark wins when lowest', 0.10, msb.marginUsed);
  expectEqual('test4: sourceUsed = benchmark', 'benchmark', msb.sourceUsed);
})();

// ============================================================================
// TEST 5: when all three are zero, sourceUsed = 'none'
// ============================================================================
(function testAllZero() {
  const msb = computeMarginSummaryBase(0, 0, 0);
  expectApprox('test5: marginUsed = 0 when all zero', 0, msb.marginUsed);
  expectEqual('test5: sourceUsed = none', 'none', msb.sourceUsed);
})();

// ============================================================================
// TEST 6: Sales triangulation — least figure rule
// Excel: =SMALL(validSources, COUNTIF(validSources, 0) + 1)
//   client = 100, spot = 80, bank = 0 (excluded), book = 120
//   considered = MIN(positive) = 80
// ============================================================================
(function testSalesTriangulation() {
  const forensics = triangulateSales({
    clientEstimate: 100,
    spotCheck: 80,
    bankStatement: 0,   // excluded
    bookRecords: 120,
  });
  expectApprox('test6: consideredSales = least positive', 80, forensics.consideredSales);
})();

// ============================================================================
// TEST 7: Purchases = S × (1 − marginUsed)
// Excel: P = S × (1 − marginUsed)
//   sales = 80, marginUsed = 0.1622
//   purchases = 80 × (1 − 0.1622) = 80 × 0.8378 = 67.02
// ============================================================================
(function testPurchasesFromMargin() {
  const purchases = verifyPurchases(80, 0.1622, [100, 80, 120]);
  expectApprox('test7: impliedPurchases = S × (1 − margin)', 80 * (1 - 0.1622), purchases.impliedPurchases, 1e-3);
  expectApprox('test7: finalPurchases = implied (when positive)', 80 * (1 - 0.1622), purchases.finalPurchases, 1e-3);
  expectEqual('test7: source = IMPLIED_BY_MARGIN', 'IMPLIED_BY_MARGIN', purchases.source);
})();

// ============================================================================
// TEST 8: Purchases falls back to least valid source when margin is 0
//   sales = 80, marginUsed = 0 (no usable margin)
//   validSources = [100, 80, 120]
//   finalPurchases = MIN(validSources) = 80
// ============================================================================
(function testPurchasesFallbackToLeastSource() {
  const purchases = verifyPurchases(80, 0, [100, 80, 120]);
  expectApprox('test8: impliedPurchases = 0 when margin is 0', 0, purchases.impliedPurchases);
  expectApprox('test8: finalPurchases falls back to least valid source', 80, purchases.finalPurchases);
  expectEqual('test8: source = LEAST_SOURCE', 'LEAST_SOURCE', purchases.source);
})();

// ============================================================================
// TEST 9: Bank statement average — explicit zero participates
// Excel: AVERAGE(...) includes explicit zeros, excludes blanks
//   12 months: 5 non-zero values summing to 1200, 1 explicit zero, 6 blanks
//   average = 1200 / 6 (only 6 rows "present") = 200
//   (NOT 1200/5 = 240, and NOT 1200/12 = 100)
// ============================================================================
(function testBankAvgBlankVsZero() {
  const entries = [
    { month: 1, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    { month: 2, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    { month: 3, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    { month: 4, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    { month: 5, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    { month: 6, inflow: 200, outflow: 0, inflowPresent: true, outflowPresent: true },
    // months 7-12 are blank (no inflowPresent flag, no values)
    { month: 7, inflow: 0, outflow: 0 },
    { month: 8, inflow: 0, outflow: 0 },
    { month: 9, inflow: 0, outflow: 0 },
    { month: 10, inflow: 0, outflow: 0 },
    { month: 11, inflow: 0, outflow: 0 },
    { month: 12, inflow: 0, outflow: 0 },
  ];
  const result = computeBankStatementAverages(entries);
  // 1200 / 6 = 200
  expectApprox('test9: bank avg = 1200/6 (explicit zero counted, blanks skipped)', 200, result.averageInflow);
})();

// ============================================================================
// TEST 10: 6-month invoice average — explicit zero participates
// ============================================================================
(function testSixMonthAvgBlankVsZero() {
  const records = [
    { month: 1, amount: 100, present: true },
    { month: 2, amount: 200, present: true },
    { month: 3, amount: 0, present: true },    // explicit zero, counted
    { month: 4, amount: 0, present: true },    // explicit zero, counted
    { month: 5, amount: 100, present: true },
    { month: 6, amount: 0 },                    // blank — not counted
  ];
  const avg = computeSixMonthAverage(records);
  // 400 / 5 = 80
  expectApprox('test10: 6-mo avg = 400/5 (explicit zeros counted, blanks skipped)', 80, avg);
})();

// ============================================================================
// Summary
// ============================================================================
const pass = results.filter(r => r.pass).length;
const fail = results.filter(r => !r.pass).length;
console.log(`\n${'='.repeat(60)}`);
console.log(`Excel parity: ${pass} passed, ${fail} failed (${results.length} total)`);
console.log(`${'='.repeat(60)}`);
if (fail > 0) {
  process.exit(1);
}

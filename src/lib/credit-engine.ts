/**
 * Credit Engine Service
 * =====================
 *
 * A comprehensive, pure-Function credit appraisal engine for a banking platform.
 * Computes all financial ratios for a loan Credit Appraisal Memo (CAM) from a
 * snapshot of loan data and returns computed ratios, risk grade, and verdict.
 *
 * Design constraints:
 *  - TypeScript strict-mode compatible.
 *  - No external libraries beyond standard JS `Math`.
 *  - All formulas computed as raw floats (NO rounding — the UI formats).
 *  - All functions are pure (no side effects, no I/O, no mutation of inputs).
 *  - Edge cases handled: division by zero (returns 0 or sentinel 9.99),
 *    empty arrays, and negative values.
 *
 * Policy version: CBN-CAM-REPLICA-NO-ROUNDING-9.0
 */

// ---------------------------------------------------------------------------
// Public type definitions
// ---------------------------------------------------------------------------

/** Result of triangulating multiple sales sources using the Least Figure Rule. */
export interface SalesForensics {
  sources: { clientEstimate: number; spotCheck: number; bankStatement: number; bookRecords: number };
  validSources: number[];
  consideredSales: number; // min(validSources) — "Least Figure Rule"
  sourceUsed: string;
  variance: number; // |estimate - considered| / estimate  (decimal)
  variancePercent: number;
  status: 'VERIFIED' | 'HIGH_RISK';
}

/** Weighted gross margin computed from inventory line items. */
export interface WeightedMargin {
  totalStockCostValue: number;
  totalStockSellValue: number;
  weightedMargin: number; // decimal (0.25 = 25%)
  simpleAverage: number;
  items: { margin: number; weight: number; weightedContribution: number }[];
}

/** Purchase / COGS derivation from sales and margin. */
export interface PurchaseVerification {
  impliedPurchases: number; // sales × (1 - GWM)
  finalPurchases: number; // impliedPurchases ?: min(validSources)
  derivedCogs: number;
  source: 'IMPLIED_BY_MARGIN' | 'LEAST_SOURCE';
}

/** Loan installment (PMT) computation result. */
export interface PMTResult {
  monthlyRate: number;
  installment: number;
  totalRepayment: number;
  totalInterest: number;
}

/** Full ratio set for the CAM. */
export interface Ratios {
  // Liquidity
  currentRatio: number;
  quickRatio: number;
  // Leverage
  gearingRatio: number; // decimal — HARD GATE 0.35
  debtToAssets: number;
  equityRatio: number; // % — min 20%
  // Coverage
  dsr: number; // decimal — HARD GATE 0.45
  dsrPercent: number; // %
  dscr: number; // x — target 1.25
  // Efficiency (days)
  dio: number; // inventory days
  dso: number; // debtor days
  dpo: number; // creditor days
  cashConversionCycle: number;
  // Profitability
  grossProfitMargin: number;
  netProfitMargin: number;
}

/** A single month row of the 12-month cash projection. */
export interface ProjectionRow {
  month: number;
  opening: number;
  inflow: number;
  loanOutflow: number;
  monthlySurplus: number;
  closing: number;
  isNegative: boolean;
}

/** Stress-test result. */
export interface StressResult {
  originalDSR: number;
  stressedDSR: number;
  stressedNOI: number;
  verdict: 'PASS' | 'FAIL';
  scenario: string;
}

/** Risk grade derived from the computed score plus hard blockers. */
export interface RiskGrade {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  score: number;
  verdict: 'APPROVE' | 'REVIEW' | 'REJECT';
  color: string;
}

/** A single triggered red flag with its severity and score impact. */
export interface RedFlag {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  pointsDeducted: number;
}

/** Collateral coverage summary. */
export interface CollateralCoverage {
  totalFSV: number;
  coveragePercent: number;
  status: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'WEAK';
}

/** Bank yield / profitability analysis. */
export interface BankYield {
  interestIncome: number;
  processingFee: number;
  cashDepositIncome: number;
  totalEarnings: number;
  costOfFund: number;
  adminCost: number;
  netYield: number;
  netYieldPercent: number;
  profitability: 'HIGHLY_PROFITABLE' | 'MARGINAL' | 'LOSS_MAKING';
}

/** Full P&L derived inside the engine. */
export interface PnL {
  sales: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  living: number;
  existingDebts: number;
  netCashflowAvailable: number; // "Repayment Capacity"
  installment: number;
  netProfit: number;
  netProfitMargin: number;
}

// ---------------------------------------------------------------------------
// Extended CAM check interfaces (Excel feature parity)
// ---------------------------------------------------------------------------

/** Result of the zonification (location eligibility) check. */
export interface ZonificationResult {
  location: string;
  rating: 1 | 2 | 3;
  ratingLabel: 'Green' | 'Blue (Free Zone)' | 'Red';
  decision: 'Approve' | 'Discretion' | 'Refer to Nearest Branch';
  description: string;
}

/** Loan cycle grade based on the customer's overdue history. */
export interface LoanCycleGrade {
  grade: 'A' | 'B' | 'C' | 'D' | 'NEW';
  cumulativeOverdueDays: number;
  installmentOverdueCount: number;
  /** 0.50, 0.25, 0, or −1 (decline sentinel for grade D). */
  interestIncrement: number;
  description: string;
}

/** Capitalization / equity-variation cross-check. */
export interface CapitalizationCheck {
  currentEquity: number;
  previousEquity: number;
  equityVariation: number;
  monthlyReinvestmentCapacity: number;
  monthsBetweenAnalyses: number;
  accruedProfit: number;
  status: 'CONSISTENT' | 'VARIATION_DETECTED';
}

/** Treasury vs cash-sales cross-check. */
export interface TreasuryVarianceCheck {
  cashSalesPerDay: number;
  daysBetweenDates: number;
  estimatedTreasury: number;
  treasuryPerBalanceSheet: number;
  variance: number;
  variancePercent: number;
  status: 'CONSISTENT' | 'VARIATION_DETECTED';
}

/** Turnover-to-loan ratio derived from bank-statement inflow analysis. */
export interface TurnoverToLoanRatio {
  annualInflow: number;
  averageMonthlyInflow: number;
  loanPrincipal: number;
  /** Multiple (3.5 = 3.5x = 350%). */
  turnoverRatio: number;
  status: 'ADEQUATE' | 'LOW' | 'HIGH';
}

/** A single bank/lender balance row from the FINANCIAL ANALYSIS sheet. */
export interface BankBalance {
  sn: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: number;
}

// ===========================================================================
// G1: Detailed monthly cashflow row (Excel MONTHLY CASHFLOW TEST sheet)
// 22 line items per month, 12 months
// ===========================================================================

export interface DetailedCashflowRow {
  month: number;
  businessInflow: number;
  marginAmount: number;          // businessInflow × (1 − margin%)
  businessExpenses: number;
  totalExpenses: number;         // marginAmount + businessExpenses
  operationalCashflow: number;   // businessInflow − totalExpenses
  newLoanDisbursement: number;   // only month 1
  clientContribution: number;
  repaymentRunningLoan: number;
  repaymentNewLoan: number;
  repaymentOtherLoans: number;
  totalFinancialInflow: number;
  familyIncome: number;
  familyExpenses: number;
  familyNetIncome: number;
  repaymentFamilyLoan: number;
  totalFamilyInflow: number;
  cashAtEndOfPeriod: number;
  firstLiquidity: number;        // opening balance
  accruedFlow: number;           // cumulative running balance
}

// ===========================================================================
// G2: Simple balance sheet comparison (current vs previous period)
// (Separate from the detailed compareBalanceSheets() which uses BalanceSheetPeriod)
// ===========================================================================

export interface SimpleBalanceSheetComparison {
  currentTotalAssets: number;
  previousTotalAssets: number;
  assetsDifference: number;
  assetsPercentChange: number;
  currentTotalLiabilities: number;
  previousTotalLiabilities: number;
  liabilitiesDifference: number;
  liabilitiesPercentChange: number;
  currentEquity: number;
  previousEquity: number;
  equityDifference: number;
  equityPercentChange: number;
  verdict: 'GROWING' | 'STABLE' | 'DECLINING';
  isConsistent: boolean;
}

// ===========================================================================
// G8: Amortization schedule (for cost-of-fund and convert-to-loan tables)
// ===========================================================================

export interface AmortizationScheduleRow {
  month: number;
  openingBalance: number;
  installment: number;
  interest: number;
  principal: number;
  closingBalance: number;
}

export interface AmortizationSchedule {
  schedule: AmortizationScheduleRow[];
  monthlyInstallment: number;
  totalInterest: number;
  totalPrincipal: number;
  totalPayable: number;
  summary: {
    upfrontFee?: number;        // principal × upfrontFee% (convert-to-loan only)
    ccdAmount?: number;         // principal × CCD% (convert-to-loan only)
    adminCostTotal?: number;    // (principal × adminCost%/12) × tenure (convert-to-loan only)
    costOfFundRate: number;     // 30% for cost-of-fund, or input rate
  };
}

/** Guarantor business verification record. */
export interface GuarantorBusinessVerification {
  guarantorName: string;
  businessName: string;
  businessAddress: string;
  yearsInOperation: number;
  monthlySales: number;
  monthlyExpenses: number;
  netProfit: number;
  stockValue: number;
  isVerified: boolean;
  verificationNotes: string;
}

/** The complete output of a full appraisal run. */
export interface EngineResult {
  policyVersion: string;
  forensics: SalesForensics;
  weightedMargin: WeightedMargin;
  purchases: PurchaseVerification;
  pnl: PnL;
  ratios: Ratios;
  pmt: PMTResult;
  projection: ProjectionRow[];
  isSolvent: boolean;
  stress: StressResult;
  collateralCoverage: CollateralCoverage;
  guarantorDSR: number;
  bankYield: BankYield;
  riskGrade: RiskGrade;
  redFlags: RedFlag[];
  finalScore: number;
  engineVerdict: 'APPROVE' | 'REVIEW' | 'REJECT';
  // Extended CAM checks (populated only when the corresponding input is supplied)
  zonification?: ZonificationResult;
  loanCycleGrade?: LoanCycleGrade;
  capitalization?: CapitalizationCheck;
  treasuryVariance?: TreasuryVarianceCheck;
  debtRotationDays?: number;
  turnoverToLoan?: TurnoverToLoanRatio;
  totalBankBalance?: number;
  bankBalances?: BankBalance[];
  guarantorBusinessVerification?: GuarantorBusinessVerification;
  // G1: Detailed monthly cashflow (22 rows × 12 months) — Excel MONTHLY CASHFLOW TEST
  detailedCashflow?: DetailedCashflowRow[];
  // G2: Balance sheet comparison (current vs previous)
  balanceSheetComparison?: SimpleBalanceSheetComparison;
  // G8: Three amortization schedules (standard, cost-of-fund, convert-to-loan)
  costOfFundSchedule?: AmortizationSchedule;
  convertToLoanSchedule?: AmortizationSchedule;
}

/** All inputs required to run a full appraisal. */
export interface EngineInput {
  // Sales forensics (4 sources)
  sales: {
    clientEstimate: number;
    spotCheck: number;
    bankStatement: number;
    bookRecords: number;
  };
  // Inventory items
  inventory: { description: string; qty: number; cost: number; sell: number }[];
  // Sector benchmark margin (%)
  sectorBenchmarkMargin: number;
  // Loan parameters
  loan: {
    principal: number;
    annualInterestRate: number; // % p.a.
    tenorMonths: number;
    repaymentMethod: 'REDUCING' | 'FLAT';
    ccdPercent: number; // Capital Contribution Deposit %
    upfrontFeePercent: number;
  };
  // Expenses (monthly)
  expenses: {
    businessRegular: number; // gets 20% buffer
    businessIrregular: number;
    familyRegular: number; // gets 20% buffer
    familyIrregular: number;
    otherLoanInstallments: number;
  };
  bufferRate: number; // default 0.20
  // Balance sheet
  balanceSheet: {
    cashAtHand: number;
    cashInBanks: number;
    receivables: number;
    stockValue: number;
    fixedBusinessAssets: number;
    fixedFamilyAssets: number;
    shortTermLiabilities: number;
    longTermLiabilities: number;
    payables: number;
    // --- GAP 6: extended line items (optional for backward compatibility) ---
    wflBalance?: number;           // Balance with WFL (separate from other banks)
    advanceToSuppliers?: number;   // Advance paid to suppliers
    advanceFromCustomers?: number; // Advance received from customers
    wflLoan?: number;              // WFL loan (short-term)
    otherBankLoans?: number;       // Other banks' loans (short-term)
    wflLongTermLoan?: number;      // WFL long-term loan
    otherLongTermLoans?: number;   // Other banks' long-term loans
  };
  // Collateral
  collaterals: {
    type: 'MOVABLE' | 'IMMOVABLE' | 'CASH';
    marketValue: number;
  }[];
  loanBaseAmount: number; // typically = principal
  // Guarantor
  guarantor: {
    income: number;
    cogs: number;
    operationExpenses: number;
    existingInstallment: number;
  };
  // Risk inputs
  riskInputs: {
    sectorRiskScore: number; // 0-1, higher=safer
    previousDefault: boolean;
    successionPlanVerified: boolean;
    bankAccountVerified: boolean;
  };
  // Stress test sliders
  stress: {
    salesHaircut: number; // %
    marginCompression: number; // pp
    opexIncrease: number; // %
  };
  openingCash: number;
  // Extended CAM inputs (optional — Excel feature parity)
  /** Client and branch locations for the zonification check. */
  zonification?: { location: string; branchLocation: string };
  /** Overdue history for the loan-cycle grade. */
  loanCycle?: {
    cumulativeOverdueDays: number;
    installmentOverdueCount: number;
    isNewCustomer: boolean;
  };
  /** Equity snapshots for the capitalization cross-check. */
  capitalization?: {
    currentEquity: number;
    previousEquity: number;
    monthsBetweenAnalyses: number;
  };
  /** Dates for the treasury-variance cross-check. */
  treasuryCheck?: { lastPurchaseDate: Date; evaluationDate: Date };
  /** Bank/Lender balance rows for the FINANCIAL ANALYSIS sheet table. */
  bankBalances?: BankBalance[];
  /** Total annual bank-statement inflow for the turnover-to-loan ratio. */
  annualInflow?: number;
  /** Partial guarantor business information for verification. */
  guarantorBusiness?: Partial<GuarantorBusinessVerification>;
  // G1: Detailed cashflow inputs (Excel MONTHLY CASHFLOW TEST sheet)
  detailedCashflow?: {
    familyIncome: number;
    familyLoanInstallment: number;
    otherLoansInstallment: number;
    existingLoanInstallment: number; // running WFL loan installment
    openingCash: number;
  };
  // G2: Previous period balance sheet (for comparison)
  previousBalanceSheet?: {
    totalAssets: number;
    totalLiabilities: number;
    equity: number;
  };
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Sentinel returned for "infinite" ratios (e.g. negative repayment capacity). */
const SENTINEL_INFINITY = 9.99;

/** Forced Sale Value (FSV) haircuts by collateral type. */
const FSV_HAIRCUTS: Record<'MOVABLE' | 'IMMOVABLE' | 'CASH', number> = {
  MOVABLE: 0.8,
  IMMOVABLE: 0.6,
  CASH: 1.0,
};

/** Stock is accepted as collateral at only 10% of book value. */
const STOCK_COLLATERAL_RATE = 0.1;

/** Default margin fallback when no stock can be valued. */
const DEFAULT_MARGIN_FALLBACK = 0.25;

/** Cost-of-fund rate (annual, as a fraction of principal). */
const COST_OF_FUND_RATE = 0.3;

/** Administrative cost rate (annual, as a fraction of principal). */
const ADMIN_COST_RATE = 0.05;

/** Policy version stamp emitted on every appraisal. */
const POLICY_VERSION = 'CBN-CAM-REPLICA-NO-ROUNDING-9.0';

/** Sentinel interestIncrement value indicating the loan must be declined (grade D). */
const LOAN_CYCLE_DECLINE_SENTINEL = -1;

/** Number of operating days assumed per month (per Excel formula). */
const OPERATING_DAYS_PER_MONTH = 24;

/** Variance threshold (%) above which a treasury variation is flagged. */
const TREASURY_VARIANCE_THRESHOLD_PERCENT = 20;

/** Tolerance (decimal) used by the capitalization cross-check. */
const CAPITALIZATION_TOLERANCE = 0.2;

// ---------------------------------------------------------------------------
// 1. Sales forensics
// ---------------------------------------------------------------------------

/**
 * Triangulate four independent sales sources and apply the "Least Figure Rule".
 *
 * Only sources with a value strictly greater than zero are considered valid.
 * The considered sales figure is the minimum of the valid sources. The variance
 * between the client's estimate and the considered figure determines whether the
 * sales are VERIFIED (variance ≤ 20%) or HIGH_RISK (> 20%).
 *
 * @param sales - The four sales source figures.
 * @returns A {@link SalesForensics} object.
 */
export function triangulateSales(sales: EngineInput['sales']): SalesForensics {
  const sourceEntries: { name: string; value: number }[] = [
    { name: 'clientEstimate', value: sales.clientEstimate },
    { name: 'spotCheck', value: sales.spotCheck },
    { name: 'bankStatement', value: sales.bankStatement },
    { name: 'bookRecords', value: sales.bookRecords },
  ];

  const validEntries = sourceEntries.filter((s) => s.value > 0);
  const validSources = validEntries.map((s) => s.value);

  const consideredSales = validSources.length > 0 ? Math.min(...validSources) : 0;

  const sourceUsedEntry = validEntries.find((s) => s.value === consideredSales);
  const sourceUsed = sourceUsedEntry ? sourceUsedEntry.name : 'NONE';

  const variance =
    sales.clientEstimate > 0
      ? Math.abs(sales.clientEstimate - consideredSales) / sales.clientEstimate
      : 0;
  const variancePercent = variance * 100;

  const status: SalesForensics['status'] = variance > 0.2 ? 'HIGH_RISK' : 'VERIFIED';

  return {
    sources: { ...sales },
    validSources,
    consideredSales,
    sourceUsed,
    variance,
    variancePercent,
    status,
  };
}

// ---------------------------------------------------------------------------
// 2. Weighted gross margin
// ---------------------------------------------------------------------------

/**
 * Calculate the weighted gross margin across all inventory line items.
 *
 * Each item's margin is weighted by its share of total stock cost value. When
 * stock cannot be valued (total cost is zero), the sector benchmark margin
 * (converted from a percentage to a decimal) is used, falling back to 0.25.
 *
 * @param items - Inventory line items with qty, cost and sell price.
 * @param sectorBenchmark - Sector benchmark margin expressed as a percentage.
 * @returns A {@link WeightedMargin} object.
 */
export function calculateWeightedMargin(
  items: EngineInput['inventory'],
  sectorBenchmark: number,
): WeightedMargin {
  const totalStockCostValue = items.reduce((sum, it) => sum + it.qty * it.cost, 0);
  const totalStockSellValue = items.reduce((sum, it) => sum + it.qty * it.sell, 0);

  const lineItems = items.map((it) => {
    const margin = it.sell > 0 ? (it.sell - it.cost) / it.sell : 0;
    const weight = totalStockCostValue > 0 ? (it.qty * it.cost) / totalStockCostValue : 0;
    const weightedContribution = margin * weight;
    return { margin, weight, weightedContribution };
  });

  const totalContribution = lineItems.reduce((sum, li) => sum + li.weightedContribution, 0);

  const weightedMargin =
    totalStockCostValue > 0
      ? totalContribution
      : sectorBenchmark > 0
        ? sectorBenchmark / 100
        : DEFAULT_MARGIN_FALLBACK;

  const simpleAverage = items.length > 0 ? lineItems.reduce((s, li) => s + li.margin, 0) / items.length : 0;

  return {
    totalStockCostValue,
    totalStockSellValue,
    weightedMargin,
    simpleAverage,
    items: lineItems,
  };
}

// ---------------------------------------------------------------------------
// 3. Purchase verification
// ---------------------------------------------------------------------------

/**
 * Derive purchases (COGS) from sales and the weighted margin.
 *
 * Implied purchases = sales × (1 − weightedMargin). If that figure is not
 * positive, the least valid sales source is used instead.
 *
 * @param sales - The considered sales figure.
 * @param gwm - The weighted gross margin (decimal, e.g. 0.25).
 * @param validSources - Array of valid sales source figures.
 * @returns A {@link PurchaseVerification} object.
 */
export function verifyPurchases(
  sales: number,
  gwm: number,
  validSources: number[],
): PurchaseVerification {
  const impliedPurchases = sales * (1 - gwm);

  const leastSource = validSources.length > 0 ? Math.min(...validSources) : 0;

  const useImplied = impliedPurchases > 0;
  const finalPurchases = useImplied ? impliedPurchases : leastSource;
  const derivedCogs = finalPurchases;
  const source: PurchaseVerification['source'] = useImplied ? 'IMPLIED_BY_MARGIN' : 'LEAST_SOURCE';

  return { impliedPurchases, finalPurchases, derivedCogs, source };
}

// ---------------------------------------------------------------------------
// 4. PMT (installment)
// ---------------------------------------------------------------------------

/**
 * Calculate the monthly loan installment.
 *
 * Rate heuristic: values above 20 are treated as an annual percentage (divided
 * by 12 and by 100); values of 20 or below are treated as a monthly percentage
 * (divided by 100 only).
 *
 * For REDUCING balances the standard amortisation formula is used. For FLAT
 * loans the installment is the straight-line principal plus flat interest on
 * the original principal.
 *
 * @param principal - Loan principal amount.
 * @param annualRatePercent - Interest rate (see heuristic above).
 * @param months - Tenor in months.
 * @param method - 'REDUCING' or 'FLAT'.
 * @returns A {@link PMTResult} object.
 */
export function calculatePMT(
  principal: number,
  annualRatePercent: number,
  months: number,
  method: 'REDUCING' | 'FLAT',
): PMTResult {
  const monthlyRate =
    annualRatePercent > 20 ? annualRatePercent / 12 / 100 : annualRatePercent / 100;

  let installment: number;

  if (method === 'FLAT') {
    const monthlyPrincipal = months > 0 ? principal / months : 0;
    const monthlyInterest = principal * monthlyRate;
    installment = monthlyPrincipal + monthlyInterest;
  } else {
    // REDUCING
    if (monthlyRate === 0) {
      installment = months > 0 ? principal / months : 0;
    } else {
      const factor = Math.pow(1 + monthlyRate, months);
      installment = (principal * monthlyRate * factor) / (factor - 1);
    }
  }

  const totalRepayment = installment * months;
  const totalInterest = totalRepayment - principal;

  return { monthlyRate, installment, totalRepayment, totalInterest };
}

// ---------------------------------------------------------------------------
// 5. Ratios
// ---------------------------------------------------------------------------

/**
 * Compute the full ratio set (liquidity, leverage, coverage, efficiency,
 * profitability) from the input, derived P&L and PMT.
 *
 * Sentinel value 9.99 is used where a ratio would be undefined due to negative
 * repayment capacity or negative net worth (insolvency).
 *
 * @param input - The full engine input.
 * @param pnl - The derived P&L.
 * @param pmt - The PMT result.
 * @returns A {@link Ratios} object.
 */
export function calculateRatios(
  input: EngineInput,
  pnl: PnL,
  pmt: PMTResult,
): Ratios {
  const bs = input.balanceSheet;
  const principal = input.loan.principal;

  // --- GAP 6: extended balance-sheet line items (default to 0 for callers
  //     that have not been upgraded to populate the new fields) ---
  const wflBalance = bs.wflBalance ?? 0;
  const advanceToSuppliers = bs.advanceToSuppliers ?? 0;
  const advanceFromCustomers = bs.advanceFromCustomers ?? 0;
  const wflLoan = bs.wflLoan ?? 0;
  const otherBankLoans = bs.otherBankLoans ?? 0;
  const wflLongTermLoan = bs.wflLongTermLoan ?? 0;
  const otherLongTermLoans = bs.otherLongTermLoans ?? 0;

  // --- Liquidity ---
  // Current assets include treasury (cash + WFL balance + other banks),
  // receivables, advances to suppliers and stock.
  const currentAssets =
    bs.cashAtHand + bs.cashInBanks + wflBalance + bs.receivables + advanceToSuppliers + bs.stockValue;
  const liquidAssets = currentAssets - bs.stockValue;
  // Short-term liabilities now incorporate the granular WFL / other-bank /
  // customer-advance exposures in addition to the legacy aggregate.
  const currentLiab = bs.shortTermLiabilities + advanceFromCustomers + wflLoan + otherBankLoans;

  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0;
  const quickRatio = currentLiab > 0 ? liquidAssets / currentLiab : 0;

  // --- Leverage ---
  const totalAssets =
    bs.cashAtHand +
    bs.cashInBanks +
    wflBalance +
    bs.receivables +
    advanceToSuppliers +
    bs.stockValue +
    bs.fixedBusinessAssets +
    bs.fixedFamilyAssets;
  const totalLongTermLiab = bs.longTermLiabilities + wflLongTermLoan + otherLongTermLoans;
  const totalExposure = currentLiab + totalLongTermLiab + principal;
  const netWorth = totalAssets - (currentLiab + totalLongTermLiab);

  let gearingRatio: number;
  if (netWorth > 0) {
    gearingRatio = totalExposure / netWorth;
  } else if (totalAssets <= 0) {
    gearingRatio = 0;
  } else {
    gearingRatio = SENTINEL_INFINITY; // insolvent sentinel
  }

  const debtToAssets = totalAssets > 0 ? (totalExposure / totalAssets) * 100 : 0;
  const equityRatio = totalAssets > 0 ? (netWorth / totalAssets) * 100 : 0;

  // --- Coverage ---
  const dsr =
    pnl.netCashflowAvailable <= 0
      ? SENTINEL_INFINITY
      : pmt.installment / pnl.netCashflowAvailable;
  const dsrPercent = dsr * 100;
  const dscr = pmt.installment > 0 ? pnl.netCashflowAvailable / pmt.installment : 0;

  // --- Efficiency (days) ---
  const dio = pnl.cogs > 0 ? (bs.stockValue / pnl.cogs) * 30 : 0;
  const dso = pnl.sales > 0 ? (bs.receivables / pnl.sales) * 30 : 0;
  const dpo = pnl.cogs > 0 ? (bs.payables / pnl.cogs) * 30 : 0;
  const cashConversionCycle = dio + dso - dpo;

  // --- Profitability ---
  const grossProfitMargin = pnl.sales > 0 ? (pnl.grossProfit / pnl.sales) * 100 : 0;
  const netProfitMargin = pnl.netProfitMargin;

  return {
    currentRatio,
    quickRatio,
    gearingRatio,
    debtToAssets,
    equityRatio,
    dsr,
    dsrPercent,
    dscr,
    dio,
    dso,
    dpo,
    cashConversionCycle,
    grossProfitMargin,
    netProfitMargin,
  };
}

// ---------------------------------------------------------------------------
// 6. Projections (12-month cash flow)
// ---------------------------------------------------------------------------

/**
 * Generate a 12-month cash-flow projection.
 *
 * Each month the opening balance carries forward, the regular monthly surplus
 * is added as inflow, and the loan installment is deducted (only while the
 * tenor has not elapsed). A month is flagged negative if its closing balance
 * falls below zero.
 *
 * @param openingCash - Starting cash balance.
 * @param monthlySurplus - Recurring monthly cash inflow before loan servicing.
 * @param installment - Monthly loan installment.
 * @param tenorMonths - Number of months over which the installment is paid.
 * @returns An array of 12 {@link ProjectionRow} objects.
 */
export function generateProjections(
  openingCash: number,
  monthlySurplus: number,
  installment: number,
  tenorMonths: number,
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let runningBalance = openingCash;

  for (let i = 1; i <= 12; i++) {
    const opening = runningBalance;
    const inflow = monthlySurplus;
    const loanOutflow = i <= tenorMonths ? installment : 0;
    const netMove = inflow - loanOutflow;
    runningBalance += netMove;
    const closing = runningBalance;
    const isNegative = closing < 0;

    rows.push({
      month: i,
      opening,
      inflow,
      loanOutflow,
      monthlySurplus: netMove,
      closing,
      isNegative,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 7. Stress test
// ---------------------------------------------------------------------------

/**
 * Run a stressed-scenario test by applying sales haircut, margin compression
 * and opex increase, then re-deriving DSR.
 *
 * @param input - The full engine input (used to re-derive base components).
 * @param baseDSR - The original (unstressed) DSR (decimal).
 * @param baseNOI - The original (unstressed) net operating income / repayment capacity.
 * @returns A {@link StressResult} object.
 */
export function runStressTest(
  input: EngineInput,
  baseDSR: number,
  baseNOI: number,
): StressResult {
  // Re-derive the base components from input (functions are pure).
  const forensics = triangulateSales(input.sales);
  const sales = forensics.consideredSales;
  const wm = calculateWeightedMargin(input.inventory, input.sectorBenchmarkMargin);
  const purchases = verifyPurchases(sales, wm.weightedMargin, forensics.validSources);
  const cogs = purchases.derivedCogs;
  const grossProfit = sales - cogs;
  const grossProfitMargin = sales > 0 ? (grossProfit / sales) * 100 : 0;

  const opex =
    input.expenses.businessRegular * (1 + input.bufferRate) + input.expenses.businessIrregular;
  const existingDebts = input.expenses.otherLoanInstallments;

  const pmt = calculatePMT(
    input.loan.principal,
    input.loan.annualInterestRate,
    input.loan.tenorMonths,
    input.loan.repaymentMethod,
  );
  const installment = pmt.installment;

  const stressedSales = sales * (1 - input.stress.salesHaircut / 100);
  const stressedGrossProfit =
    stressedSales * (grossProfitMargin / 100 - input.stress.marginCompression / 100);
  const stressedOpex = opex * (1 + input.stress.opexIncrease / 100);
  const stressedNOI = stressedGrossProfit - stressedOpex - existingDebts;

  const stressedDSR = stressedNOI <= 0 ? SENTINEL_INFINITY : installment / stressedNOI;
  const verdict: StressResult['verdict'] = stressedDSR <= 0.45 ? 'PASS' : 'FAIL';

  const scenario =
    `Sales -${input.stress.salesHaircut}%, ` +
    `Margin -${input.stress.marginCompression}pp, ` +
    `Opex +${input.stress.opexIncrease}% (base NOI ${baseNOI})`;

  return {
    originalDSR: baseDSR,
    stressedDSR,
    stressedNOI,
    verdict,
    scenario,
  };
}

// ---------------------------------------------------------------------------
// 8. Collateral coverage
// ---------------------------------------------------------------------------

/**
 * Calculate collateral coverage using Forced Sale Value (FSV) haircuts.
 *
 * MOVABLE → 80%, IMMOVABLE → 60%, CASH → 100% of market value. Stock is added
 * at 10% of book value. Coverage is total FSV over the loan base amount.
 *
 * @param collaterals - Array of collateral items.
 * @param stockValue - Book value of stock.
 * @param loanBase - The loan base amount.
 * @returns A {@link CollateralCoverage} object.
 */
export function calculateCollateralCoverage(
  collaterals: EngineInput['collaterals'],
  stockValue: number,
  loanBase: number,
): CollateralCoverage {
  const collateralFSV = collaterals.reduce((sum, c) => {
    const rate = FSV_HAIRCUTS[c.type] ?? 0;
    return sum + c.marketValue * rate;
  }, 0);

  const stockCollateral = stockValue * STOCK_COLLATERAL_RATE;
  const totalFSV = collateralFSV + stockCollateral;

  const coveragePercent = loanBase > 0 ? (totalFSV / loanBase) * 100 : 0;

  let status: CollateralCoverage['status'];
  if (coveragePercent >= 150) {
    status = 'EXCELLENT';
  } else if (coveragePercent >= 100) {
    status = 'GOOD';
  } else if (coveragePercent >= 75) {
    status = 'MODERATE';
  } else {
    status = 'WEAK';
  }

  return { totalFSV, coveragePercent, status };
}

// ---------------------------------------------------------------------------
// 9. Guarantor DSR
// ---------------------------------------------------------------------------

/**
 * Calculate the guarantor's Debt-Service Ratio after adding the new installment.
 *
 * @param g - The guarantor's financial details.
 * @param newInstallment - The monthly installment of the proposed loan.
 * @returns The guarantor DSR as a percentage (999 if repayment capacity ≤ 0).
 */
export function calculateGuarantorDSR(
  g: EngineInput['guarantor'],
  newInstallment: number,
): number {
  const gGrossProfit = g.income - g.cogs;
  const gNetProfit = gGrossProfit - g.operationExpenses;
  const gRepaymentCapacity = gNetProfit - g.existingInstallment - newInstallment;

  return gRepaymentCapacity > 0 ? (newInstallment / gRepaymentCapacity) * 100 : 999;
}

// ---------------------------------------------------------------------------
// 10. Bank yield
// ---------------------------------------------------------------------------

/**
 * Calculate the bank's yield and profitability on the proposed loan.
 *
 * Interest income is taken from the PMT total interest. Processing fee and
 * cash-deposit (CCD) income are added. Cost of fund and admin cost are
 * deducted. The net yield is annualised and classified.
 *
 * @param input - The full engine input.
 * @param pmt - The PMT result (for total interest and monthly rate).
 * @returns A {@link BankYield} object.
 */
export function calculateBankYield(input: EngineInput, pmt: PMTResult): BankYield {
  const principal = input.loan.principal;
  const tenorMonths = input.loan.tenorMonths;

  const interestIncome = pmt.totalInterest;
  const processingFee = principal * (input.loan.upfrontFeePercent / 100);
  const cashDepositIncome = principal * (input.loan.ccdPercent / 100);

  const totalEarnings = interestIncome + processingFee + cashDepositIncome;

  const costOfFund = principal * COST_OF_FUND_RATE * (tenorMonths / 12);
  const adminCost = principal * ADMIN_COST_RATE * (tenorMonths / 12);

  const netYield = totalEarnings - costOfFund - adminCost;
  const netYieldPercent =
    tenorMonths > 0 && principal > 0 ? (netYield / principal) * (12 / tenorMonths) * 100 : 0;

  let profitability: BankYield['profitability'];
  if (netYieldPercent >= 15) {
    profitability = 'HIGHLY_PROFITABLE';
  } else if (netYieldPercent > 0) {
    profitability = 'MARGINAL';
  } else {
    profitability = 'LOSS_MAKING';
  }

  return {
    interestIncome,
    processingFee,
    cashDepositIncome,
    totalEarnings,
    costOfFund,
    adminCost,
    netYield,
    netYieldPercent,
    profitability,
  };
}

// ---------------------------------------------------------------------------
// 11. Risk grade
// ---------------------------------------------------------------------------

/**
 * Determine the risk grade from a pre-computed score plus hard blockers.
 *
 * Hard blockers (insolvency or DSR > 1.0) force a grade of F / REJECT
 * regardless of the numeric score.
 *
 * @param score - The pre-computed score (already clamped 0–100).
 * @param isSolvent - Whether the 12-month projection never goes negative.
 * @param dsr - The Debt-Service Ratio (decimal).
 * @returns A {@link RiskGrade} object.
 */
export function calculateRiskGrade(
  score: number,
  isSolvent: boolean,
  dsr: number,
): RiskGrade {
  const hardBlocked = !isSolvent || dsr > 1.0;

  let grade: RiskGrade['grade'];
  let label: string;
  let verdict: RiskGrade['verdict'];
  let color: string;

  if (hardBlocked) {
    grade = 'F';
    label = 'Decline';
    verdict = 'REJECT';
    color = '#dc2626';
  } else if (score >= 85) {
    grade = 'A';
    label = 'Excellent';
    verdict = 'APPROVE';
    color = '#16a34a';
  } else if (score >= 70) {
    grade = 'B';
    label = 'Good';
    verdict = 'APPROVE';
    color = '#65a30d';
  } else if (score >= 60) {
    grade = 'C';
    label = 'Fair';
    verdict = 'APPROVE';
    color = '#ca8a04';
  } else if (score >= 50) {
    grade = 'D';
    label = 'Marginal';
    verdict = 'REVIEW';
    color = '#ea580c';
  } else {
    grade = 'F';
    label = 'Decline';
    verdict = 'REJECT';
    color = '#dc2626';
  }

  return { grade, label, score, verdict, color };
}

// ---------------------------------------------------------------------------
// 12. Red flags
// ---------------------------------------------------------------------------

/**
 * Generate the list of triggered red flags.
 *
 * Each flag carries a code, human-readable message, severity and the points
 * deducted from the score. Informational flags (succession / bank verification)
 * carry zero deduction.
 *
 * @param input - The full engine input.
 * @param ratios - The computed ratios.
 * @param forensics - The sales forensics result.
 * @param isSolvent - Whether the projection never goes negative.
 * @returns An array of {@link RedFlag} objects.
 */
export function generateRedFlags(
  input: EngineInput,
  ratios: Ratios,
  forensics: SalesForensics,
  isSolvent: boolean,
): RedFlag[] {
  const flags: RedFlag[] = [];

  if (ratios.dsr > 0.45) {
    flags.push({
      code: 'DSR_EXCEEDS_LIMIT',
      message: `DSR of ${(ratios.dsr * 100).toFixed(2)}% exceeds the 45% policy limit.`,
      severity: 'warning',
      pointsDeducted: 30,
    });
  }

  if (ratios.gearingRatio > 0.35) {
    flags.push({
      code: 'GEARING_HIGH',
      message: `Gearing ratio of ${(ratios.gearingRatio * 100).toFixed(2)}% exceeds the 35% gate.`,
      severity: 'warning',
      pointsDeducted: 15,
    });
  }

  if (!isSolvent) {
    flags.push({
      code: 'INSOLVENT_PROJECTION',
      message: '12-month cash projection goes negative — borrower is insolvent.',
      severity: 'critical',
      pointsDeducted: 50,
    });
  }

  if (ratios.equityRatio < 20) {
    flags.push({
      code: 'EQUITY_LOW',
      message: `Equity ratio of ${ratios.equityRatio.toFixed(2)}% is below the 20% minimum.`,
      severity: 'warning',
      pointsDeducted: 10,
    });
  }

  if (input.riskInputs.previousDefault) {
    flags.push({
      code: 'PREVIOUS_DEFAULT',
      message: 'Borrower has a previous default on record.',
      severity: 'critical',
      pointsDeducted: 40,
    });
  }

  if (forensics.variancePercent > 25) {
    flags.push({
      code: 'SALES_VARIANCE_HIGH',
      message: `Sales variance of ${forensics.variancePercent.toFixed(2)}% exceeds 25%.`,
      severity: 'info',
      pointsDeducted: 10,
    });
  }

  if (!input.riskInputs.successionPlanVerified) {
    flags.push({
      code: 'SUCCESSION_UNVERIFIED',
      message: 'Succession plan has not been verified.',
      severity: 'info',
      pointsDeducted: 0,
    });
  }

  if (!input.riskInputs.bankAccountVerified) {
    flags.push({
      code: 'BANK_UNVERIFIED',
      message: 'Bank account has not been verified.',
      severity: 'info',
      pointsDeducted: 0,
    });
  }

  // L9: Collateral coverage hard gate — CBN requires minimum 100% FSV coverage
  const coverage = calculateCollateralCoverage(input.collaterals, input.balanceSheet.stockValue, input.loanBaseAmount);
  if (coverage.coveragePercent < 100) {
    flags.push({
      code: 'COLLATERAL_INSUFFICIENT',
      message: `Collateral coverage is ${coverage.coveragePercent.toFixed(1)}% — below CBN minimum of 100% FSV coverage. Additional collateral required: ₦${Math.max(0, input.loanBaseAmount - coverage.totalFSV).toLocaleString()}.`,
      severity: 'critical',
      pointsDeducted: 20,
    });
  }

  return flags;
}

// ---------------------------------------------------------------------------
// 14. Zonification check (Excel CLIENT'S INFORMATION sheet, R46-R51)
// ---------------------------------------------------------------------------

/**
 * Map of lower-cased Nigerian state names to their geo-political zone codes.
 * Used to determine whether the client's business location is within the same
 * state, same zone, or a different zone than the lending branch.
 */
const NIGERIAN_STATE_ZONES: Record<string, 'NC' | 'NE' | 'NW' | 'SE' | 'SS' | 'SW'> = {
  // North Central
  benue: 'NC', fct: 'NC', abuja: 'NC', kogi: 'NC', kwara: 'NC',
  nasarawa: 'NC', niger: 'NC', plateau: 'NC',
  // North East
  adamawa: 'NE', bauchi: 'NE', borno: 'NE', gombe: 'NE', taraba: 'NE', yobe: 'NE',
  // North West
  jigawa: 'NW', kaduna: 'NW', kano: 'NW', katsina: 'NW', kebbi: 'NW',
  sokoto: 'NW', zamfara: 'NW',
  // South East
  abia: 'SE', anambra: 'SE', ebonyi: 'SE', enugu: 'SE', imo: 'SE',
  // South South
  'akwa ibom': 'SS', bayelsa: 'SS', 'cross river': 'SS', delta: 'SS',
  edo: 'SS', rivers: 'SS',
  // South West
  ekiti: 'SW', lagos: 'SW', ogun: 'SW', ondo: 'SW', osun: 'SW', oyo: 'SW',
};

/**
 * Normalise a Nigerian state name into a lowercase canonical key.
 * Strips common prefixes like "Federal Capital Territory", parentheticals and
 * the trailing "State" suffix.
 */
function normalizeStateName(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^federal capital territory/, 'fct')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/^fct\s*-\s*/, 'fct')
    .replace(/\s+state$/, '')
    .trim();
}

/**
 * Resolve a Nigerian state name to its geo-political zone code.
 * Returns `null` when the state cannot be recognised.
 */
function resolveStateZone(
  state: string,
): 'NC' | 'NE' | 'NW' | 'SE' | 'SS' | 'SW' | null {
  const key = normalizeStateName(state);
  if (!key) return null;
  return NIGERIAN_STATE_ZONES[key] ?? null;
}

/**
 * Check the zonification of a client's business against the branch catchment.
 *
 * Mirrors the Excel CLIENT'S INFORMATION sheet VLOOKUP that rates the client's
 * business location against the branch's authorised zone:
 *  - Rating 1 (Green):  Location is in the same state as the branch → Approve
 *  - Rating 2 (Blue):   Same geo-political zone, different state     → Discretion
 *  - Rating 3 (Red):    Different geo-political zone                 → Refer
 *
 * State names are matched case-insensitively. Unrecognised states fail safe
 * to rating 3 (Red) so the application is escalated for manual review.
 *
 * @param location        - The client's business location (state name).
 * @param branchLocation  - The lending branch's location (state name).
 * @returns A {@link ZonificationResult}.
 */
export function checkZonification(location: string, branchLocation: string): ZonificationResult {
  const locKey = normalizeStateName(location);
  const branchKey = normalizeStateName(branchLocation);

  // Rating 1 — same state
  if (locKey && branchKey && locKey === branchKey) {
    return {
      location,
      rating: 1,
      ratingLabel: 'Green',
      decision: 'Approve',
      description:
        "My branch can do the business — the client's location matches the branch state.",
    };
  }

  const locZone = resolveStateZone(location);
  const branchZone = resolveStateZone(branchLocation);

  // Rating 2 — same zone, different state
  if (locZone && branchZone && locZone === branchZone) {
    return {
      location,
      rating: 2,
      ratingLabel: 'Blue (Free Zone)',
      decision: 'Discretion',
      description:
        'Supervisor decides based on discretion — same geo-political zone, different state.',
    };
  }

  // Rating 3 — different zone (or unrecognised)
  return {
    location,
    rating: 3,
    ratingLabel: 'Red',
    decision: 'Refer to Nearest Branch',
    description:
      'Business should be referred to nearest branch — different geo-political zone.',
  };
}

// ---------------------------------------------------------------------------
// 15. Loan cycle grading (Excel CLIENT'S INFORMATION sheet, R40-R41)
// ---------------------------------------------------------------------------

/**
 * Grade a customer's loan-cycle history based on cumulative overdue days.
 *
 * Mirrors the Excel CLIENT'S INFORMATION sheet rating table:
 *  - Grade A (or NEW): new customer OR ≤12 cumulative overdue days → +50% rate
 *  - Grade B:          13–20 cumulative overdue days               → +25% rate
 *  - Grade C:          21–30 cumulative overdue days               →  0% rate
 *  - Grade D:          >30 cumulative overdue days                 →  DECLINE
 *
 * `interestIncrement` is the multiplicative premium applied to the base rate
 * (0.50 = +50%, 0.25 = +25%, 0 = no change). For grade D the sentinel value
 * `−1` is returned to signal that the loan must be declined.
 *
 * @param cumulativeOverdueDays    - Total overdue days across the prior cycle.
 * @param installmentOverdueCount  - Number of installments that fell overdue.
 * @param isNewCustomer            - True if the customer has no previous loan.
 * @returns A {@link LoanCycleGrade}.
 */
export function calculateLoanCycleGrade(
  cumulativeOverdueDays: number,
  installmentOverdueCount: number,
  isNewCustomer: boolean,
): LoanCycleGrade {
  const safeDays =
    Number.isFinite(cumulativeOverdueDays) ? Math.max(0, cumulativeOverdueDays) : 0;
  const safeCount =
    Number.isFinite(installmentOverdueCount) ? Math.max(0, Math.floor(installmentOverdueCount)) : 0;

  if (isNewCustomer) {
    return {
      grade: 'NEW',
      cumulativeOverdueDays: safeDays,
      installmentOverdueCount: safeCount,
      interestIncrement: 0.5,
      description:
        'New customer (no previous loan) — eligible for Grade A terms (+50% rate increment).',
    };
  }

  if (safeDays <= 12) {
    return {
      grade: 'A',
      cumulativeOverdueDays: safeDays,
      installmentOverdueCount: safeCount,
      interestIncrement: 0.5,
      description: 'Grade A — ≤12 cumulative overdue days. Apply +50% interest rate increment.',
    };
  }

  if (safeDays <= 20) {
    return {
      grade: 'B',
      cumulativeOverdueDays: safeDays,
      installmentOverdueCount: safeCount,
      interestIncrement: 0.25,
      description: 'Grade B — 13–20 cumulative overdue days. Apply +25% interest rate increment.',
    };
  }

  if (safeDays <= 30) {
    return {
      grade: 'C',
      cumulativeOverdueDays: safeDays,
      installmentOverdueCount: safeCount,
      interestIncrement: 0,
      description: 'Grade C — 21–30 cumulative overdue days. No interest rate increment.',
    };
  }

  return {
    grade: 'D',
    cumulativeOverdueDays: safeDays,
    installmentOverdueCount: safeCount,
    interestIncrement: LOAN_CYCLE_DECLINE_SENTINEL,
    description: 'Grade D — >30 cumulative overdue days. Loan must be DECLINED.',
  };
}

// ---------------------------------------------------------------------------
// 16. Cross-check 3 — Capitalization / equity variation
//     (Excel SALES & PURCHASES CROSS CHECKS sheet, R35-R40)
// ---------------------------------------------------------------------------

/**
 * Cross-check that the variation in owner's equity is explained by the
 * accrued reinvestment capacity over the analysis period.
 *
 * Mirrors the Excel SALES & PURCHASES CROSS CHECKS sheet:
 *  - equityVariation       = currentEquity − previousEquity
 *  - accruedProfit         = monthlyReinvestmentCapacity × monthsBetweenAnalyses
 *  - status                = VARIATION_DETECTED when |equityVariation − accruedProfit|
 *                            exceeds 20% of |accruedProfit|, else CONSISTENT
 *
 * Edge cases: a non-positive accrued profit (zero capacity or zero months)
 * collapses to a CONSISTENT result because no meaningful comparison is
 * possible.
 *
 * @param currentEquity               - Equity at the current analysis date.
 * @param previousEquity              - Equity at the previous analysis date.
 * @param monthlyReinvestmentCapacity - Repayment capacity − proposed installment.
 * @param monthsBetweenAnalyses       - Number of months between the two analyses.
 * @returns A {@link CapitalizationCheck}.
 */
export function checkCapitalization(
  currentEquity: number,
  previousEquity: number,
  monthlyReinvestmentCapacity: number,
  monthsBetweenAnalyses: number,
): CapitalizationCheck {
  const safeCurrent = Number.isFinite(currentEquity) ? currentEquity : 0;
  const safePrevious = Number.isFinite(previousEquity) ? previousEquity : 0;
  const safeMonths =
    Number.isFinite(monthsBetweenAnalyses) ? Math.max(0, monthsBetweenAnalyses) : 0;
  const safeCapacity =
    Number.isFinite(monthlyReinvestmentCapacity) ? monthlyReinvestmentCapacity : 0;

  const equityVariation = safeCurrent - safePrevious;
  const accruedProfit = safeCapacity * safeMonths;

  let status: CapitalizationCheck['status'] = 'CONSISTENT';
  if (accruedProfit !== 0) {
    const deviation = Math.abs(equityVariation - accruedProfit);
    const tolerance = Math.abs(accruedProfit) * CAPITALIZATION_TOLERANCE;
    if (deviation > tolerance) {
      status = 'VARIATION_DETECTED';
    }
  }

  return {
    currentEquity: safeCurrent,
    previousEquity: safePrevious,
    equityVariation,
    monthlyReinvestmentCapacity: safeCapacity,
    monthsBetweenAnalyses: safeMonths,
    accruedProfit,
    status,
  };
}

// ---------------------------------------------------------------------------
// 17. Cross-check 4 — Treasury vs cash-sales
//     (Excel SALES & PURCHASES CROSS CHECKS sheet, R43-R53)
// ---------------------------------------------------------------------------

/**
 * Cross-check that the treasury position implied by daily cash sales
 * reconciles with the cash position reported on the balance sheet.
 *
 * Mirrors the Excel SALES & PURCHASES CROSS CHECKS sheet:
 *  - cashSalesPerDay          = monthlySales / 24
 *  - estimatedTreasury        = cashSalesPerDay × (evaluationDate − lastPurchaseDate)
 *  - treasuryPerBalanceSheet  = cashAtHand + cashInBanks
 *  - variancePercent          = |estimated − actual| / max(estimated, actual) × 100
 *  - status                   = VARIATION_DETECTED when variancePercent > 20%
 *
 * Edge cases: a negative or zero day count collapses to a CONSISTENT result;
 * a zero denominator yields a 0% variance (also CONSISTENT).
 *
 * @param monthlySales      - Monthly sales figure (₦).
 * @param lastPurchaseDate  - Date of the most recent stock purchase.
 * @param evaluationDate    - Date of the appraisal evaluation.
 * @param cashAtHand        - Cash at hand per balance sheet (₦).
 * @param cashInBanks       - Cash at bank per balance sheet (₦).
 * @returns A {@link TreasuryVarianceCheck}.
 */
export function checkTreasuryVariance(
  monthlySales: number,
  lastPurchaseDate: Date,
  evaluationDate: Date,
  cashAtHand: number,
  cashInBanks: number,
): TreasuryVarianceCheck {
  const safeSales = Number.isFinite(monthlySales) ? Math.max(0, monthlySales) : 0;
  const cashSalesPerDay = safeSales / OPERATING_DAYS_PER_MONTH;

  const msPerDay = 1000 * 60 * 60 * 24;
  const rawDays = Math.floor(
    (evaluationDate.getTime() - lastPurchaseDate.getTime()) / msPerDay,
  );
  const daysBetweenDates = Number.isFinite(rawDays) ? Math.max(0, rawDays) : 0;

  const estimatedTreasury = cashSalesPerDay * daysBetweenDates;
  const treasuryPerBalanceSheet =
    (Number.isFinite(cashAtHand) ? cashAtHand : 0) +
    (Number.isFinite(cashInBanks) ? cashInBanks : 0);

  const variance = Math.abs(estimatedTreasury - treasuryPerBalanceSheet);
  const denominator = Math.max(estimatedTreasury, treasuryPerBalanceSheet);
  const variancePercent = denominator > 0 ? (variance / denominator) * 100 : 0;

  const status: TreasuryVarianceCheck['status'] =
    variancePercent > TREASURY_VARIANCE_THRESHOLD_PERCENT ? 'VARIATION_DETECTED' : 'CONSISTENT';

  return {
    cashSalesPerDay,
    daysBetweenDates,
    estimatedTreasury,
    treasuryPerBalanceSheet,
    variance,
    variancePercent,
    status,
  };
}

// ---------------------------------------------------------------------------
// 18. Debt rotation (Excel SALES & PURCHASES CROSS CHECKS sheet, R55-R60)
// ---------------------------------------------------------------------------

/**
 * Calculate the debt rotation period — the number of operating days required
 * to extinguish the current short-term debt position out of purchases.
 *
 * Mirrors the Excel SALES & PURCHASES CROSS CHECKS sheet:
 *   debtRotation (days) = totalShortTermLiabilities / (monthlyPurchases / 24)
 *
 * Returns 0 when monthly purchases is non-positive (no division by zero).
 *
 * @param totalShortTermLiabilities - Total short-term liabilities (₦).
 * @param monthlyPurchases          - Monthly purchases figure (₦).
 * @returns The debt rotation period in operating days.
 */
export function calculateDebtRotation(
  totalShortTermLiabilities: number,
  monthlyPurchases: number,
): number {
  const safeLiabilities =
    Number.isFinite(totalShortTermLiabilities) ? Math.max(0, totalShortTermLiabilities) : 0;
  const safePurchases =
    Number.isFinite(monthlyPurchases) ? Math.max(0, monthlyPurchases) : 0;
  if (safePurchases <= 0) return 0;
  const dailyPurchases = safePurchases / OPERATING_DAYS_PER_MONTH;
  if (dailyPurchases <= 0) return 0;
  return safeLiabilities / dailyPurchases;
}

// ---------------------------------------------------------------------------
// 19. Turnover-to-loan ratio (Excel FINANCIAL ANALYSIS sheet, R223-R229)
// ---------------------------------------------------------------------------

/**
 * Calculate the turnover-to-loan ratio from annualised bank-statement inflows.
 *
 * Mirrors the Excel FINANCIAL ANALYSIS sheet:
 *  - averageMonthlyInflow = annualInflow / 12
 *  - turnoverRatio        = averageMonthlyInflow / loanPrincipal  (a multiple)
 *  - status               = ADEQUATE (>3x), LOW (1–3x), HIGH (<1x)
 *
 * Edge cases: a non-positive loan principal returns a ratio of 0 and the
 * HIGH-risk status.
 *
 * @param annualInflow   - Total inflows over the past 12 months (₦).
 * @param loanPrincipal  - Requested loan principal (₦).
 * @returns A {@link TurnoverToLoanRatio}.
 */
export function calculateTurnoverToLoan(
  annualInflow: number,
  loanPrincipal: number,
): TurnoverToLoanRatio {
  const safeInflow = Number.isFinite(annualInflow) ? Math.max(0, annualInflow) : 0;
  const safePrincipal = Number.isFinite(loanPrincipal) ? Math.max(0, loanPrincipal) : 0;

  const averageMonthlyInflow = safeInflow / 12;
  const turnoverRatio = safePrincipal > 0 ? averageMonthlyInflow / safePrincipal : 0;

  let status: TurnoverToLoanRatio['status'];
  if (turnoverRatio > 3) {
    status = 'ADEQUATE';
  } else if (turnoverRatio >= 1) {
    status = 'LOW';
  } else {
    status = 'HIGH';
  }

  return {
    annualInflow: safeInflow,
    averageMonthlyInflow,
    loanPrincipal: safePrincipal,
    turnoverRatio,
    status,
  };
}

// ---------------------------------------------------------------------------
// 20. Bank / MFB balances (Excel FINANCIAL ANALYSIS sheet, R35-R42)
// ---------------------------------------------------------------------------

/**
 * Sum the balances of a list of bank/lender accounts.
 *
 * Mirrors the Excel FINANCIAL ANALYSIS sheet bank-balances table total row.
 * Returns 0 for an empty array. Non-numeric balances are coerced to 0.
 *
 * @param balances - Array of bank balance records.
 * @returns The total balance across all listed accounts.
 */
export function calculateTotalBankBalance(balances: BankBalance[]): number {
  if (!Array.isArray(balances) || balances.length === 0) return 0;
  return balances.reduce((sum, b) => {
    const value = b && Number.isFinite(b.balance) ? b.balance : 0;
    return sum + value;
  }, 0);
}

// ---------------------------------------------------------------------------
// 21. Guarantor business verification (Excel GUARANTORS' BIZ VERIFICATION)
// ---------------------------------------------------------------------------

/**
 * Verify a guarantor's business from the supplied partial information.
 *
 * Mirrors the Excel GUARANTORS' BIZ VERIFICATION sheet, which captures the
 * guarantor's business name, address, years in operation, monthly sales and
 * expenses, and stock value, then derives the net profit and a verification
 * flag.
 *
 * Verification rules:
 *  - businessName and businessAddress must be non-empty
 *  - yearsInOperation must be > 0
 *  - monthlySales must be > 0
 *  - netProfit (monthlySales − monthlyExpenses) must be > 0
 *  - stockValue must be ≥ 0
 *
 * @param data - Partial guarantor business information.
 * @returns A fully-populated {@link GuarantorBusinessVerification}.
 */
export function verifyGuarantorBusiness(
  data: Partial<GuarantorBusinessVerification>,
): GuarantorBusinessVerification {
  const guarantorName = data.guarantorName ?? '';
  const businessName = data.businessName ?? '';
  const businessAddress = data.businessAddress ?? '';

  const rawYears = data.yearsInOperation;
  const yearsInOperation =
    typeof rawYears === 'number' && Number.isFinite(rawYears) ? Math.max(0, rawYears) : 0;

  const rawSales = data.monthlySales;
  const monthlySales =
    typeof rawSales === 'number' && Number.isFinite(rawSales) ? Math.max(0, rawSales) : 0;

  const rawExpenses = data.monthlyExpenses;
  const monthlyExpenses =
    typeof rawExpenses === 'number' && Number.isFinite(rawExpenses) ? Math.max(0, rawExpenses) : 0;

  const rawStock = data.stockValue;
  const stockValue =
    typeof rawStock === 'number' && Number.isFinite(rawStock) ? Math.max(0, rawStock) : 0;

  const netProfit = monthlySales - monthlyExpenses;

  const notes: string[] = [];
  if (!businessName.trim()) notes.push('Business name is missing.');
  if (!businessAddress.trim()) notes.push('Business address is missing.');
  if (yearsInOperation <= 0) notes.push('Years in operation must be greater than zero.');
  if (monthlySales <= 0) notes.push('Monthly sales must be greater than zero.');
  if (netProfit <= 0) notes.push('Guarantor business is not profitable (net profit ≤ 0).');
  if (stockValue < 0) notes.push('Stock value cannot be negative.');

  const isVerified = notes.length === 0;
  const verificationNotes = isVerified
    ? 'Guarantor business verified — all checks passed.'
    : `Verification failed: ${notes.join(' ')}`;

  return {
    guarantorName,
    businessName,
    businessAddress,
    yearsInOperation,
    monthlySales,
    monthlyExpenses,
    netProfit,
    stockValue,
    isVerified,
    verificationNotes,
  };
}

// ---------------------------------------------------------------------------
// 22. Full appraisal orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the complete credit appraisal pipeline and assemble the result.
 *
 * Executes every stage in order — sales forensics, weighted margin, purchase
 * verification, PMT, P&L, ratios, projection, solvency, stress test, collateral
 * coverage, guarantor DSR, bank yield, risk scoring, red flags — and returns
 * a single {@link EngineResult}.
 *
 * @param input - The full engine input.
 * @returns A fully populated {@link EngineResult}.
 */
export function executeFullAppraisal(input: EngineInput): EngineResult {
  // 1. Sales forensics
  const forensics = triangulateSales(input.sales);

  // 2. Weighted margin
  const weightedMargin = calculateWeightedMargin(input.inventory, input.sectorBenchmarkMargin);

  // 3. Purchase verification
  const purchases = verifyPurchases(
    forensics.consideredSales,
    weightedMargin.weightedMargin,
    forensics.validSources,
  );

  // 4. PMT
  const pmt = calculatePMT(
    input.loan.principal,
    input.loan.annualInterestRate,
    input.loan.tenorMonths,
    input.loan.repaymentMethod,
  );

  // 5. P&L
  const sales = forensics.consideredSales;
  const cogs = purchases.derivedCogs;
  const grossProfit = sales - cogs;
  const opex =
    input.expenses.businessRegular * (1 + input.bufferRate) + input.expenses.businessIrregular;
  const living =
    input.expenses.familyRegular * (1 + input.bufferRate) + input.expenses.familyIrregular;
  const existingDebts = input.expenses.otherLoanInstallments;
  const netCashflowAvailable = grossProfit - opex - living - existingDebts;
  const installment = pmt.installment;
  const netProfit = netCashflowAvailable - installment;
  const netProfitMargin = sales > 0 ? (netProfit / sales) * 100 : 0;

  const pnl: PnL = {
    sales,
    cogs,
    grossProfit,
    opex,
    living,
    existingDebts,
    netCashflowAvailable,
    installment,
    netProfit,
    netProfitMargin,
  };

  // 6. Ratios
  const ratios = calculateRatios(input, pnl, pmt);

  // 7. Projection
  const projection = generateProjections(
    input.openingCash,
    netCashflowAvailable,
    installment,
    input.loan.tenorMonths,
  );

  // 8. Solvency
  const isSolvent = !projection.some((r) => r.isNegative);

  // 9. Stress test
  const stress = runStressTest(input, ratios.dsr, netCashflowAvailable);

  // 10. Collateral coverage
  const collateralCoverage = calculateCollateralCoverage(
    input.collaterals,
    input.balanceSheet.stockValue,
    input.loanBaseAmount,
  );

  // 11. Guarantor DSR
  const guarantorDSR = calculateGuarantorDSR(input.guarantor, installment);

  // 12. Bank yield
  const bankYield = calculateBankYield(input, pmt);

  // 13. Score computation (starts at 100, sector adjustment ±, then deductions)
  let score = 100;
  score += (input.riskInputs.sectorRiskScore - 0.5) * 30;
  if (ratios.dsr > 0.45) score -= 30;
  if (ratios.gearingRatio > 0.35) score -= 15;
  if (!isSolvent) score -= 50;
  if (ratios.equityRatio < 20) score -= 10;
  if (input.riskInputs.previousDefault) score -= 40;
  if (forensics.variancePercent > 25) score -= 10;
  score = Math.max(0, Math.min(100, score));

  // 14. Risk grade
  const riskGrade = calculateRiskGrade(score, isSolvent, ratios.dsr);

  // 15. Red flags
  const redFlags = generateRedFlags(input, ratios, forensics, isSolvent);

  // 16. Extended CAM checks (Excel feature parity) — populated only when the
  //     corresponding input is supplied so existing callers are unaffected.
  const zonification = input.zonification
    ? checkZonification(input.zonification.location, input.zonification.branchLocation)
    : undefined;

  const loanCycleGrade = input.loanCycle
    ? calculateLoanCycleGrade(
        input.loanCycle.cumulativeOverdueDays,
        input.loanCycle.installmentOverdueCount,
        input.loanCycle.isNewCustomer,
      )
    : undefined;

  // Monthly reinvestment capacity = repayment capacity − proposed installment.
  const capitalization = input.capitalization
    ? checkCapitalization(
        input.capitalization.currentEquity,
        input.capitalization.previousEquity,
        pnl.netCashflowAvailable - pnl.installment,
        input.capitalization.monthsBetweenAnalyses,
      )
    : undefined;

  const treasuryVariance = input.treasuryCheck
    ? checkTreasuryVariance(
        forensics.consideredSales,
        input.treasuryCheck.lastPurchaseDate,
        input.treasuryCheck.evaluationDate,
        input.balanceSheet.cashAtHand,
        input.balanceSheet.cashInBanks,
      )
    : undefined;

  // Debt rotation uses balance-sheet short-term liabilities and derived purchases.
  const debtRotationDays = calculateDebtRotation(
    input.balanceSheet.shortTermLiabilities,
    purchases.finalPurchases,
  );

  const turnoverToLoan = input.annualInflow
    ? calculateTurnoverToLoan(input.annualInflow, input.loan.principal)
    : undefined;

  const bankBalances = input.bankBalances;
  const totalBankBalance = bankBalances ? calculateTotalBankBalance(bankBalances) : undefined;

  const guarantorBusinessVerification = input.guarantorBusiness
    ? verifyGuarantorBusiness(input.guarantorBusiness)
    : undefined;

  // G1: Detailed monthly cashflow (22 rows × 12 months)
  const detailedCashflow = input.detailedCashflow
    ? generateDetailedCashflow(
        sales,
        weightedMargin.weightedMargin,
        opex,
        living,
        input.loan.principal,
        installment,
        input.detailedCashflow.existingLoanInstallment,
        input.detailedCashflow.otherLoansInstallment,
        input.detailedCashflow.familyLoanInstallment,
        input.detailedCashflow.familyIncome,
        input.detailedCashflow.openingCash,
        input.loan.tenorMonths,
      )
    : undefined;

  // G2: Balance sheet comparison (current vs previous)
  // Compute current balance sheet totals inline (Ratios doesn't expose them)
  const bsTotalAssets =
    input.balanceSheet.cashAtHand +
    input.balanceSheet.cashInBanks +
    input.balanceSheet.receivables +
    input.balanceSheet.stockValue +
    input.balanceSheet.fixedBusinessAssets +
    input.balanceSheet.fixedFamilyAssets;
  const bsTotalLiabilities =
    input.balanceSheet.shortTermLiabilities + input.balanceSheet.longTermLiabilities;
  const bsNetWorth = bsTotalAssets - bsTotalLiabilities;

  const balanceSheetComparison = input.previousBalanceSheet
    ? (() => {
        const currentAssets = bsTotalAssets;
        const currentLiab = bsTotalLiabilities;
        const currentEq = bsNetWorth;
        const prevAssets = input.previousBalanceSheet.totalAssets;
        const prevLiab = input.previousBalanceSheet.totalLiabilities;
        const prevEq = input.previousBalanceSheet.equity;
        const assetsDiff = currentAssets - prevAssets;
        const liabDiff = currentLiab - prevLiab;
        const eqDiff = currentEq - prevEq;
        const assetsPct = prevAssets > 0 ? (assetsDiff / prevAssets) * 100 : 0;
        const verdict = assetsPct > 5 ? 'GROWING' as const : assetsPct < -5 ? 'DECLINING' as const : 'STABLE' as const;
        return {
          currentTotalAssets: currentAssets,
          previousTotalAssets: prevAssets,
          assetsDifference: assetsDiff,
          assetsPercentChange: assetsPct,
          currentTotalLiabilities: currentLiab,
          previousTotalLiabilities: prevLiab,
          liabilitiesDifference: liabDiff,
          liabilitiesPercentChange: prevLiab > 0 ? (liabDiff / prevLiab) * 100 : 0,
          currentEquity: currentEq,
          previousEquity: prevEq,
          equityDifference: eqDiff,
          equityPercentChange: prevEq > 0 ? (eqDiff / prevEq) * 100 : 0,
          verdict,
          isConsistent: Math.abs(assetsPct) <= 20,
        };
      })()
    : undefined;

  // G8: Cost-of-fund and convert-to-loan amortization schedules
  const costOfFundSchedule = generateCostOfFundSchedule(
    input.loan.principal,
    input.loan.tenorMonths,
  );
  const convertToLoanSchedule = generateConvertToLoanSchedule(
    input.loan.principal,
    input.loan.annualInterestRate,
    input.loan.tenorMonths,
    input.loan.upfrontFeePercent,
    input.loan.ccdPercent,
  );

  return {
    policyVersion: POLICY_VERSION,
    forensics,
    weightedMargin,
    purchases,
    pnl,
    ratios,
    pmt,
    projection,
    isSolvent,
    stress,
    collateralCoverage,
    guarantorDSR,
    bankYield,
    riskGrade,
    redFlags,
    finalScore: riskGrade.score,
    engineVerdict: riskGrade.verdict,
    // Extended CAM checks
    zonification,
    loanCycleGrade,
    capitalization,
    treasuryVariance,
    debtRotationDays,
    turnoverToLoan,
    totalBankBalance,
    bankBalances,
    guarantorBusinessVerification,
    // G1, G2, G8: Excel parity additions
    detailedCashflow,
    balanceSheetComparison,
    costOfFundSchedule,
    convertToLoanSchedule,
  };
}

// ===========================================================================
// GAP 2 — "Can Customer Get Another Loan?" check
// (Excel CLIENT'S INFORMATION sheet "Another Loan" eligibility gate)
// ===========================================================================

/**
 * Result of the "Can the customer get another loan?" eligibility check.
 *
 * The rule (per the Excel policy) is: a customer may take a top-up / new loan
 * only once they have repaid at least ~50% of the principal on their existing
 * facility. Below 45% they are blocked; between 45–55% requires supervisor
 * discretion; at or above 55% they are eligible.
 */
export interface AnotherLoanCheck {
  existingLoans: {
    loanAmount: number;
    totalRepaid: number;
    loanBalance: number;
    percentPaid: number;
  }[];
  totalPrincipal: number;
  totalBalance: number;
  overallPercentPaid: number;
  canGetAnotherLoan: 'YES' | 'NO' | 'MAYBE';
  color: 'green' | 'amber' | 'red';
  reason: string;
}

/**
 * Determine whether a customer with one or more existing loans is eligible
 * for another facility.
 *
 * For each existing loan the repaid amount is derived as
 * `loanAmount − loanBalance` and the percent-paid is computed against the
 * original principal. The overall percent-paid across all facilities is then
 * compared against the 45% / 55% thresholds:
 *
 *  - ≤ 45%  → NO   (blocked)
 *  - ≥ 55%  → YES  (eligible)
 *  - middle → MAYBE (supervisor discretion)
 *
 * @param existingLoans  Array of `{ loanAmount, loanBalance }` for each open loan.
 * @returns A {@link AnotherLoanCheck} decision.
 */
export function checkCanGetAnotherLoan(
  existingLoans: { loanAmount: number; loanBalance: number }[],
): AnotherLoanCheck {
  const loans = existingLoans.map((l) => ({
    loanAmount: l.loanAmount,
    totalRepaid: l.loanAmount - l.loanBalance,
    loanBalance: l.loanBalance,
    percentPaid:
      l.loanAmount > 0 ? ((l.loanAmount - l.loanBalance) / l.loanAmount) * 100 : 0,
  }));

  const totalPrincipal = loans.reduce((s, l) => s + l.loanAmount, 0);
  const totalBalance = loans.reduce((s, l) => s + l.loanBalance, 0);
  const overallPercentPaid =
    totalPrincipal > 0 ? ((totalPrincipal - totalBalance) / totalPrincipal) * 100 : 0;

  let canGetAnotherLoan: AnotherLoanCheck['canGetAnotherLoan'] = 'MAYBE';
  let color: AnotherLoanCheck['color'] = 'amber';
  let reason = '';

  if (overallPercentPaid <= 45) {
    canGetAnotherLoan = 'NO';
    color = 'red';
    reason = `Customer has paid only ${overallPercentPaid.toFixed(1)}% of existing loan principal. Cannot get another loan.`;
  } else if (overallPercentPaid >= 55) {
    canGetAnotherLoan = 'YES';
    color = 'green';
    reason = `Customer has paid ${overallPercentPaid.toFixed(1)}% of existing loan principal. Eligible for another loan.`;
  } else {
    canGetAnotherLoan = 'MAYBE';
    color = 'amber';
    reason = `Customer has paid ${overallPercentPaid.toFixed(1)}% — supervisor discretion required.`;
  }

  return {
    existingLoans: loans,
    totalPrincipal,
    totalBalance,
    overallPercentPaid,
    canGetAnotherLoan,
    color,
    reason,
  };
}

// ===========================================================================
// GAP 3 — Balance-sheet current vs previous comparison
// (Excel BALANCE SHEET sheet side-by-side two-period comparison)
// ===========================================================================

/** Input shape for a single balance-sheet period used by the comparator. */
export interface BalanceSheetPeriod {
  cashAtHand: number;
  wflBalance: number;
  otherBankBalances: number;
  receivables: number;
  advanceToSuppliers: number;
  stock: number;
  businessEquipment: number;
  businessVehicles: number;
  businessLand: number;
  familyEquipment: number;
  familyVehicles: number;
  familyLand: number;
  advanceFromCustomers: number;
  payables: number;
  wflLoan: number;
  otherBankLoans: number;
  wflLongTermLoan: number;
  otherLongTermLoans: number;
}

/**
 * Result of comparing two balance-sheet periods.
 *
 * Each `lineItems` row carries the current and previous values, the absolute
 * difference, and each value's share of total assets for its period. The three
 * summary blocks (`totalAssets` / `totalLiabilities` / `totalEquity`) provide
 * the headline current-vs-previous deltas.
 */
export interface BalanceSheetComparison {
  lineItems: {
    label: string;
    current: number;
    previous: number;
    difference: number;
    currentPercent: number;
    previousPercent: number;
  }[];
  totalAssets: { current: number; previous: number; difference: number };
  totalLiabilities: { current: number; previous: number; difference: number };
  totalEquity: { current: number; previous: number; difference: number };
}

/**
 * Build a side-by-side current-vs-previous balance-sheet comparison.
 *
 * Mirrors the Excel BALANCE SHEET sheet which renders the two reporting
 * periods next to each other with running % of total assets and a delta
 * column. Equity is derived as `totalAssets − totalLiabilities` for each
 * period.
 *
 * @param current   The current-period balance sheet.
 * @param previous  The previous-period balance sheet.
 * @returns A {@link BalanceSheetComparison}.
 */
export function compareBalanceSheets(
  current: BalanceSheetPeriod,
  previous: BalanceSheetPeriod,
): BalanceSheetComparison {
  // Calculate totals
  const currentShortTermAssets =
    current.cashAtHand +
    current.wflBalance +
    current.otherBankBalances +
    current.receivables +
    current.advanceToSuppliers +
    current.stock;
  const previousShortTermAssets =
    previous.cashAtHand +
    previous.wflBalance +
    previous.otherBankBalances +
    previous.receivables +
    previous.advanceToSuppliers +
    previous.stock;

  const currentFixedAssets =
    current.businessEquipment +
    current.businessVehicles +
    current.businessLand +
    current.familyEquipment +
    current.familyVehicles +
    current.familyLand;
  const previousFixedAssets =
    previous.businessEquipment +
    previous.businessVehicles +
    previous.businessLand +
    previous.familyEquipment +
    previous.familyVehicles +
    previous.familyLand;

  const currentTotalAssets = currentShortTermAssets + currentFixedAssets;
  const previousTotalAssets = previousShortTermAssets + previousFixedAssets;

  const currentShortTermLiab =
    current.advanceFromCustomers + current.payables + current.wflLoan + current.otherBankLoans;
  const previousShortTermLiab =
    previous.advanceFromCustomers + previous.payables + previous.wflLoan + previous.otherBankLoans;

  const currentLongTermLiab = current.wflLongTermLoan + current.otherLongTermLoans;
  const previousLongTermLiab = previous.wflLongTermLoan + previous.otherLongTermLoans;

  const currentTotalLiab = currentShortTermLiab + currentLongTermLiab;
  const previousTotalLiab = previousShortTermLiab + previousLongTermLiab;

  const currentEquity = currentTotalAssets - currentTotalLiab;
  const previousEquity = previousTotalAssets - previousTotalLiab;

  // Build line items
  const items = [
    { label: 'Cash at Hand', current: current.cashAtHand, previous: previous.cashAtHand },
    { label: 'WFL Balance', current: current.wflBalance, previous: previous.wflBalance },
    {
      label: 'Other Bank Balances',
      current: current.otherBankBalances,
      previous: previous.otherBankBalances,
    },
    {
      label: 'Total Treasury',
      current: current.cashAtHand + current.wflBalance + current.otherBankBalances,
      previous: previous.cashAtHand + previous.wflBalance + previous.otherBankBalances,
    },
    { label: 'Receivables (Credit Sales)', current: current.receivables, previous: previous.receivables },
    {
      label: 'Advance to Suppliers',
      current: current.advanceToSuppliers,
      previous: previous.advanceToSuppliers,
    },
    { label: 'Total Stock', current: current.stock, previous: previous.stock },
    {
      label: 'Total Short-Term Assets',
      current: currentShortTermAssets,
      previous: previousShortTermAssets,
    },
    {
      label: 'Business Equipment',
      current: current.businessEquipment,
      previous: previous.businessEquipment,
    },
    {
      label: 'Business Vehicles',
      current: current.businessVehicles,
      previous: previous.businessVehicles,
    },
    { label: 'Business Land & House', current: current.businessLand, previous: previous.businessLand },
    {
      label: 'Family Equipment',
      current: current.familyEquipment,
      previous: previous.familyEquipment,
    },
    { label: 'Family Vehicles', current: current.familyVehicles, previous: previous.familyVehicles },
    { label: 'Family Land & House', current: current.familyLand, previous: previous.familyLand },
    { label: 'Total Fixed Assets', current: currentFixedAssets, previous: previousFixedAssets },
    { label: 'TOTAL ASSETS', current: currentTotalAssets, previous: previousTotalAssets },
    {
      label: 'Advance from Customers',
      current: current.advanceFromCustomers,
      previous: previous.advanceFromCustomers,
    },
    { label: 'Payables', current: current.payables, previous: previous.payables },
    { label: 'WFL Loan', current: current.wflLoan, previous: previous.wflLoan },
    {
      label: 'Other Bank Loans',
      current: current.otherBankLoans,
      previous: previous.otherBankLoans,
    },
    {
      label: 'Total Short-Term Liabilities',
      current: currentShortTermLiab,
      previous: previousShortTermLiab,
    },
    {
      label: 'WFL Long-Term Loan',
      current: current.wflLongTermLoan,
      previous: previous.wflLongTermLoan,
    },
    {
      label: 'Other Long-Term Loans',
      current: current.otherLongTermLoans,
      previous: previous.otherLongTermLoans,
    },
    { label: 'TOTAL LIABILITIES', current: currentTotalLiab, previous: previousTotalLiab },
    { label: 'TOTAL EQUITY', current: currentEquity, previous: previousEquity },
  ];

  const lineItems = items.map((item) => ({
    ...item,
    difference: item.current - item.previous,
    currentPercent:
      currentTotalAssets > 0 ? (item.current / currentTotalAssets) * 100 : 0,
    previousPercent:
      previousTotalAssets > 0 ? (item.previous / previousTotalAssets) * 100 : 0,
  }));

  return {
    lineItems,
    totalAssets: {
      current: currentTotalAssets,
      previous: previousTotalAssets,
      difference: currentTotalAssets - previousTotalAssets,
    },
    totalLiabilities: {
      current: currentTotalLiab,
      previous: previousTotalLiab,
      difference: currentTotalLiab - previousTotalLiab,
    },
    totalEquity: {
      current: currentEquity,
      previous: previousEquity,
      difference: currentEquity - previousEquity,
    },
  };
}

// ===========================================================================
// GAP 4 — Interest rate lookup by product × grade
// (Excel R184-R187 rate matrix)
// ===========================================================================

/**
 * Rate lookup table from Excel R184-R187.
 * Format: [product][grade] = rate (as decimal, e.g., 0.05 = 5%).
 * A sentinel value of `-1` indicates the grade is rejected for that product.
 */
const RATE_BY_PRODUCT_GRADE: Record<string, Record<string, number>> = {
  micro: { A: 0.05, B: 0.05, C: 0.05, D: -1 }, // D = reject
  sme: { A: 0.05, B: 0.05, C: 0.05, D: -1 },
  'sme plus': { A: 0.0425, B: 0.0425, C: 0.0425, D: -1 },
  lpo: { A: 0.045, B: 0.045, C: 0.045, D: -1 }, // Uses base rate
  'asset finance': { A: 0.045, B: 0.045, C: 0.045, D: -1 },
  'edu loan': { A: 0.045, B: 0.045, C: 0.045, D: -1 },
  'quick loan': { A: 0.045, B: 0.045, C: 0.045, D: -1 },
};

/**
 * Resolve the monthly interest rate for a loan from the product × grade matrix.
 *
 * `grade === 'NEW'` is treated as grade `A`. A grade-`D` lookup (sentinel `-1`)
 * returns `rejected: true` so callers can short-circuit the application. When
 * the product is not present in the matrix the supplied `baseRate` is returned
 * unchanged (default 4.5%).
 *
 * @param product   Loan product name (case-insensitive, e.g. "SME Plus").
 * @param grade     Customer risk grade (A, B, C, D or NEW).
 * @param baseRate  Fallback monthly rate (decimal) — default 0.045.
 * @returns `{ rate, rejected }` where `rate` is a monthly decimal.
 */
export function getInterestRateByProductGrade(
  product: string,
  grade: 'A' | 'B' | 'C' | 'D' | 'NEW',
  baseRate: number = 0.045,
): { rate: number; rejected: boolean } {
  const productKey = product.toLowerCase();
  const gradeKey = grade === 'NEW' ? 'A' : grade; // NEW treated as A

  const productRates = RATE_BY_PRODUCT_GRADE[productKey];
  if (!productRates) {
    return { rate: baseRate, rejected: false };
  }

  const rate = productRates[gradeKey];
  if (rate === -1) {
    return { rate: 0, rejected: true }; // Grade D = reject
  }

  return { rate, rejected: false };
}

// ===========================================================================
// GAP 7 — Detailed 12-month cash-flow projection
// (Excel DSCR / Cashflow sheet, expanded row model)
// ===========================================================================

/** A single row of the detailed 12-month cash-flow projection. */
export interface DetailedCashflowRow {
  month: number;
  businessInflow: number;
  marginAmount: number; // inflow × (1 - margin%)
  businessExpenses: number;
  totalExpenses: number; // margin + expenses
  operationalCashflow: number; // inflow - totalExpenses
  newLoanDisbursement: number;
  clientContribution: number;
  repaymentRunningLoan: number;
  repaymentNewLoan: number;
  repaymentOtherLoans: number;
  totalFinancialInflow: number;
  familyIncome: number;
  familyExpenses: number;
  familyNetIncome: number;
  repaymentFamilyLoan: number;
  totalFamilyInflow: number;
  cashAtEndOfPeriod: number;
  firstLiquidity: number; // opening balance
  accruedFlow: number; // running total
}

/**
 * Generate a detailed 12-month cash-flow projection that mirrors the Excel
 * DSCR / cashflow sheet row model.
 *
 * Each row breaks the month into:
 *  - business inflow + margin deduction + business expenses → operational cashflow
 *  - new-loan disbursement (month 1 only) minus instalments on the running
 *    loan, the new loan and other loans → total financial inflow
 *  - family income/expenses net of family-loan instalment → total family inflow
 *  - cash at end of period, opening (first liquidity) and the running accrued
 *    balance (firstLiquidity + Σ cashAtEndOfPeriod)
 *
 * The new-loan instalment is only applied while the month index is within the
 * supplied tenor.
 *
 * @param monthlySales              Projected monthly business inflow.
 * @param marginPercent             Cost-of-sales as a decimal (0.75 = 75%).
 * @param monthlyBusinessExpenses   Recurring monthly business opex.
 * @param monthlyFamilyExpenses     Recurring monthly family living cost.
 * @param newLoanAmount             Principal of the proposed new loan.
 * @param newLoanInstallment        Monthly instalment of the proposed new loan.
 * @param existingLoanInstallment   Monthly instalment on the running (existing) loan.
 * @param otherLoansInstallment     Monthly instalment on other external loans.
 * @param familyLoanInstallment     Monthly instalment on family / informal loans.
 * @param familyIncome              Net monthly family income (after tax).
 * @param openingCash               Cash balance at the start of month 1.
 * @param tenorMonths               Tenor (months) over which the new-loan instalment applies.
 * @returns An array of 12 {@link DetailedCashflowRow} objects.
 */
export function generateDetailedCashflow(
  monthlySales: number,
  marginPercent: number,
  monthlyBusinessExpenses: number,
  monthlyFamilyExpenses: number,
  newLoanAmount: number,
  newLoanInstallment: number,
  existingLoanInstallment: number,
  otherLoansInstallment: number,
  familyLoanInstallment: number,
  familyIncome: number,
  openingCash: number,
  tenorMonths: number,
): DetailedCashflowRow[] {
  const rows: DetailedCashflowRow[] = [];
  let runningBalance = openingCash;

  for (let i = 1; i <= 12; i++) {
    const businessInflow = monthlySales;
    const marginAmount = businessInflow * (1 - marginPercent);
    const businessExpenses = monthlyBusinessExpenses;
    const totalExpenses = marginAmount + businessExpenses;
    const operationalCashflow = businessInflow - totalExpenses;

    const newLoanDisbursement = i === 1 ? newLoanAmount : 0;
    const clientContribution = 0;
    const repaymentRunningLoan = existingLoanInstallment;
    const repaymentNewLoan = i <= tenorMonths ? newLoanInstallment : 0;
    const repaymentOtherLoans = otherLoansInstallment;
    const totalFinancialInflow =
      newLoanDisbursement +
      clientContribution -
      repaymentRunningLoan -
      repaymentNewLoan -
      repaymentOtherLoans;

    const familyNetIncome = familyIncome - monthlyFamilyExpenses;
    const repaymentFamilyLoan = familyLoanInstallment;
    const totalFamilyInflow = familyNetIncome - repaymentFamilyLoan;

    const cashAtEndOfPeriod =
      operationalCashflow + totalFinancialInflow + totalFamilyInflow;
    const firstLiquidity = i === 1 ? openingCash : runningBalance;
    runningBalance += cashAtEndOfPeriod;

    rows.push({
      month: i,
      businessInflow,
      marginAmount,
      businessExpenses,
      totalExpenses,
      operationalCashflow,
      newLoanDisbursement,
      clientContribution,
      repaymentRunningLoan,
      repaymentNewLoan,
      repaymentOtherLoans,
      totalFinancialInflow,
      familyIncome,
      familyExpenses: monthlyFamilyExpenses,
      familyNetIncome,
      repaymentFamilyLoan,
      totalFamilyInflow,
      cashAtEndOfPeriod,
      firstLiquidity,
      accruedFlow: runningBalance,
    });
  }

  return rows;
}

// ===========================================================================
// G8: COST-OF-FUND AMORTIZATION SCHEDULE
// Mirrors Excel Sheet1 (2) — cost of fund at 30% PA on the loan principal
// Shows the bank's true cost of capital over the loan tenure
// ===========================================================================

export function generateCostOfFundSchedule(
  principal: number,
  tenureMonths: number,
): AmortizationSchedule {
  const costOfFundRate = COST_OF_FUND_RATE; // 0.30 (30% PA)
  const monthlyRate = costOfFundRate / 12;

  // PMT for cost-of-fund
  let monthlyInstallment: number;
  if (monthlyRate === 0) {
    monthlyInstallment = principal / tenureMonths;
  } else {
    const top = monthlyRate * Math.pow(1 + monthlyRate, tenureMonths);
    const bottom = Math.pow(1 + monthlyRate, tenureMonths) - 1;
    monthlyInstallment = principal * (top / bottom);
  }

  const schedule: AmortizationScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPrincipal = 0;

  for (let i = 1; i <= tenureMonths; i++) {
    const interest = balance * monthlyRate;
    let principalPortion = monthlyInstallment - interest;

    if (i === tenureMonths) {
      principalPortion += balance;
      balance = 0;
    } else {
      balance -= principalPortion;
    }

    totalInterest += interest;
    totalPrincipal += principalPortion;

    schedule.push({
      month: i,
      openingBalance: balance + principalPortion,
      installment: monthlyInstallment,
      interest,
      principal: principalPortion,
      closingBalance: Math.abs(balance),
    });
  }

  return {
    schedule,
    monthlyInstallment,
    totalInterest,
    totalPrincipal,
    totalPayable: monthlyInstallment * tenureMonths,
    summary: { costOfFundRate },
  };
}

// ===========================================================================
// G8: CONVERT-TO-LOAN AMORTIZATION SCHEDULE
// Mirrors Excel Sheet1 (2) — converts upfront fee + CCD + admin cost into
// an equivalent loan schedule, showing the true cost to the borrower
// ===========================================================================

export function generateConvertToLoanSchedule(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number,
  upfrontFeePercent: number,
  ccdPercent: number,
): AmortizationSchedule {
  const monthlyRate = annualInterestRate / 100 / 12;

  const upfrontFee = principal * (upfrontFeePercent / 100);
  const ccdAmount = principal * (ccdPercent / 100);
  const adminCostMonthly = (principal * ADMIN_COST_RATE) / 12;
  const adminCostTotal = adminCostMonthly * tenureMonths;

  const convertedPrincipal = principal + upfrontFee + ccdAmount + adminCostTotal;

  let monthlyInstallment: number;
  if (monthlyRate === 0) {
    monthlyInstallment = convertedPrincipal / tenureMonths;
  } else {
    const top = monthlyRate * Math.pow(1 + monthlyRate, tenureMonths);
    const bottom = Math.pow(1 + monthlyRate, tenureMonths) - 1;
    monthlyInstallment = convertedPrincipal * (top / bottom);
  }

  const schedule: AmortizationScheduleRow[] = [];
  let balance = convertedPrincipal;
  let totalInterest = 0;
  let totalPrincipalPaid = 0;

  for (let i = 1; i <= tenureMonths; i++) {
    const interest = balance * monthlyRate;
    let principalPortion = monthlyInstallment - interest;

    if (i === tenureMonths) {
      principalPortion += balance;
      balance = 0;
    } else {
      balance -= principalPortion;
    }

    totalInterest += interest;
    totalPrincipalPaid += principalPortion;

    schedule.push({
      month: i,
      openingBalance: balance + principalPortion,
      installment: monthlyInstallment,
      interest,
      principal: principalPortion,
      closingBalance: Math.abs(balance),
    });
  }

  return {
    schedule,
    monthlyInstallment,
    totalInterest,
    totalPrincipal: totalPrincipalPaid,
    totalPayable: monthlyInstallment * tenureMonths,
    summary: {
      upfrontFee,
      ccdAmount,
      adminCostTotal,
      costOfFundRate: COST_OF_FUND_RATE,
    },
  };
}


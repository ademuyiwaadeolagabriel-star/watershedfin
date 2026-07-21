// ============================================================================
// BANKING DOMAIN CONSTANTS — types, roles, workflow, formulas, snapshots
// ============================================================================

export const ROLES = {
  SUPER: 'super',
  MD: 'md',
  CFO: 'cfo',
  HOC: 'hoc',
  CRO: 'cro',
  LEGAL: 'legal',
  CS: 'cs',
  BM: 'bm',
  ANALYST: 'analyst',
  CREDIT_ANALYST: 'credit_analyst',
  LOAN: 'loan',
  FRONTDESK: 'frontdesk',
  TREASURY: 'treasury',
  ADMIN: 'admin',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  super: 'Super Admin',
  md: 'Managing Director / CEO',
  cfo: 'Group CFO',
  hoc: 'Head of Credit',
  cro: 'Chief Risk Officer',
  legal: 'Legal Officer',
  cs: 'Customer Service',
  bm: 'Branch Manager',
  analyst: 'Credit Analyst',
  credit_analyst: 'Credit Analyst',
  loan: 'Loan Officer',
  frontdesk: 'Front Desk Officer',
  treasury: 'Treasury Officer',
  admin: 'System Administrator',
};

// ---------------------------------------------------------------------------
// LOAN WORKFLOW — 20 states
// ---------------------------------------------------------------------------

export const LOAN_STEPS = {
  DRAFT: 'DRAFT',
  LO_ENTRY: 'LO_ENTRY',
  LO_ASSESSMENT: 'LO_ASSESSMENT',
  QUERY_RESPONSE: 'QUERY_RESPONSE',
  LEGAL_CAC_CHECK: 'LEGAL_CAC_CHECK',
  // v26 — new onboarding-stage step (CS KYC + Legal CAC search happen before LOAN creation)
  CS_KYC_REVIEW: 'CS_KYC_REVIEW',
  LEGAL_CAC_SEARCH: 'LEGAL_CAC_SEARCH',
  BM_QC: 'BM_QC',
  // v26 — BM vetting renamed alias
  BM_VETTING: 'BM_VETTING',
  HOC_STRUCTURING: 'HOC_STRUCTURING',
  HOC_ASSIGNMENT: 'HOC_ASSIGNMENT',
  ANALYST_STRUCTURING: 'ANALYST_STRUCTURING',
  // v26 — HOC confirmation step (review analyst work)
  HOC_CONFIRMATION: 'HOC_CONFIRMATION',
  HOC_APPROVAL: 'HOC_APPROVAL',
  CRO_VERIFICATION: 'CRO_VERIFICATION',
  CRO_RISK: 'CRO_RISK',
  CRO_REVIEW: 'CRO_REVIEW',
  CFO_REVIEW: 'CFO_REVIEW',
  LEGAL_REVIEW: 'LEGAL_REVIEW',
  LEGAL_FINAL_REVIEW: 'LEGAL_FINAL_REVIEW',
  // v26 — Legal MCC compliance step
  LEGAL_MCC: 'LEGAL_MCC',
  HOC_AGGREGATION: 'HOC_AGGREGATION',
  MD_APPROVAL: 'MD_APPROVAL',
  // v26 — MD/MCC approval alias
  MD_MCC_APPROVAL: 'MD_MCC_APPROVAL',
  INTERNAL_CONTROL_CHECK: 'INTERNAL_CONTROL_CHECK',
  INTERNAL_CONTROL: 'INTERNAL_CONTROL',
  // v26 — Compliance review step
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  HOC_FINALIZATION: 'HOC_FINALIZATION',
  CUSTOMER_ACCEPTANCE: 'CUSTOMER_ACCEPTANCE',
  HOC_SCHEDULING: 'HOC_SCHEDULING',
  CFO_DISBURSEMENT: 'CFO_DISBURSEMENT',
  TREASURY_PAYOUT: 'TREASURY_PAYOUT',
  // v26 — post-disbursement handoff
  POST_DISBURSEMENT_HANDOFF: 'POST_DISBURSEMENT_HANDOFF',
} as const;

// ============================================================================
// BANK-GRADE 13-STEP LOAN ORIGINATION WORKFLOW
// Based on CBN prudential guidelines for MFBs, Finance Companies & Commercial Banks
// Each department owns its own recommendation — no department overwrites another
// ============================================================================

export const LOAN_STEP_LABELS: Record<string, string> = {
  // Pre-Qualification Phase
  DRAFT: 'Draft',
  LO_ENTRY: '1. LO Entry',
  CS_KYC_REVIEW: '2. Customer Service KYC Review',
  LEGAL_CAC_SEARCH: '3. Legal CAC Name Search',
  LEGAL_KYC_CHECK: '2. Legal KYC/CAC Verification',
  BM_QC: '4. Branch Manager Vetting',
  BM_VETTING: '4. Branch Manager Vetting',
  QUERY_RESPONSE: 'Query Response',
  CUSTOMER_NEGOTIATION: 'Customer Negotiation',
  // Engine Room (Structuring)
  HOC_ASSIGNMENT: '5. HOC Assignment',
  ANALYST_STRUCTURING: '6. Analyst Structuring',
  HOC_CONFIRMATION: '7. HOC Confirmation',
  HOC_REVIEW: '6. HOC Review',
  HOC_STRUCTURING: 'HOC Structuring',
  // Governance Layer
  CRO_RISK: '8. CRO Risk Assessment',
  CRO_REVIEW: '8. CRO Review',
  CFO_REVIEW: '9. CFO Liquidity Review',
  LEGAL_MCC: '10. Legal MCC Compliance',
  LEGAL_AGGREGATION: '9. Legal Aggregation (Executive Credit Pack)',
  MD_APPROVAL: '11. MD/MCC Executive Approval',
  MD_MCC_APPROVAL: '11. MD/MCC Executive Approval',
  // Closing Phase
  INTERNAL_CONTROL: '12. Internal Control Documentation',
  INTERNAL_CONTROL_CHECK: '12. Internal Control Check',
  COMPLIANCE_REVIEW: '13. Compliance Review',
  CUSTOMER_ACCEPTANCE: '11. Customer Acceptance',
  HOC_SCHEDULING: '14. HOC Go-Live (Activation)',
  CFO_DISBURSEMENT: '15. CFO Disbursement',
  POST_DISBURSEMENT_HANDOFF: '16. Post-Disbursement Handoff',
  // Post-Disbursement Monitoring
  ACTIVE_MONITORING: 'Active Monitoring',
  REPAYMENT_TRACKING: 'Repayment Tracking',
  EARLY_WARNING: 'Early Warning Signals',
  COLLECTIONS: 'Collections',
  LOAN_CLOSURE: 'Loan Closure',
  // Legacy steps (kept for backward compatibility with existing loans)
  LO_ASSESSMENT: 'LO Assessment (Legacy)',
  LEGAL_CAC_CHECK: 'Legal CAC Check (Legacy)',
  HOC_STRUCTURING: 'HOC Structuring (Legacy)',
  HOC_APPROVAL: 'HOC Approval (Legacy)',
  CRO_VERIFICATION: 'CRO Verification (Legacy)',
  LEGAL_REVIEW: 'Legal Review (Legacy)',
  LEGAL_FINAL_REVIEW: 'Legal Final Review (Legacy)',
  HOC_AGGREGATION: 'HOC Aggregation (Legacy)',
  INTERNAL_CONTROL_CHECK: 'Internal Control (Legacy)',
  HOC_FINALIZATION: 'Finalization (Legacy)',
  TREASURY_PAYOUT: 'Treasury Payout (Legacy)',
};

// ============================================================================
// WORKFLOW TRANSITIONS — Bank-Grade 13-Step Flow
// ============================================================================
export const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  // Phase 1: Pre-Qualification
  DRAFT: ['LO_ENTRY'],
  LO_ENTRY: ['LEGAL_KYC_CHECK', 'QUERY_RESPONSE'],
  LEGAL_KYC_CHECK: ['BM_QC', 'LO_ENTRY'],  // Legal can reject back to LO
  QUERY_RESPONSE: ['LO_ENTRY', 'LEGAL_KYC_CHECK'],
  BM_QC: ['HOC_ASSIGNMENT', 'LO_ENTRY', 'QUERY_RESPONSE'],  // BM can return to LO

  // Phase 2: Engine Room (Structuring)
  HOC_ASSIGNMENT: ['ANALYST_STRUCTURING'],
  ANALYST_STRUCTURING: ['HOC_REVIEW', 'HOC_ASSIGNMENT'],
  HOC_REVIEW: ['CRO_RISK', 'ANALYST_STRUCTURING'],  // HOC can return to Analyst

  // Phase 3: Governance Layer
  CRO_RISK: ['CFO_REVIEW', 'HOC_REVIEW'],
  CFO_REVIEW: ['LEGAL_AGGREGATION', 'CRO_RISK'],
  LEGAL_AGGREGATION: ['MD_APPROVAL', 'CFO_REVIEW'],  // Legal compiles Executive Credit Pack
  MD_APPROVAL: ['CUSTOMER_ACCEPTANCE', 'LEGAL_AGGREGATION'],

  // Phase 4: Closing
  CUSTOMER_ACCEPTANCE: ['HOC_SCHEDULING', 'CUSTOMER_NEGOTIATION'],
  CUSTOMER_NEGOTIATION: ['ANALYST_STRUCTURING', 'MD_APPROVAL', 'CUSTOMER_ACCEPTANCE'],
  HOC_SCHEDULING: ['CFO_DISBURSEMENT'],  // HOC activates loan → status = RUNNING
  CFO_DISBURSEMENT: ['ACTIVE_MONITORING'],  // CFO releases funds

  // Phase 5: Post-Disbursement Monitoring
  ACTIVE_MONITORING: ['REPAYMENT_TRACKING', 'EARLY_WARNING'],
  REPAYMENT_TRACKING: ['EARLY_WARNING', 'LOAN_CLOSURE'],
  EARLY_WARNING: ['COLLECTIONS', 'REPAYMENT_TRACKING'],
  COLLECTIONS: ['REPAYMENT_TRACKING', 'LOAN_CLOSURE'],
  LOAN_CLOSURE: [],  // terminal — loan fully repaid or written off

  // Legacy transitions (for existing loans in old workflow)
  LO_ASSESSMENT: ['LEGAL_KYC_CHECK', 'BM_QC'],
  LEGAL_CAC_CHECK: ['BM_QC'],
  HOC_STRUCTURING: ['ANALYST_STRUCTURING'],
  HOC_APPROVAL: ['CRO_RISK'],
  CRO_VERIFICATION: ['CRO_RISK'],
  LEGAL_REVIEW: ['LEGAL_FINAL_REVIEW', 'CFO_REVIEW'],
  LEGAL_FINAL_REVIEW: ['LEGAL_AGGREGATION'],
  HOC_AGGREGATION: ['MD_APPROVAL'],
  INTERNAL_CONTROL_CHECK: ['CFO_DISBURSEMENT'],
  HOC_FINALIZATION: ['CUSTOMER_ACCEPTANCE'],
  TREASURY_PAYOUT: ['ACTIVE_MONITORING'],
};

// Step → permission required
export const STEP_PERMISSIONS: Record<string, string> = {
  // Phase 1: Pre-Qualification
  DRAFT: 'loanOrigination',
  LO_ENTRY: 'loanOrigination',
  LEGAL_KYC_CHECK: 'loanLegal',
  QUERY_RESPONSE: 'loanOrigination',
  BM_QC: 'loanVetting',
  CUSTOMER_NEGOTIATION: 'loanOrigination',

  // Phase 2: Engine Room
  HOC_ASSIGNMENT: 'loanStructuring',
  ANALYST_STRUCTURING: 'loanAnalyst',
  HOC_REVIEW: 'loanStructuring',

  // Phase 3: Governance
  CRO_RISK: 'loanRisk',
  CFO_REVIEW: 'loanCfoReview',
  LEGAL_AGGREGATION: 'loanLegal',
  MD_APPROVAL: 'loanMcc',

  // Phase 4: Closing
  CUSTOMER_ACCEPTANCE: 'loanFinalization',
  HOC_SCHEDULING: 'loanFinalization',
  CFO_DISBURSEMENT: 'loanDisbursement',

  // Phase 5: Post-Disbursement
  ACTIVE_MONITORING: 'loanPortfolio',
  REPAYMENT_TRACKING: 'loanPortfolio',
  EARLY_WARNING: 'loanRisk',
  COLLECTIONS: 'loanPortfolio',
  LOAN_CLOSURE: 'loanFinalization',

  // Legacy steps
  LO_ASSESSMENT: 'loanOrigination',
  LEGAL_CAC_CHECK: 'loanLegal',
  HOC_STRUCTURING: 'loanStructuring',
  HOC_APPROVAL: 'loanStructuring',
  CRO_VERIFICATION: 'loanRisk',
  LEGAL_REVIEW: 'loanLegal',
  LEGAL_FINAL_REVIEW: 'loanLegal',
  HOC_AGGREGATION: 'loanLegal',
  INTERNAL_CONTROL_CHECK: 'internalControl',
  HOC_FINALIZATION: 'loanFinalization',
  TREASURY_PAYOUT: 'loanDisbursement',
};

// Workflow phases for visual grouping
export const WORKFLOW_PHASES = [
  {
    id: 'pre-qualification',
    label: 'Pre-Qualification',
    steps: ['LO_ENTRY', 'LEGAL_KYC_CHECK', 'BM_QC'],
    color: 'blue',
  },
  {
    id: 'structuring',
    label: 'Engine Room (Structuring)',
    steps: ['HOC_ASSIGNMENT', 'ANALYST_STRUCTURING', 'HOC_REVIEW'],
    color: 'indigo',
  },
  {
    id: 'governance',
    label: 'Governance Layer',
    steps: ['CRO_RISK', 'CFO_REVIEW', 'LEGAL_AGGREGATION', 'MD_APPROVAL'],
    color: 'purple',
  },
  {
    id: 'closing',
    label: 'Closing',
    steps: ['CUSTOMER_ACCEPTANCE', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT'],
    color: 'emerald',
  },
  {
    id: 'monitoring',
    label: 'Post-Disbursement Monitoring',
    steps: ['ACTIVE_MONITORING', 'REPAYMENT_TRACKING', 'EARLY_WARNING', 'COLLECTIONS', 'LOAN_CLOSURE'],
    color: 'amber',
  },
] as const;

// Department recommendation fields (each department owns its opinion)
export const DEPARTMENT_RECOMMENDATIONS = {
  LO: { amountField: 'requestedAmount', label: 'Customer Request' },
  ANALYST: { amountField: 'appraisedAmount', label: 'Analyst Recommendation' },
  BM: { amountField: 'vettedAmount', label: 'BM Recommendation' },
  HOC: { amountField: 'structuredAmount', label: 'HOC Endorsement' },
  CRO: { amountField: 'riskApprovedAmount', label: 'CRO Max Safe Exposure' },
  CFO: { amountField: 'cfoApprovedAmount', label: 'CFO Liquidity Limit' },
  LEGAL: { amountField: null, label: 'Legal Enforceability' },
  MD: { amountField: 'finalApprovedAmount', label: 'MD Final Approval' },
} as const;

// ---------------------------------------------------------------------------
// LOAN STATUS — high-level
// ---------------------------------------------------------------------------

export const LOAN_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  QUERIED: 'queried',
  RUNNING: 'running',
  PAID: 'paid',
  DECLINED: 'declined',
  PENDING_LEGAL: 'pending_legal',
} as const;

export const LOAN_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  queried: 'Queried',
  running: 'Active (Running)',
  paid: 'Closed (Paid)',
  declined: 'Declined',
  pending_legal: 'Pending Legal',
  // NPL classification labels (8-stage)
  pass_watch: 'Pass & Watch',
  substandard: 'Substandard',
  doubtful: 'Doubtful',
  lost: 'Lost',
  watchlist: 'Watchlist',
  write_off: 'Write-off',
};

export const LOAN_STATUS_BADGES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-700',
  queried: 'bg-amber-100 text-amber-700',
  running: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  pending_legal: 'bg-purple-100 text-purple-700',
  // NPL classification badges (mirrors NPL_CLASSIFICATIONS color tokens)
  pass_watch: 'bg-green-100 text-green-700',
  substandard: 'bg-amber-100 text-amber-700',
  doubtful: 'bg-orange-100 text-orange-700',
  lost: 'bg-red-100 text-red-700',
  watchlist: 'bg-yellow-100 text-yellow-700',
  write_off: 'bg-slate-200 text-slate-700',
};

// ---------------------------------------------------------------------------
// NPL CLASSIFICATIONS — 8-stage Non-Performing Loan categorisation
// (mirrors the CBN prudential 8-stage NPL ladder used by the source workbook)
// ---------------------------------------------------------------------------

export const NPL_CLASSIFICATIONS = {
  PERFORMING: { label: 'Performing', color: 'emerald', daysOverdue: 0 },
  PASS_WATCH: { label: 'Pass & Watch', color: 'green', daysOverdue: 1 },
  SUBSTANDARD: { label: 'Substandard', color: 'amber', daysOverdue: 30 },
  DOUBTFUL: { label: 'Doubtful', color: 'orange', daysOverdue: 60 },
  LOST: { label: 'Lost', color: 'red', daysOverdue: 90 },
  WATCHLIST: { label: 'Watchlist', color: 'yellow', daysOverdue: 7 },
  WRITE_OFF: { label: 'Write-off', color: 'slate', daysOverdue: 180 },
  OVERDRAFT: { label: 'Overdraft', color: 'blue', daysOverdue: -1 },
} as const;

/**
 * Classify a loan into one of the 8 NPL stages by its days-overdue value.
 *
 * Ladder (days-overdue):
 *   < 0          → OVERDRAFT     (facility is an overdraft, no fixed due date)
 *   0            → PERFORMING    (current / not overdue)
 *   1 – 7        → WATCHLIST     (early-warning)
 *   8 – 30       → SUBSTANDARD
 *   31 – 60      → DOUBTFUL
 *   61 – 90      → LOST
 *   91 – 179     → PASS_WATCH    (legacy pass-and-watch bucket)
 *   ≥ 180        → WRITE_OFF
 *
 * @param daysOverdue  Number of days the loan/instalment is past due.
 * @returns The matching NPL classification key.
 */
export function classifyNPL(daysOverdue: number): keyof typeof NPL_CLASSIFICATIONS {
  if (daysOverdue < 0) return 'OVERDRAFT';
  if (daysOverdue === 0) return 'PERFORMING';
  if (daysOverdue <= 7) return 'WATCHLIST';
  if (daysOverdue <= 30) return 'SUBSTANDARD';
  if (daysOverdue <= 60) return 'DOUBTFUL';
  if (daysOverdue <= 90) return 'LOST';
  if (daysOverdue >= 180) return 'WRITE_OFF';
  return 'PASS_WATCH';
}

// ---------------------------------------------------------------------------
// COMPLIANCE STATUS
// ---------------------------------------------------------------------------

export const COMPLIANCE_STATUSES = {
  PENDING: 'pending',
  CONDITIONS_PENDING: 'conditions_pending',
  CONDITIONS_MET: 'conditions_met',
  CLEARED_FOR_DISBURSEMENT: 'cleared_for_disbursement',
} as const;

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  conditions_pending: 'Conditions Pending',
  conditions_met: 'Conditions Met',
  cleared_for_disbursement: 'Cleared for Disbursement',
};

// ---------------------------------------------------------------------------
// MCC — 8-level approval chain
// ---------------------------------------------------------------------------

export const MCC_ROLES = {
  LO: { code: 'LO', level: 1, label: 'Loan Officer' },
  BM: { code: 'BM', level: 2, label: 'Branch Manager' },
  CA: { code: 'CA', level: 3, label: 'Credit Analyst' },
  HOC: { code: 'HOC', level: 4, label: 'Head of Credit' },
  CRO: { code: 'CRO', level: 5, label: 'Chief Risk Officer' },
  LEGAL: { code: 'LEGAL', level: 6, label: 'Legal Department' },
  GCFO: { code: 'GCFO', level: 7, label: 'Group CFO' },
  MD: { code: 'MD', level: 8, label: 'MD / CEO' },
} as const;

export const MCC_DECISION_TYPES = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DEFERRED: 'deferred',
  CONDITIONAL: 'conditional',
} as const;

// Map internal roleType → MCC role code
export const ROLE_TO_MCC: Record<string, string> = {
  loan: 'LO',
  lo: 'LO',
  officer: 'LO',
  bm: 'BM',
  analyst: 'CA',
  credit_analyst: 'CA',
  hoc: 'HOC',
  cro: 'CRO',
  risk: 'CRO',
  legal: 'LEGAL',
  cfo: 'GCFO',
  md: 'MD',
  super: 'MD',
};

// ---------------------------------------------------------------------------
// KYC STATUS
// ---------------------------------------------------------------------------

export const KYC_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  RESUBMIT: 'RESUBMIT',
} as const;

export const KYC_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  RESUBMIT: 'Resubmit',
};

export const KYC_STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
  RESUBMIT: 'bg-orange-100 text-orange-700',
};

// ---------------------------------------------------------------------------
// RISK GRADES
// ---------------------------------------------------------------------------

export const RISK_GRADES = {
  A: { label: 'Excellent', score: 85, verdict: 'APPROVE', color: 'emerald' },
  B: { label: 'Good', score: 70, verdict: 'APPROVE', color: 'green' },
  C: { label: 'Fair', score: 60, verdict: 'APPROVE', color: 'amber' },
  D: { label: 'Marginal', score: 50, verdict: 'REVIEW', color: 'orange' },
  F: { label: 'Decline', score: 0, verdict: 'REJECT', color: 'red' },
} as const;

export const ENGINE_VERDICTS = {
  APPROVE: 'APPROVE',
  REVIEW: 'REVIEW',
  REJECT: 'REJECT',
} as const;

// ---------------------------------------------------------------------------
// FINANCIAL FORMULAS — all 30+ ratios with hard gates
// ---------------------------------------------------------------------------

export const FORMULA_LIMITS = {
  DSR_GREEN: 35,         // %
  DSR_AMBER: 45,         // %  — HARD GATE
  DSCR_TARGET: 1.25,     // x
  GEARING_LIMIT: 0.35,   // decimal — HARD GATE
  EQUITY_RATIO_MIN: 20,  // %
  SALES_VARIANCE_HIGH: 20,    // %
  SALES_VARIANCE_BLOCK: 25,   // %
  STOCK_COLLATERAL_RATE: 0.10, // 10% of stock value
  BUFFER_RATE: 0.20,     // 20% buffer on regular expenses
  COST_OF_FUND: 0.30,    // 30% p.a.
  ADMIN_COST: 0.05,      // 5% p.a.
  TREASURY_VARIANCE_MAX: 20,  // %
  // C1 FIX: CBN single obligor limit — max exposure per borrower
  SINGLE_OBLIGOR_LIMIT: 50000000, // ₦50M default (adjustable by bank capital)
  SINGLE_OBLIGOR_WARN: 35000000,  // ₦35M warning threshold
  // C3 FIX: Sector exposure limits (% of total portfolio)
  SECTOR_EXPOSURE_MAX: 20, // 20% max per sector
  // C2 FIX: AML thresholds
  AML_CTR_INDIVIDUAL: 5000000,  // ₦5M CTR for individuals
  AML_CTR_CORPORATE: 10000000,  // ₦10M CTR for corporate
} as const;

// FSV haircuts by collateral type (operational truth from tab-security)
export const FSV_HAIRCUTS: Record<string, number> = {
  MOVABLE: 0.80,
  IMMOVABLE: 0.60,
  CASH: 1.00,
};

// ---------------------------------------------------------------------------
// SNAPSHOT KEYS — the 8 governance snapshots
// ---------------------------------------------------------------------------

export const SNAPSHOTS = {
  LO: 'loSnapshot',         // Loan Officer
  BM: 'bmSnapshot',         // Branch Manager
  ANALYST: 'analystSnapshot', // Credit Analyst
  HOC: 'hocSnapshot',       // Head of Credit
  CRO: 'croSnapshot',       // CRO
  CFO: 'cfoSnapshot',       // CFO
  LEGAL: 'legalSnapshot',   // Legal
  MD: 'mdSnapshot',         // MD
} as const;

export const SNAPSHOT_LABELS: Record<string, string> = {
  loSnapshot: 'Loan Officer Snapshot',
  bmSnapshot: 'Branch Manager Snapshot',
  analystSnapshot: 'Analyst Snapshot',
  hocSnapshot: 'Head of Credit Snapshot',
  croSnapshot: 'CRO Risk Certificate',
  cfoSnapshot: 'CFO Liquidity Snapshot',
  legalSnapshot: 'Legal Perfection Snapshot',
  mdSnapshot: 'MD Sanction Snapshot',
};

// ---------------------------------------------------------------------------
// CAM TABS — Universal CAM 12-tab structure (10 core + 2 cross-check tabs)
// ---------------------------------------------------------------------------

export const CAM_TABS = [
  { id: 'profile', label: 'Profile / KYC', icon: 'User' },
  { id: 'business', label: 'Business', icon: 'Building2' },
  { id: 'financials', label: 'Sales Forensics', icon: 'TrendingUp' },
  { id: 'inventory', label: 'Stock Inventory', icon: 'Boxes' },
  { id: 'expenses', label: 'Expenses', icon: 'Receipt' },
  { id: 'assets', label: 'Assets / Balance Sheet', icon: 'Landmark' },
  { id: 'security', label: 'Security & Guarantors', icon: 'ShieldCheck' },
  { id: 'visitation', label: 'Visitation', icon: 'MapPin' },
  { id: 'cross_checks', label: 'Cross-Checks', icon: 'CheckSquare' },
  { id: 'verification', label: 'Verifications', icon: 'ShieldCheck' },
  { id: 'swot', label: 'SWOT & Recommendation', icon: 'Lightbulb' },
  { id: 'engine', label: 'Engine Response', icon: 'Cpu' },
] as const;

// ---------------------------------------------------------------------------
// PRE-DISBURSEMENT CHECKLIST — 8 mandatory items
// ---------------------------------------------------------------------------

export const PRE_DISBURSEMENT_ITEMS = [
  { key: 'allConditionsVerified', label: 'All Compliance Conditions Verified' },
  { key: 'documentsComplete', label: 'Documents Complete' },
  { key: 'customerKycValid', label: 'Customer KYC Valid' },
  { key: 'guarantorKycValid', label: 'Guarantor KYC Valid' },
  { key: 'collateralDocumented', label: 'Collateral Documented' },
  { key: 'offerLetterSigned', label: 'Offer Letter Signed' },
  { key: 'bankAccountVerified', label: 'Bank Account Verified' },
  { key: 'disbursementAccountConfirmed', label: 'Disbursement Account Confirmed' },
] as const;

// ---------------------------------------------------------------------------
// CONDITIONS PRECEDENT TO DRAWDOWN — 22 standard checklist items
// (mirrors the Excel "LOAN CHECK-LIST" sheet)
// ---------------------------------------------------------------------------
// 3 sub-sections: VEHICLE PAPERS PROVIDED (4), LEGAL MORTGAGE PROVIDED (4),
// LOAN SUPPORT DOCUMENT (14). Total = 22.
// `hasSatisfaction` flags items that carry an additional "SATISFACTION" column
// (per the Excel "LEGAL MORTGAGE PROVIDED" block).

export interface ChecklistItemDef {
  id: string;
  label: string;
  category: 'vehiclePapers' | 'legalMortgage' | 'loanSupport';
  hasSatisfaction?: boolean;
}

export const CP_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  // 1. VEHICLE PAPERS PROVIDED (4)
  { id: 'vehicle_license', label: 'Vehicle license', category: 'vehiclePapers' },
  { id: 'proof_of_ownership', label: 'Proof of Ownership', category: 'vehiclePapers' },
  { id: 'insurance', label: 'Insurance', category: 'vehiclePapers' },
  { id: 'road_worthiness', label: 'Road worthiness', category: 'vehiclePapers' },

  // 2. LEGAL MORTGAGE PROVIDED (4) — each carries a SATISFACTION column
  { id: 'deed_of_assignment', label: 'Deed of Assignment', category: 'legalMortgage', hasSatisfaction: true },
  { id: 'c_of_o', label: 'Certificate of Occupancy (C of O)', category: 'legalMortgage', hasSatisfaction: true },
  { id: 'survey_plan', label: 'Survey plan/Purchase receipt', category: 'legalMortgage', hasSatisfaction: true },
  { id: 'valuation_report', label: 'Valuation report', category: 'legalMortgage', hasSatisfaction: true },

  // 3. LOAN SUPPORT DOCUMENT (14)
  { id: 'offer_letter', label: 'Offer Letter', category: 'loanSupport' },
  { id: 'repayment_schedule', label: 'Repayment schedule', category: 'loanSupport' },
  { id: 'cac_document', label: 'CAC document', category: 'loanSupport' },
  { id: 'client_cheque_leaves', label: "Client's Cheque leaves", category: 'loanSupport' },
  { id: 'guarantor_cheque_leaves', label: "Guarantor(s)'s Cheque leaves", category: 'loanSupport' },
  { id: 'bank_account_statement', label: 'Bank account statement', category: 'loanSupport' },
  { id: 'pledged_property_picture', label: 'Coloured picture of the pledged property', category: 'loanSupport' },
  { id: 'visitation_report', label: 'Visitation Report', category: 'loanSupport' },
  { id: 'vehicle_tracking', label: 'Vehicle tracking', category: 'loanSupport' },
  { id: 'pledged_deed', label: 'Pledged Deed', category: 'loanSupport' },
  { id: 'deed_of_conveyance', label: 'Deed of Conveyance', category: 'loanSupport' },
  { id: 'consent_letter', label: 'Consent Letter', category: 'loanSupport' },
  { id: 'sworn_affidavit', label: 'Sworn Affidavit', category: 'loanSupport' },
  { id: 'security_agreement', label: 'Security agreement', category: 'loanSupport' },
];

export const CP_CHECKLIST_TOTAL = CP_CHECKLIST_ITEMS.length; // 22

export const CP_CHECKLIST_CATEGORIES = [
  {
    id: 'vehiclePapers',
    title: 'VEHICLE PAPERS PROVIDED',
    items: CP_CHECKLIST_ITEMS.filter((i) => i.category === 'vehiclePapers'),
  },
  {
    id: 'legalMortgage',
    title: 'LEGAL MORTGAGE PROVIDED',
    items: CP_CHECKLIST_ITEMS.filter((i) => i.category === 'legalMortgage'),
  },
  {
    id: 'loanSupport',
    title: 'LOAN SUPPORT DOCUMENT',
    items: CP_CHECKLIST_ITEMS.filter((i) => i.category === 'loanSupport'),
  },
] as const;

// ---------------------------------------------------------------------------
// COLLATERAL DOCUMENT TYPES — the document kinds that may be lodged against a
// pledged collateral item, each carrying its own upload + optional expiry date
// (Excel TAB-SECURITY "Collateral Documents" block).
// ---------------------------------------------------------------------------

export const COLLATERAL_DOCUMENT_TYPES = [
  'Proof of Ownership',
  'Vehicle License',
  'Insurance',
  'Roadworthiness',
  'Certificate of Occupancy (C of O)',
  'Deed of Assignment',
  'Survey Plan',
  'Payment Receipt',
  'Other',
] as const;

// ---------------------------------------------------------------------------
// ONBOARDING CHANNELS
// ---------------------------------------------------------------------------

export const ONBOARDING_CHANNELS = {
  SELF: 'self_onboard',
  DESK: 'desk_onboard',
  BM: 'bm_onboard',
  FIELD: 'field_onboard',
} as const;

export const ONBOARDING_CHANNEL_LABELS: Record<string, string> = {
  self_onboard: 'Customer Self-Registration',
  desk_onboard: 'Frontdesk Registration',
  bm_onboard: 'Branch Manager Registration',
  field_onboard: 'Field Onboarding',
};

// ---------------------------------------------------------------------------
// NIGERIAN STATES (37 incl. FCT)
// ---------------------------------------------------------------------------

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

// ---------------------------------------------------------------------------
// CURRENCIES, BANKS
// ---------------------------------------------------------------------------

export const NIGERIAN_BANKS = [
  'Access Bank', 'Zenith Bank', 'Guaranty Trust Bank', 'First Bank of Nigeria',
  'United Bank for Africa', 'FCMB', 'Union Bank', 'Ecobank Nigeria',
  'Sterling Bank', 'Wema Bank', 'Fidelity Bank', 'Polaris Bank',
  'Stanbic IBTC', 'Standard Chartered', 'Citibank Nigeria', 'Keystone Bank',
  'Unity Bank', 'Suntrust Bank', 'Providus Bank', 'Jaiz Bank',
  'Titan Trust Bank', 'PalmPay', 'Opay', 'Kuda Bank',
  'Rubies Bank', 'Signature Bank', 'Suntrust Bank',
];

// ---------------------------------------------------------------------------
// AUDIT — actions, modules, severities
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  'created', 'updated', 'deleted', 'approved', 'rejected', 'queried',
  'forwarded', 'returned', 'logged_in', 'logged_out', 'disbursed',
  'verified', 'waived', 'escalated', 'downloaded', 'exported',
] as const;

export const AUDIT_MODULES = [
  'auth', 'user', 'business', 'loan', 'appraisal', 'mcc', 'compliance',
  'risk', 'audit', 'treasury', 'accounting', 'savings', 'investment',
  'ticket', 'settings', 'staff', 'branch', 'kyc',
] as const;

export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export const AUDIT_SEVERITY_BADGES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

// ---------------------------------------------------------------------------
// BRANCH TYPES, SECTORS, DEFAULTS
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SECTORS — expanded to 60+ business natures (mirrors Excel Sheet1 lookup)
// Each entry: name, riskScore (0-1, higher=safer), benchmarkedMargin (decimal %)
// Source: Excel "Sheet1" rows 2-80, column I (business nature) + J (margin)
// ---------------------------------------------------------------------------

export const DEFAULT_SECTORS = [
  // Original 10 high-level sectors (kept for backward compatibility)
  { name: 'Automobile (Spare Parts)', riskScore: 0.4, benchmarkedMargin: 22.5 },
  { name: 'Food & Beverage', riskScore: 0.5, benchmarkedMargin: 18.0 },
  { name: 'Fashion & Textiles', riskScore: 0.6, benchmarkedMargin: 28.0 },
  { name: 'Electronics / Gadgets', riskScore: 0.4, benchmarkedMargin: 15.0 },
  { name: 'Building Materials', riskScore: 0.3, benchmarkedMargin: 12.0 },
  { name: 'Pharmaceuticals', riskScore: 0.3, benchmarkedMargin: 20.0 },
  { name: 'General Merchandise', riskScore: 0.5, benchmarkedMargin: 18.0 },
  { name: 'Agriculture / Farming', riskScore: 0.7, benchmarkedMargin: 25.0 },
  { name: 'Services / Professional', riskScore: 0.4, benchmarkedMargin: 35.0 },
  { name: 'Transport & Logistics', riskScore: 0.6, benchmarkedMargin: 22.0 },

  // G5: Expanded granular business natures from Excel Sheet1 (60+ entries)
  { name: 'Sales of hair extension/accessories', riskScore: 0.5, benchmarkedMargin: 20.41 },
  { name: 'Cosmetics', riskScore: 0.5, benchmarkedMargin: 19.00 },
  { name: 'Sales of wood', riskScore: 0.4, benchmarkedMargin: 22.72 },
  { name: 'Sales of Phone accessories', riskScore: 0.4, benchmarkedMargin: 19.65 },
  { name: 'Sales of Tyres (General Auto)', riskScore: 0.4, benchmarkedMargin: 18.31 },
  { name: 'Sales of Trucks spare parts', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Sales Agro-allied products', riskScore: 0.6, benchmarkedMargin: 19.22 },
  { name: 'Sales of Baby Items', riskScore: 0.5, benchmarkedMargin: 18.00 },
  { name: 'Aluminium profiles and accessories', riskScore: 0.4, benchmarkedMargin: 14.62 },
  { name: 'Fabrication and sale of aluminium', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Sales of Suspended Ceiling', riskScore: 0.4, benchmarkedMargin: 15.90 },
  { name: 'Sales of POP', riskScore: 0.4, benchmarkedMargin: 22.36 },
  { name: 'Sales of Plank', riskScore: 0.4, benchmarkedMargin: 18.62 },
  { name: 'Sales of provision and groceries', riskScore: 0.5, benchmarkedMargin: 11.05 },
  { name: 'Sales of Auto-paints', riskScore: 0.4, benchmarkedMargin: 20.46 },
  { name: 'Sales of iPhone and accessories', riskScore: 0.4, benchmarkedMargin: 18.93 },
  { name: 'Sales of Pharmaceutical products', riskScore: 0.3, benchmarkedMargin: 22.62 },
  { name: 'Sales of Cellotape', riskScore: 0.5, benchmarkedMargin: 25.00 },
  { name: 'Sales of fabric and textile', riskScore: 0.6, benchmarkedMargin: 19.28 },
  { name: 'Sales of Palm Oil', riskScore: 0.6, benchmarkedMargin: 15.00 },
  { name: 'Sale of alcoholic drinks', riskScore: 0.5, benchmarkedMargin: 10.01 },
  { name: 'Sale of non-alcoholic drinks', riskScore: 0.5, benchmarkedMargin: 8.13 },
  { name: 'Sales of assorted wines', riskScore: 0.5, benchmarkedMargin: 20.44 },
  { name: 'Iron and steel rods', riskScore: 0.3, benchmarkedMargin: 11.35 },
  { name: 'Water production/beverage distribution', riskScore: 0.5, benchmarkedMargin: 25.00 },
  { name: 'Sales of footwears', riskScore: 0.6, benchmarkedMargin: 11.32 },
  { name: 'Haulage/Logistics', riskScore: 0.6, benchmarkedMargin: 77.89 },
  { name: 'Cooking Gas/home accessories', riskScore: 0.5, benchmarkedMargin: 11.00 },
  { name: 'Food chemicals', riskScore: 0.4, benchmarkedMargin: 7.19 },
  { name: 'Production of paints', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Production and sale of polythene', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Building materials (roofing)', riskScore: 0.3, benchmarkedMargin: 16.55 },
  { name: 'Hospital', riskScore: 0.3, benchmarkedMargin: 25.00 },
  { name: 'School laboratory equipment', riskScore: 0.4, benchmarkedMargin: 23.00 },
  { name: 'Automobile spare-parts', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Building block production/installation', riskScore: 0.3, benchmarkedMargin: 20.00 },
  { name: 'Bakery/Confectionaries', riskScore: 0.5, benchmarkedMargin: 15.00 },
  { name: 'Sale of PVC water pipes and fittings', riskScore: 0.4, benchmarkedMargin: 19.72 },
  { name: 'Sales of Mobile phones', riskScore: 0.4, benchmarkedMargin: 21.00 },
  { name: 'Butchers/sale of meat', riskScore: 0.5, benchmarkedMargin: 21.36 },
  { name: 'Welding Service (Metal/Tank)', riskScore: 0.4, benchmarkedMargin: 22.00 },
  { name: 'Electrical home accessories', riskScore: 0.4, benchmarkedMargin: 15.14 },
  { name: 'Printing Materials and printing services', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Sales of clothings and boutique', riskScore: 0.6, benchmarkedMargin: 15.61 },
  { name: 'Sale of industrial papers', riskScore: 0.4, benchmarkedMargin: 19.37 },
  { name: 'Sales of Alubond sheet', riskScore: 0.4, benchmarkedMargin: 21.35 },
  { name: 'General building materials', riskScore: 0.3, benchmarkedMargin: 18.55 },
  { name: 'Sales of cars', riskScore: 0.4, benchmarkedMargin: 22.76 },
  { name: 'Sales of Laminated Wood/HDF', riskScore: 0.4, benchmarkedMargin: 20.19 },
  { name: 'Sales of Metal Scrap', riskScore: 0.4, benchmarkedMargin: 22.31 },
  { name: 'Animal feeds', riskScore: 0.6, benchmarkedMargin: 10.19 },
  { name: 'Sales of Iron and building materials', riskScore: 0.3, benchmarkedMargin: 13.45 },
  { name: 'Sales of electronics and Computers', riskScore: 0.4, benchmarkedMargin: 17.29 },
  { name: 'Sales of Car engine', riskScore: 0.4, benchmarkedMargin: 16.96 },
  { name: 'Sales of Electronics', riskScore: 0.4, benchmarkedMargin: 20.13 },
  { name: 'Sales of frozen food', riskScore: 0.5, benchmarkedMargin: 10.70 },
  { name: 'Mattress and pillow', riskScore: 0.5, benchmarkedMargin: 14.87 },
  { name: 'Sales of electrical material', riskScore: 0.4, benchmarkedMargin: 24.00 },
  { name: 'Sales of PMS (Petroleum Product)', riskScore: 0.3, benchmarkedMargin: 9.78 },
  { name: 'Sales recharge cards', riskScore: 0.5, benchmarkedMargin: 7.99 },
  { name: 'Sales of rechargeable and storage', riskScore: 0.5, benchmarkedMargin: 18.53 },
  { name: 'Sales of truck head and spare parts', riskScore: 0.4, benchmarkedMargin: 14.00 },
  { name: 'Poultry farming/sale of eggs', riskScore: 0.6, benchmarkedMargin: 16.80 },
  { name: 'Sales of industrial electrical', riskScore: 0.4, benchmarkedMargin: 21.00 },
  { name: 'Fabrication and sale of furniture', riskScore: 0.4, benchmarkedMargin: 25.00 },
  { name: 'Sales of sesame seeds, cashew nuts', riskScore: 0.6, benchmarkedMargin: 12.69 },
  { name: 'Sales of foodstuffs (garri, rice)', riskScore: 0.5, benchmarkedMargin: 13.69 },
  { name: 'Sales of building doors (imported)', riskScore: 0.3, benchmarkedMargin: 22.35 },
  { name: 'General industrial chemicals', riskScore: 0.4, benchmarkedMargin: 22.65 },
  { name: 'Tailoring materials', riskScore: 0.6, benchmarkedMargin: 19.25 },
  { name: 'Hotel/hospitality', riskScore: 0.5, benchmarkedMargin: 77.89 },
  { name: 'Production of tissue paper/hand towel', riskScore: 0.4, benchmarkedMargin: 23.00 },
  { name: "Ladies clothes", riskScore: 0.6, benchmarkedMargin: 18.00 },
  { name: 'Medical & scientific equipment', riskScore: 0.3, benchmarkedMargin: 22.62 },
  { name: 'Sales of bags', riskScore: 0.6, benchmarkedMargin: 21.95 },
  { name: 'Sales of furniture', riskScore: 0.4, benchmarkedMargin: 19.16 },
  { name: 'Production of furniture', riskScore: 0.4, benchmarkedMargin: 25.00 },
];

// ---------------------------------------------------------------------------
// G13: LOCATION RATINGS — 60+ Nigerian locations with risk ratings 0-9
// Mirrors Excel Sheet1 columns C (location) + D (rating)
// Rating scale: 0=Free Zone, 1-3=Low risk, 4-6=Medium risk, 7-9=High risk
// Used by checkZonification() in credit-engine.ts
// ---------------------------------------------------------------------------

export interface LocationRating {
  name: string;
  rating: number; // 0-9
  state?: string; // Nigerian state
}

export const LOCATION_RATINGS: LocationRating[] = [
  // Lagos State locations (rating 3 = low risk, well-served)
  { name: 'YABA', rating: 3, state: 'Lagos' },
  { name: 'TEJUOSHO', rating: 3, state: 'Lagos' },
  { name: 'OJUELEGBA', rating: 3, state: 'Lagos' },
  { name: 'SURULERE', rating: 3, state: 'Lagos' },
  { name: 'EBUTE-METTA', rating: 3, state: 'Lagos' },
  { name: 'OYINGBO', rating: 3, state: 'Lagos' },
  { name: 'LAGOS ISLAND', rating: 3, state: 'Lagos' },
  { name: 'LEKKI', rating: 3, state: 'Lagos' },
  { name: 'AJAH', rating: 3, state: 'Lagos' },
  { name: 'VICTORIA ISLAND', rating: 3, state: 'Lagos' },
  { name: 'OBALENDE', rating: 3, state: 'Lagos' },
  { name: 'APAPA ROAD', rating: 3, state: 'Lagos' },
  { name: 'APAPA WHARF', rating: 3, state: 'Lagos' },
  { name: 'MUSHIN', rating: 3, state: 'Lagos' },
  { name: 'JIBOWU', rating: 3, state: 'Lagos' },
  { name: 'OBANIKORO', rating: 3, state: 'Lagos' },
  { name: 'IKORODU', rating: 4, state: 'Lagos' },
  { name: 'KETU', rating: 4, state: 'Lagos' },
  { name: 'OJOTA', rating: 4, state: 'Lagos' },
  { name: 'SAGAMU-SABO', rating: 4, state: 'Ogun' },
  { name: 'OGIJO', rating: 4, state: 'Ogun' },
  { name: 'IGBOGBO', rating: 4, state: 'Lagos' },
  { name: 'AGRIC-ISAWO', rating: 4, state: 'Lagos' },
  { name: 'TRADE-FAIR', rating: 6, state: 'Lagos' },
  { name: 'MILE-2', rating: 6, state: 'Lagos' },
  { name: 'OJO', rating: 6, state: 'Lagos' },
  { name: 'IKOTUN', rating: 6, state: 'Lagos' },
  { name: 'IGANDO', rating: 6, state: 'Lagos' },
  { name: 'EGBEDA', rating: 6, state: 'Lagos' },
  { name: 'IYANA-IPAJA', rating: 6, state: 'Lagos' },
  { name: 'AYOBO', rating: 6, state: 'Lagos' },
  { name: 'ORILE', rating: 6, state: 'Lagos' },
  { name: 'ODUNADE', rating: 6, state: 'Lagos' },
  { name: 'IGBO-ELERIN', rating: 6, state: 'Lagos' },
  { name: 'AGBARA', rating: 6, state: 'Ogun' },
  { name: 'ALABA', rating: 6, state: 'Lagos' },
  { name: 'IKEJA', rating: 7, state: 'Lagos' },
  { name: 'OREGUN-OJOTA', rating: 7, state: 'Lagos' },
  { name: 'OJODU-BERGER', rating: 7, state: 'Lagos' },
  { name: 'SECRETARIAT', rating: 7, state: 'Lagos' },
  { name: 'OSHODI-ARENA', rating: 7, state: 'Lagos' },
  { name: 'ABULE-EGBA', rating: 7, state: 'Lagos' },
  { name: 'MERAN', rating: 7, state: 'Lagos' },
  { name: 'IJAYE', rating: 7, state: 'Lagos' },
  { name: 'AGEGE', rating: 7, state: 'Lagos' },
  { name: 'IJU-ISHAGA', rating: 7, state: 'Lagos' },
  { name: 'OGBA', rating: 7, state: 'Lagos' },
  { name: 'SANGO', rating: 7, state: 'Ogun' },
  // Oyo State
  { name: 'IBADAN', rating: 2, state: 'Oyo' },
  { name: 'SAKI', rating: 2, state: 'Oyo' },
  { name: 'IGBOHO', rating: 2, state: 'Oyo' },
  { name: 'OYO TOWN', rating: 2, state: 'Oyo' },
  // Ogun State
  { name: 'ABEOKUTA', rating: 1, state: 'Ogun' },
  { name: 'ILARO', rating: 1, state: 'Ogun' },
  { name: 'IFO', rating: 1, state: 'Ogun' },
  // FCT
  { name: 'ABUJA', rating: 5, state: 'FCT' },
  // Edo State
  { name: 'BENIN', rating: 8, state: 'Edo' },
  // Osun State
  { name: 'OSHOGBO', rating: 9, state: 'Osun' },
  // Free Zone
  { name: 'FREE ZONE', rating: 0, state: 'Lagos' },
];

// Helper: lookup location rating by name (case-insensitive, partial match)
export function lookupLocationRating(locationName: string): LocationRating | null {
  if (!locationName) return null;
  const normalized = locationName.toUpperCase().trim();
  // Exact match first
  const exact = LOCATION_RATINGS.find((l) => l.name === normalized);
  if (exact) return exact;
  // Partial match (location name contains the search term or vice versa)
  const partial = LOCATION_RATINGS.find(
    (l) => normalized.includes(l.name) || l.name.includes(normalized),
  );
  return partial || null;
}

// ---------------------------------------------------------------------------
// G12: LOAN STATUS TAXONOMY — expanded from 5 to 8 statuses
// Mirrors Excel Sheet1 rows 23-31
// ---------------------------------------------------------------------------

export const LOAN_STATUS_TAXONOMY = [
  'Performing',
  'Pass & Watch',
  'Substandard',
  'Doubtful',
  'Lost',
  'Watchlist',
  'Write Off',
  'Overdraft',
] as const;

export const LEGAL_STRUCTURES = [
  'Individual / Enterprise',
  'Partnership',
  'Limited Liability (Ltd)',
  'Public Limited Company (PLC)',
  'Cooperative Society',
];

export const ID_DOCUMENT_TYPES = [
  'NIN Slip',
  "Driver's License",
  'International Passport',
  'Voters Card',
];

export const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual / Petty Trader (No CAC)' },
  { value: 'registered', label: 'Registered Company (Have CAC)' },
];

// ---------------------------------------------------------------------------
// PERMISSION FLAGS — all boolean permission columns on Admin
// ---------------------------------------------------------------------------

export const PERMISSION_FLAGS = [
  // Loan workflow
  'loanOrigination', 'loanVetting', 'loanStructuring', 'loanAnalyst',
  'loanRisk', 'loanLegal', 'loanCfoReview', 'loanFinalization',
  'loanDisbursement', 'loanPortfolio', 'loanSupervisor', 'loanMcc',
  // Module access
  'onboarding', 'kycVerify', 'accountingView', 'accountingPost',
  'treasuryOnboard', 'treasuryBook', 'treasuryAssets', 'branchManage',
  'auditAccess', 'internalControl', 'compliance', 'reportsGlobal',
  'generalSettings', 'message', 'support',
  // v26 — Customer Service granular toggles
  'csKycVerify', 'csPaymentVerify',
  // v26 — Legal dual role toggles
  'legalCacSearch', 'legalMcc',
] as const;

// Role → implicit permissions
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super: ['*'], // wildcard
  md: ['loanMcc', 'loanFinalization', 'generalSettings', 'loanPortfolio', 'reportsGlobal'],
  cfo: ['loanCfoReview', 'loanDisbursement', 'accountingView', 'accountingPost', 'treasuryBook', 'treasuryAssets', 'reportsGlobal'],
  hoc: ['loanStructuring', 'loanFinalization', 'loanPortfolio', 'loanSupervisor'],
  cro: ['loanRisk', 'internalControl', 'reportsGlobal'],
  legal: ['loanLegal', 'compliance', 'legalCacSearch', 'legalMcc'],
  cs: ['csKycVerify', 'csPaymentVerify', 'kycVerify', 'support', 'message'],
  bm: ['loanVetting', 'loanOrigination', 'onboarding', 'kycVerify', 'branchManage', 'loanPortfolio'],
  analyst: ['loanAnalyst'],
  credit_analyst: ['loanAnalyst'],
  loan: ['loanOrigination', 'onboarding'],
  frontdesk: ['onboarding', 'support', 'message'],
  treasury: ['treasuryOnboard', 'treasuryBook', 'treasuryAssets', 'accountingView'],
  admin: ['generalSettings', 'auditAccess', 'reportsGlobal'],
};

export function hasPermission(admin: { role: string; [k: string]: any } | null, permission: string): boolean {
  if (!admin) return false;
  if (admin.role === 'super') return true;
  const rolePerms = ROLE_PERMISSIONS[admin.role] || [];
  if (rolePerms.includes('*') || rolePerms.includes(permission)) return true;
  // Check explicit boolean flag on admin object
  return admin[permission] === true;
}

export function hasAnyPermission(admin: { role: string; [k: string]: any } | null, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(admin, p));
}

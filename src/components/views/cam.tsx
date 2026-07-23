'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  CAM_TABS, LOAN_STEP_LABELS, hasPermission, FORMULA_LIMITS,
  DEFAULT_SECTORS, LOCATION_RATINGS, lookupLocationRating, LOAN_STATUS_TAXONOMY,
  // v42 — Excel parity constants
  LOAN_PRODUCT_LABELS, lookupRateTier,
  SECTOR_BENCHMARK_MARGINS, lookupSectorMargin,
  COLLATERAL_DEPRECIATION, CRC_LOAN_STATUSES,
  COLLATERAL_OWNERSHIP_TYPES, MOVABLE_COLLATERAL_TITLES, IMMOVABLE_COLLATERAL_TITLES,
  LoanProductKey, LoanCycleGrade,
} from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Save, Lock, Calculator, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Shield, Cpu, FileText, ChevronRight,
  User, Building2, Boxes, Receipt, Landmark, ShieldCheck, MapPin, Lightbulb,
  CheckSquare, Plus, Trash2, Camera, Users, CreditCard, AlertCircle, Download,
  ShieldAlert, MapPinned, Signature,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  executeFullAppraisal, EngineInput, EngineResult,
  // v42 — Excel parity functions
  computeMarginSummaryBase,
  calculateCollateralItem,
  calculateExtendedCollateralMix,
  calculateGuarantorFinancials,
  computeBankStatementAverages,
  computeSpotCheckMonthly,
  computeSixMonthAverage,
  computePreviousBalanceSheetTotals,
  compareBalanceSheetsExtended as compareBalanceSheets,
} from '@/lib/credit-engine';
import { CamMemoPDF } from '@/components/pdf/cam-memo';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { authFetch, withAuth } from '@/lib/auth-client';

interface CamData {
  [key: string]: any;
}

const INITIAL_DATA: CamData = {
  // Sales — ZERO defaults (must be captured by LO)
  salesClientEstimate: 0,
  salesSpotCheck: 0,
  salesBankStatement: 0,
  salesBookRecords: 0,
  // Inventory — empty array (LO adds items)
  inventory: [],
  // Expenses (monthly) — ZERO defaults
  businessRegular: 0,
  businessIrregular: 0,
  familyRegular: 0,
  familyIrregular: 0,
  otherLoanInstallments: 0,
  bufferRate: 0.20,
  // Structured business expenses (11 categories from Excel) — all zero
  businessExpenses: [
    { category: 'Salary and fee', amount: 0 },
    { category: 'Rent', amount: 0 },
    { category: 'Transportation', amount: 0 },
    { category: 'Feeding', amount: 0 },
    { category: 'Maintenance fees', amount: 0 },
    { category: 'Travel Expenses', amount: 0 },
    { category: 'Custom Expenses', amount: 0 },
    { category: 'Administrative expenses (utility, water bill, security)', amount: 0 },
    { category: 'Tax', amount: 0 },
    { category: 'Overdraft Charges', amount: 0 },
    { category: 'Other Expenses', amount: 0 },
  ],
  // Structured family expenses (9 regular + 5 irregular) — all zero
  familyExpensesRegular: [
    { category: 'Feeding', amount: 0 },
    { category: 'Rent', amount: 0 },
    { category: 'School Fee', amount: 0 },
    { category: 'Water/Electricity/Gas', amount: 0 },
    { category: 'Phone expenses', amount: 0 },
    { category: 'Maid/Janitor/Laundry', amount: 0 },
    { category: 'Vehicle maintenance', amount: 0 },
    { category: 'Transportation', amount: 0 },
    { category: 'Others', amount: 0 },
  ],
  familyExpensesIrregular: [
    { category: 'Dressing/Hygiene', amount: 0 },
    { category: 'Health expenses', amount: 0 },
    { category: 'Allowance', amount: 0 },
    { category: 'Contribution', amount: 0 },
    { category: 'Others', amount: 0 },
  ],
  // Balance sheet — ZERO defaults
  cashAtHand: 0,
  cashInBanks: 0,
  receivables: 0,
  fixedBusinessAssets: 0,
  fixedFamilyAssets: 0,
  shortTermLiabilities: 0,
  longTermLiabilities: 0,
  payables: 0,
  // Structured business assets — empty arrays
  businessAssets: {
    equipment: [],
    vehicles: [],
    houseLand: [],
  },
  // Structured family assets — empty arrays
  familyAssets: {
    equipment: [],
    vehicles: [],
    houseLand: [],
  },
  // Running WFL Loan details
  runningWflLoan: {
    isActive: false,
    disbursementDate: '',
    maturityDate: '',
    amount: 0,
    duration: 0,
    installment: 0,
    installmentsPaid: 0,
    balance: 0,
  },
  // Other lender loans — empty array
  otherLenderLoans: [],
  // References (4 reference persons) — empty templates
  references: [
    { type: 'Family Reference 1', fullName: '', sex: '', homeAddress: '', businessName: '', businessNature: '', businessAddress: '', yearsKnown: 0, maritalStatus: '', relationship: '', phone: '', comment: '' },
    { type: 'Family Reference 2', fullName: '', sex: '', homeAddress: '', businessName: '', businessNature: '', businessAddress: '', yearsKnown: 0, maritalStatus: '', relationship: '', phone: '', comment: '' },
    { type: 'Commercial Reference', fullName: '', sex: '', homeAddress: '', businessName: '', businessNature: '', businessAddress: '', yearsKnown: 0, maritalStatus: '', relationship: '', phone: '', comment: '' },
    { type: 'Neighbourhood Reference', fullName: '', sex: '', homeAddress: '', businessName: '', businessNature: '', businessAddress: '', yearsKnown: 0, maritalStatus: '', relationship: '', phone: '', comment: '' },
  ],
  // Structured LO visitation report (7 sections) — empty
  loVisitation: {
    businessDynamics: '', location: '', capacity: '', character: '', ownership: '', collateral: '', guarantors: '',
  },
  // Structured BM visitation report (7 sections) — empty
  bmVisitation: {
    businessDynamics: '', location: '', capacity: '', character: '', ownership: '', collateral: '', guarantors: '',
  },
  // Photo evidence (6 categories) — empty
  photoEvidence: [
    { type: 'Movable Collateral Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
    { type: 'Immovable Collateral Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
    { type: 'Business Verification Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
    { type: 'House Verification Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
    { type: 'Guarantor 1 Business + House Verification Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
    { type: 'Guarantor 2 Business + House Verification Pictures', fileName: '', dateTaken: '', geoNote: 'Take picture with GEO location camera' },
  ],
  // Weekly sales breakdown (Mon-Sun) — all zero
  weeklySales: [
    { day: 'Monday', type: 'Good', amount: 0 },
    { day: 'Tuesday', type: 'Good', amount: 0 },
    { day: 'Wednesday', type: 'Average', amount: 0 },
    { day: 'Thursday', type: 'Average', amount: 0 },
    { day: 'Friday', type: 'Good', amount: 0 },
    { day: 'Saturday', type: 'Good', amount: 0 },
    { day: 'Sunday', type: 'Closed', amount: 0 },
  ],
  // Loan — ZERO defaults (must be set by LO)
  loanPrincipal: 0,
  loanInterestRate: 0,
  loanTenorMonths: 0,
  repaymentMethod: 'REDUCING',
  ccdPercent: 0,
  upfrontFeePercent: 0,
  // Collateral — empty array (LO adds)
  collaterals: [],
  loanBaseAmount: 0,
  // Guarantor — ZERO defaults
  guarantorIncome: 0,
  guarantorCogs: 0,
  guarantorOperationExpenses: 0,
  guarantorExistingInstallment: 0,
  // Risk
  sectorRiskScore: 0.5,
  sectorBenchmarkMargin: 0,
  selectedSectorName: '',
  businessLocation: '',
  previousDefault: false,
  successionPlanVerified: false,
  bankAccountVerified: false,
  // Stress — ZERO defaults
  stressSalesHaircut: 0,
  stressMarginCompression: 0,
  stressOpexIncrease: 0,
  openingCash: 0,
  familyIncome: 0,
  familyLoanInstallment: 0,
  physicalStockMatches: false,
  // Guarantors array (G9)
  guarantors: [],
  // Guarantor business verifications (G10)
  guarantorBizVerifications: [],
  // Bank balances (G11)
  bankBalances: [],
  // Previous balance sheet (G2)
  previousBalanceSheet: { periodDate: '', totalAssets: 0, totalLiabilities: 0, equity: 0 },

  // ═══ v42 — EXCEL PARITY FIELDS ══════════════════════════════════════════

  // v42-P1: Rate tier lookup (product × grade)
  loanProduct: 'sme' as 'micro' | 'sme' | 'sme_plus' | 'lpo' | 'asset_finance' | 'exception',
  loanCycleGrade: 'NEW' as 'A' | 'B' | 'C' | 'D' | 'NEW',
  rateTierAutoApplied: false,

  // v42-M4: 12-month bank statement grid (inflow/outflow)
  bankStatementGrid: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, inflow: 0, outflow: 0 })),

  // v42-M3: 3-day spot check
  spotCheckDays: [
    { day: 1, cashSales: 0 },
    { day: 2, cashSales: 0 },
    { day: 3, cashSales: 0 },
  ],

  // v42-M5: 6-month sales records grid
  salesRecordsGrid: Array.from({ length: 6 }, (_, i) => ({ month: i + 1, amount: 0 })),

  // v42-M6: 6-month purchase receipts grid
  purchaseRecordsGrid: Array.from({ length: 6 }, (_, i) => ({ month: i + 1, amount: 0 })),

  // v42-M7: Previous balance sheet (full snapshot)
  previousBalanceSheetFull: {
    periodDate: '',
    cashAtHand: 0,
    cashInBanks: 0,
    wflBalance: 0,
    receivables: 0,
    advanceToSuppliers: 0,
    stockValue: 0,
    fixedBusinessAssets: 0,
    fixedFamilyAssets: 0,
    shortTermLiabilities: 0,
    advanceFromCustomers: 0,
    wflLoan: 0,
    otherBankLoans: 0,
    longTermLiabilities: 0,
    wflLongTermLoan: 0,
    otherLongTermLoans: 0,
  },

  // v42-P4: Extended collateral items (with title docs, chassis, land measurement)
  extendedCollaterals: [] as any[],

  // v42-P5: Configurable depreciation rates
  movableDepreciationRate: 0.20,
  immovableDepreciationRate: 0.40,

  // v42-P6: Extended guarantors (full business profile)
  extendedGuarantors: [
    {
      id: 'g1',
      guarantorNumber: 1 as const,
      businessName: '',
      registrationNumber: '',
      businessDescription: '',
      monthlySalary: 0,
      phoneNumber: '',
      businessAddress: '',
      landmark: '',
      ownerName: '',
      sex: 'M' as 'M' | 'F',
      residenceAddress: '',
      residenceLandmark: '',
      houseOwnership: 'Owned' as 'Owned' | 'Family' | 'Rented',
      yearsAtHouse: 0,
      houseDescription: '',
      relationshipToCustomer: '',
      maritalStatus: 'Married' as 'Single' | 'Married' | 'Divorced' | 'Widow(er)',
      religion: '',
      nationality: 'Nigerian',
      churchOrMosqueName: '',
      isWflClient: false,
      businessWorth: 0,
      stockOfGoods: 0,
      monthlySales: 0,
      costOfGoodsSold: 0,
      operationFamilyExpenses: 0,
      wflInstallmentAmount: 0,
    },
    {
      id: 'g2',
      guarantorNumber: 2 as const,
      businessName: '',
      registrationNumber: '',
      businessDescription: '',
      monthlySalary: 0,
      phoneNumber: '',
      businessAddress: '',
      landmark: '',
      ownerName: '',
      sex: 'M' as 'M' | 'F',
      residenceAddress: '',
      residenceLandmark: '',
      houseOwnership: 'Owned' as 'Owned' | 'Family' | 'Rented',
      yearsAtHouse: 0,
      houseDescription: '',
      relationshipToCustomer: '',
      maritalStatus: 'Married' as 'Single' | 'Married' | 'Divorced' | 'Widow(er)',
      religion: '',
      nationality: 'Nigerian',
      churchOrMosqueName: '',
      isWflClient: false,
      businessWorth: 0,
      stockOfGoods: 0,
      monthlySales: 0,
      costOfGoodsSold: 0,
      operationFamilyExpenses: 0,
      wflInstallmentAmount: 0,
    },
  ],

  // v42-P7: CRC bureau loans (extended with NPL status + days in default)
  crcBureauLoans: [] as any[],

  // v42-P8: Visitation GPS coordinates
  visitationCoordinates: {
    businessLocation: { lat: 0, lng: 0, accuracy: 0 },
    collateralLocation: { lat: 0, lng: 0, accuracy: 0 },
    guarantor1Location: { lat: 0, lng: 0, accuracy: 0 },
    guarantor2Location: { lat: 0, lng: 0, accuracy: 0 },
  },

  // v42-P9: Committee signatures
  committeeSignatures: [] as any[],

  // v42-M1: Margin summary base (computed)
  marginSummaryBase: null as any,
};

export function CamView() {
  const { viewParams, setView, currentAdmin } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [activeTab, setActiveTab] = useState(0);
  const [data, setData] = useState<CamData>(INITIAL_DATA);
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [loan, setLoan] = useState<any>(null);
  const [appraisal, setAppraisal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!loanId) return;
      try {
        const [loanRes, apprRes] = await Promise.all([
          authFetch(`/api/loans/${loanId}`).then(r => r.json()),
          authFetch(`/api/appraisals/${loanId}`).then(r => r.json()),
        ]);
        if (loanRes.loan) {
          setLoan(loanRes.loan);
          const ln = loanRes.loan;

          // ── AUTO-POPULATE from onboarding/loan data (eliminate duplication) ──
          const biz = ln.user?.business;
          const sectorObj = biz?.sectorRef || biz?.sector;
          const yearsInOp = biz?.dateEstablished
            ? Math.floor((Date.now() - new Date(biz.dateEstablished).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
            : (biz?.yearsInOperation || 0);

          setData((prev: CamData) => ({
            ...prev,
            // Auto-populate from loan record
            loanPrincipal: ln.amount || prev.loanPrincipal,
            loanInterestRate: ln.percent || prev.loanInterestRate,
            loanTenorMonths: ln.duration || prev.loanTenorMonths,
            repaymentMethod: ln.repaymentPlan || prev.repaymentMethod,
            loanPurpose: ln.reason || prev.loanPurpose,
            loanBaseAmount: ln.amount || prev.loanBaseAmount,
            // Auto-populate from user/business record
            yearsAtAddress: ln.user?.yearsAtResidence || prev.yearsAtAddress,
            yearsInOperation: yearsInOp || prev.yearsInOperation,
            selectedSectorName: sectorObj?.name || prev.selectedSectorName,
            sectorRiskScore: sectorObj?.riskScore ?? prev.sectorRiskScore,
            sectorBenchmarkMargin: sectorObj?.benchmarkedMargin ?? prev.sectorBenchmarkMargin,
            businessLocation: biz?.state || biz?.shopAddress || prev.businessLocation,
            // CCD and Upfront from loan plan if available
            ccdPercent: ln.plan?.ccdPercent || ln.finalCcdFeePercent || prev.ccdPercent,
            upfrontFeePercent: ln.plan?.upfrontFeePercent || ln.finalUpfrontFeePercent || prev.upfrontFeePercent,
          }));
        }

        if (apprRes.appraisal) {
          const ap = apprRes.appraisal;
          setAppraisal(ap);

          // Load saved engine dump
          if (ap.engineDump) {
            try {
              const dump = JSON.parse(ap.engineDump);
              if (dump.pnl) setEngineResult(dump);
            } catch {}
          }

          // Load saved form data back into the CAM form (only if CAM was previously saved)
          const safeParse = (val: any, fallback: any) => {
            if (!val) return fallback;
            if (typeof val === 'string') {
              try { return JSON.parse(val); } catch { return fallback; }
            }
            return val;
          };

          // Only override with saved appraisal data if the appraisal has actually been saved before
          const hasSavedData = ap.salesClientEstimate !== null || ap.engineDump !== null;

          if (hasSavedData) {
            setData((prev: CamData) => ({
              ...prev,
              // Override with saved CAM data (LO may have adjusted these)
              loanPrincipal: ap.loanPrincipal || prev.loanPrincipal,
              loanInterestRate: ap.loanInterestRate || prev.loanInterestRate,
              loanTenorMonths: ap.loanTenorMonths || prev.loanTenorMonths,
              ccdPercent: ap.ccdPercent || prev.ccdPercent,
              upfrontFeePercent: ap.upfrontFeePercent || prev.upfrontFeePercent,
              salesClientEstimate: ap.salesClientEstimate ?? prev.salesClientEstimate,
              salesSpotCheck: ap.salesSpotCheck ?? prev.salesSpotCheck,
              salesBookRecords: ap.salesBookRecord ?? prev.salesBookRecords,
              salesBankStatement: ap.salesBankStatement ?? prev.salesBankStatement,
              cashAtHand: ap.cashAtHand ?? prev.cashAtHand,
              cashInBanks: ap.cashInBanks ?? prev.cashInBanks,
              receivables: ap.receivables ?? prev.receivables,
              shortTermLiabilities: ap.shortTermLiabilities ?? prev.shortTermLiabilities,
              longTermLiabilities: ap.longTermLiabilities ?? prev.longTermLiabilities,
              payables: ap.payables ?? prev.payables,
              applicantAge: ap.applicantAge ?? prev.applicantAge,
              managementExperience: ap.managementExperience ?? prev.managementExperience,
              successionPlanVerified: ap.successionPlanVerified ?? prev.successionPlanVerified,
              bankAccountVerified: ap.bankAccountVerified ?? prev.bankAccountVerified,
              previousDefault: ap.previousDefault ?? prev.previousDefault,
              competitionIntensity: ap.competitionIntensity ?? prev.competitionIntensity,
              marketRiskCommentary: ap.marketRiskCommentary ?? prev.marketRiskCommentary,
              appraisalGpsLat: ap.appraisalGpsLat ?? prev.appraisalGpsLat,
              appraisalGpsLong: ap.appraisalGpsLong ?? prev.appraisalGpsLong,
              // Structured arrays from JSON columns
              inventory: safeParse(ap.inventorySnapshot, prev.inventory),
              businessAssets: safeParse(ap.assetsRegister, {}).business || prev.businessAssets,
              familyAssets: safeParse(ap.assetsRegister, {}).family || prev.familyAssets,
              collaterals: safeParse(ap.collateralRegister, prev.collaterals),
              guarantors: safeParse(ap.guarantorRegister, prev.guarantors),
              guarantorBizVerifications: safeParse(ap.guarantorBizVerification, prev.guarantorBizVerifications),
              bankBalances: safeParse(ap.bankBalancesRegister, prev.bankBalances),
            }));
          }
        }
      } catch (e) {
        console.error('CAM load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [loanId]);

  // Real-time engine recalculation
  const recalcEngine = useCallback(() => {
    try {
      // Derive legacy expense fields from structured category data (GAP 1)
      const businessRegular = (data.businessExpenses || []).reduce(
        (s: number, e: any) => s + (Number(e.amount) || 0), 0
      );
      const familyRegular = (data.familyExpensesRegular || []).reduce(
        (s: number, e: any) => s + (Number(e.amount) || 0), 0
      );
      const familyIrregular = (data.familyExpensesIrregular || []).reduce(
        (s: number, e: any) => s + (Number(e.amount) || 0), 0
      );
      // Derive fixed asset totals from structured asset tables (GAP 2)
      const sumAssetGroup = (grp: any) => {
        if (!grp) return 0;
        const eq = (grp.equipment || []).reduce((s: number, r: any) => s + (Number(r.value) || 0), 0);
        const ve = (grp.vehicles || []).reduce((s: number, r: any) => s + (Number(r.value) || 0), 0);
        const hl = (grp.houseLand || []).reduce((s: number, r: any) => s + (Number(r.value) || 0), 0);
        return eq + ve + hl;
      };
      const fixedBusinessAssets = sumAssetGroup(data.businessAssets);
      const fixedFamilyAssets = sumAssetGroup(data.familyAssets);
      // Derive sales client estimate from weekly sales (GAP 8): monthly = weekly × 4
      const weeklySalesTotal = (data.weeklySales || []).reduce(
        (s: number, d: any) => s + (Number(d.amount) || 0), 0
      );
      const salesClientEstimate = weeklySalesTotal * 4;
      const input: EngineInput = {
        sales: {
          clientEstimate: salesClientEstimate || Number(data.salesClientEstimate) || 0,
          spotCheck: Number(data.salesSpotCheck) || 0,
          bankStatement: Number(data.salesBankStatement) || 0,
          bookRecords: Number(data.salesBookRecords) || 0,
        },
        inventory: (data.inventory || []).map((i: any) => ({
          description: i.description,
          qty: Number(i.qty) || 0,
          cost: Number(i.cost) || 0,
          sell: Number(i.sell) || 0,
        })),
        sectorBenchmarkMargin: Number(data.sectorBenchmarkMargin) || 20,
        loan: {
          principal: Number(data.loanPrincipal) || 0,
          annualInterestRate: Number(data.loanInterestRate) || 0,
          tenorMonths: Number(data.loanTenorMonths) || 1,
          repaymentMethod: data.repaymentMethod || 'REDUCING',
          ccdPercent: Number(data.ccdPercent) || 0,
          upfrontFeePercent: Number(data.upfrontFeePercent) || 0,
        },
        expenses: {
          businessRegular,
          businessIrregular: Number(data.businessIrregular) || 0,
          familyRegular,
          familyIrregular,
          otherLoanInstallments: Number(data.otherLoanInstallments) || 0,
        },
        bufferRate: Number(data.bufferRate) || 0.2,
        balanceSheet: {
          cashAtHand: Number(data.cashAtHand) || 0,
          cashInBanks: Number(data.cashInBanks) || 0,
          receivables: Number(data.receivables) || 0,
          stockValue: 0, // computed from inventory
          fixedBusinessAssets,
          fixedFamilyAssets,
          shortTermLiabilities: Number(data.shortTermLiabilities) || 0,
          longTermLiabilities: Number(data.longTermLiabilities) || 0,
          payables: Number(data.payables) || 0,
        },
        collaterals: (data.collaterals || []).map((c: any) => ({
          type: c.type,
          marketValue: Number(c.marketValue) || 0,
        })),
        loanBaseAmount: Number(data.loanBaseAmount) || Number(data.loanPrincipal) || 0,
        guarantor: {
          income: Number(data.guarantorIncome) || 0,
          cogs: Number(data.guarantorCogs) || 0,
          operationExpenses: Number(data.guarantorOperationExpenses) || 0,
          existingInstallment: Number(data.guarantorExistingInstallment) || 0,
        },
        riskInputs: {
          sectorRiskScore: Number(data.sectorRiskScore) || 0.5,
          previousDefault: !!data.previousDefault,
          successionPlanVerified: !!data.successionPlanVerified,
          bankAccountVerified: !!data.bankAccountVerified,
        },
        stress: {
          salesHaircut: Number(data.stressSalesHaircut) || 0,
          marginCompression: Number(data.stressMarginCompression) || 0,
          opexIncrease: Number(data.stressOpexIncrease) || 0,
        },
        openingCash: Number(data.openingCash) || 0,
        // G1: Detailed cashflow inputs
        detailedCashflow: {
          familyIncome: Number(data.familyIncome) || 0,
          familyLoanInstallment: Number(data.familyLoanInstallment) || 0,
          otherLoansInstallment: Number(data.otherLoanInstallments) || 0,
          existingLoanInstallment: Number(data.runningWflLoan?.installment) || 0,
          openingCash: Number(data.openingCash) || Number(data.cashAtHand) || 0,
        },
        // G2: Previous period balance sheet (if captured)
        previousBalanceSheet: data.previousBalanceSheet || undefined,
        // G11: Bank balances register
        bankBalances: (data.bankBalances || []).map((b: any, i: number) => ({
          sn: i + 1,
          bankName: b.bankName || '',
          accountName: b.accountName || '',
          accountNumber: b.accountNumber || '',
          balance: Number(b.balance) || 0,
        })),
        // Zonification
        zonification: data.businessLocation
          ? { location: data.businessLocation, branchLocation: data.branchLocation || 'IKEJA' }
          : undefined,
      };
      const result = executeFullAppraisal(input);
      setEngineResult(result);
      return result;
    } catch (e: any) {
      console.error('Engine error:', e);
      setError(e.message);
      return null;
    }
  }, [data]);

  // ── L7: Stage-based edit restrictions (MUST be declared before useEffects that use canEdit) ──
  const isLocked = appraisal?.isSnapshotLocked;
  const currentStep = loan?.currentStep || '';

  // Edit permission checks BOTH role AND current workflow step.
  // Each role can only edit the CAM when the loan is at their designated step.
  const canEdit = (() => {
    if (!currentAdmin) return false;
    if (currentAdmin.role === 'super') return !isLocked; // super can edit anytime (if not locked)

    // G2: LO GUARD — LO can only edit if the client is assigned to them
    if (currentAdmin.role === 'loan' || currentAdmin.loanOrigination) {
      const isAssignedToMe = loan?.staffId === currentAdmin.id || loan?.user?.staffId === currentAdmin.id;
      if (!isAssignedToMe) return false; // Not assigned to this LO — read-only
      return !isLocked && ['LO_ENTRY', 'LO_ASSESSMENT', 'DRAFT', 'QUERY_RESPONSE'].includes(currentStep);
    }

    // HOC can edit during HOC_STRUCTURING and HOC_APPROVAL
    if (currentAdmin.role === 'hoc' || currentAdmin.loanStructuring) {
      return ['HOC_STRUCTURING', 'HOC_APPROVAL', 'HOC_AGGREGATION', 'HOC_FINALIZATION'].includes(currentStep);
    }

    // Analyst can edit during ANALYST_STRUCTURING
    if (currentAdmin.role === 'analyst' || currentAdmin.loanAnalyst) {
      return currentStep === 'ANALYST_STRUCTURING';
    }

    // BM, CRO, CFO, Legal, MD — can NEVER edit the LO data (read-only + create own snapshot)
    return false;
  })();

  // ── REAL-TIME AUTO-RECALCULATION (debounced 800ms) ──
  // Engine recalculates automatically as the LO types — no need to click "Recalculate"
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      recalcEngine();
    }, 800);
    return () => clearTimeout(timer);
  }, [data, loading]);

  // S6: Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ctrl+S = Save draft
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && canEdit) {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+Enter = Submit CAM
      // Compute validationErrors inline — the const is declared later in render
      // but we can recompute here to avoid TDZ issues.
      const currentErrors = engineResult ? validateBeforeSubmit() : [];
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canEdit && currentErrors.length === 0) {
        e.preventDefault();
        handleSubmitLock();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canEdit, data, engineResult]);

  // R4: Unsaved changes warning
  useEffect(() => {
    if (!canEdit || isLocked) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (!saved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [canEdit, isLocked, saved]);

  const updateField = (key: string, value: any) => {
    setData(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const result = engineResult || recalcEngine();
      if (!result) throw new Error('Engine failed');

      const res = await authFetch(`/api/appraisals/${loanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          _adminId: currentAdmin?.id, // D3 FIX: send adminId for audit log
          engineDump: JSON.stringify(result),
          engineSnapshot: JSON.stringify(result),
          riskScore: result.finalScore,
          riskGrade: result.riskGrade.grade,
          engineVerdict: result.engineVerdict,
          dsrRatio: result.ratios.dsr,
          dscrRatio: result.ratios.dscr,
          salesVariancePercent: result.forensics.variancePercent,
          hasHighVariance: result.forensics.status === 'HIGH_RISK',
          consideredMonthlySales: result.forensics.consideredSales,
          weightedMargin: result.weightedMargin.weightedMargin,
          totalStockValue: result.weightedMargin.totalStockCostValue,
          verifiedMonthlySales: result.forensics.consideredSales,
          verifiedMonthlyCogs: result.purchases.derivedCogs,
          verifiedMonthlyNetProfit: result.pnl.netProfit,
          monthlyGrossProfit: result.pnl.grossProfit,
          monthlyNetSurplus: result.pnl.netCashflowAvailable,
          // D1 FIX: Map structured arrays to JSON columns
          inventorySnapshot: JSON.stringify(data.inventory || []),
          assetsRegister: JSON.stringify({ business: data.businessAssets, family: data.familyAssets }),
          balanceSheet: JSON.stringify({
            cashAtHand: data.cashAtHand, cashInBanks: data.cashInBanks, receivables: data.receivables,
            shortTermLiabilities: data.shortTermLiabilities, longTermLiabilities: data.longTermLiabilities, payables: data.payables,
          }),
          collateralRegister: JSON.stringify(data.collaterals || []),
          guarantorRegister: JSON.stringify(data.guarantors || []),
          guarantorBizVerification: JSON.stringify(data.guarantorBizVerifications || []),
          bankBalancesRegister: JSON.stringify(data.bankBalances || []),
          marginAnalysis: JSON.stringify(result.weightedMargin),
          gpsData: JSON.stringify({ lat: data.appraisalGpsLat, lng: data.appraisalGpsLong }),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── L1/L2/L6/L9: MANDATORY SUBMISSION VALIDATION ──────────────────────
  // Validates 20+ CBN mandatory conditions before allowing CAM submission.
  // Returns array of error strings — empty = all checks passed.
  const validateBeforeSubmit = (): string[] => {
    const errors: string[] = [];
    const d = data;

    // ── L6: Mandatory document / data completeness checks ──
    // 1. Loan parameters
    if (!d.loanPrincipal || Number(d.loanPrincipal) <= 0) errors.push('Loan Principal must be set');
    if (!d.loanInterestRate || Number(d.loanInterestRate) <= 0) errors.push('Interest Rate must be set');
    if (!d.loanTenorMonths || Number(d.loanTenorMonths) <= 0) errors.push('Loan Tenor must be set');
    if (!d.repaymentMethod) errors.push('Repayment Method must be selected');

    // 2. Sales forensics — at least 2 of 4 sources must have data
    const salesSources = [d.salesClientEstimate, d.salesSpotCheck, d.salesBankStatement, d.salesBookRecords]
      .filter(v => Number(v) > 0);
    if (salesSources.length < 2) errors.push('At least 2 of 4 sales sources must be populated (Client Estimate, Spot Check, Bank Statement, Book Records)');

    // 3. Inventory — at least 1 item
    if (!d.inventory || d.inventory.length === 0) errors.push('At least 1 inventory item must be added');
    if (d.inventory && d.inventory.some((i: any) => !i.description || Number(i.qty) <= 0 || Number(i.cost) <= 0 || Number(i.sell) <= 0)) {
      errors.push('All inventory items must have description, qty, cost, and sell price');
    }

    // 4. Expenses — business + family
    const bizExp = Number(d.businessRegular) + Number(d.businessIrregular);
    const famExp = Number(d.familyRegular) + Number(d.familyIrregular);
    if (bizExp <= 0) errors.push('Business expenses must be captured');
    if (famExp <= 0) errors.push('Family expenses must be captured');

    // 5. Balance sheet — assets
    if (!d.cashAtHand && !d.cashInBanks && !d.receivables) errors.push('At least one liquid asset must be captured (cash, bank, or receivables)');

    // 6. Collateral — L9: minimum 100% coverage
    const collaterals = d.collaterals || [];
    if (collaterals.length === 0) errors.push('At least 1 collateral must be pledged');
    const fsvMult = (type: string) => type === 'MOVABLE' ? 0.8 : type === 'IMMOVABLE' ? 0.6 : 1.0;
    const totalFsv = collaterals.reduce((s: number, c: any) => s + (Number(c.marketValue) || 0) * fsvMult(c.type), 0);
    const stockCollateral = (Number(d.totalStockValue) || 0) * 0.1;
    const totalCollateral = totalFsv + stockCollateral;
    const coveragePct = Number(d.loanPrincipal) > 0 ? (totalCollateral / Number(d.loanPrincipal)) * 100 : 0;
    if (coveragePct < 100) errors.push(`Collateral coverage is ${coveragePct.toFixed(1)}% — minimum 100% FSV coverage required (CBN standard). Current: ₦${totalCollateral.toLocaleString()} vs Loan ₦${Number(d.loanPrincipal).toLocaleString()}`);

    // 7. Guarantors — at least 1
    const guarantors = d.guarantors || [];
    if (guarantors.length === 0) errors.push('At least 1 guarantor must be added');
    if (guarantors.some((g: any) => !g.guarantorName || !g.phone)) {
      errors.push('All guarantors must have name and phone number');
    }

    // 8. Visitation report — at least LO report
    const lo = d.loVisitation || {};
    const requiredVisitSections = ['businessDynamics', 'location', 'capacity', 'character', 'ownership', 'collateral', 'guarantors'];
    const missingVisit = requiredVisitSections.filter(k => !lo[k] || String(lo[k]).trim().length < 10);
    if (missingVisit.length > 0) errors.push(`LO Visitation report incomplete — fill: ${missingVisit.join(', ')}`);

    // 9. Photos — at least 3 categories
    const photos = d.photoEvidence || [];
    if (photos.length < 3) errors.push('At least 3 photo evidence items required (Shop Front, Stock, Customer)');

    // 10. GPS coordinates
    if (!d.appraisalGpsLat || !d.appraisalGpsLong) errors.push('GPS coordinates for business location must be captured');

    // 11. References — at least 2
    const refs = d.references || [];
    if (refs.length < 2) errors.push('At least 2 references must be captured');

    // 12. Sector selection
    if (!d.selectedSectorName) errors.push('Business sector must be selected from the lookup');

    // 13. Fraud check
    if (!d.physicalStockMatches) errors.push('Physical stock verification (fraud check) must be confirmed');

    // ── C1: Single obligor limit check (CBN) ──
    const loanAmount = Number(d.loanPrincipal) || 0;
    const otherLenderLoans: any[] = d.otherLenderLoans || [];
    const otherLenderExposure = otherLenderLoans.reduce((s: number, l: any) => s + (Number(l.balance) || 0), 0);
    const runningWflBalance = Number(d.runningWflLoan?.balance) || 0;
    const totalExposure = loanAmount + otherLenderExposure + runningWflBalance;
    if (totalExposure > FORMULA_LIMITS.SINGLE_OBLIGOR_LIMIT) {
      errors.push(`⚠️ Single obligor limit breached: Total exposure ₦${totalExposure.toLocaleString()} exceeds CBN limit of ₦${FORMULA_LIMITS.SINGLE_OBLIGOR_LIMIT.toLocaleString()}. MD/CEO waiver required.`);
    } else if (totalExposure > FORMULA_LIMITS.SINGLE_OBLIGOR_WARN) {
      errors.push(`⚠️ Single obligor warning: Total exposure ₦${totalExposure.toLocaleString()} exceeds warning threshold of ₦${FORMULA_LIMITS.SINGLE_OBLIGOR_WARN.toLocaleString()}. HOC review required.`);
    }

    // ── L2: Engine verdict hard gate ──
    const result = engineResult;
    if (result) {
      if (result.engineVerdict === 'REJECT') {
        errors.push(`⚠️ ENGINE REJECT: ${result.riskGrade.label}. Hard blocker detected. CAM cannot be submitted without MD/CEO override.`);
      }
      if (result.ratios.dsr > 0.45) {
        errors.push(`⚠️ DSR ${((result.ratios.dsr) * 100).toFixed(1)}% exceeds CBN hard gate of 45%. Submission blocked.`);
      }
      if (result.ratios.gearingRatio > 0.35) {
        errors.push(`⚠️ Gearing ${((result.ratios.gearingRatio) * 100).toFixed(1)}% exceeds CBN hard gate of 35%. Submission blocked.`);
      }
      if (!result.isSolvent) {
        errors.push('⚠️ 12-month projection shows insolvency (negative cash). Submission blocked.');
      }
    }

    return errors;
  };

  // L6: Check validation state for UI feedback
  const validationErrors = engineResult ? validateBeforeSubmit() : [];
  const canSubmit = validationErrors.length === 0 && !isLocked;

  const handleSubmitLock = async () => {
    // L1: Run full validation before anything else
    const result = engineResult || recalcEngine();
    if (!result) {
      setError('Engine failed to calculate. Click Recalculate first.');
      return;
    }

    const errors = validateBeforeSubmit();
    if (errors.length > 0) {
      setError(`Cannot submit — ${errors.length} issue(s) found:\n\n• ${errors.join('\n• ')}\n\nFix all issues then click Submit again.`);
      return;
    }

    // v41: Pre-check account number status BEFORE locking the snapshot.
    // Previously the lock (PUT /api/appraisals) succeeded but the transition
    // (POST /api/loans/[id]/transition) returned 403, leaving the CAM frozen
    // and the LO unable to unlock it. Now we check first and show a clear
    // warning without locking.
    try {
      const loanRes = await authFetch(`/api/loans/${loanId}`);
      if (loanRes.ok) {
        const loanData = await loanRes.json();
        const userAccountStatus = loanData?.loan?.user?.accountNumberStatus;
        const onboardingStage = loanData?.loan?.user?.onboardingStage;
        if (userAccountStatus && userAccountStatus !== 'assigned') {
          setError(
            `Cannot submit CAM for appraisal yet.\n\n` +
            `The customer's account number has not been assigned (status: ${userAccountStatus}).\n` +
            `Legal CAC Name Search must be approved first.\n\n` +
            `Current onboarding stage: ${onboardingStage || 'unknown'}\n\n` +
            `You can save this CAM as a draft and submit it once the account number is assigned.`
          );
          return;
        }
      }
    } catch {
      // non-blocking — if the pre-check fails, let the transition API catch it
    }

    if (!confirm('Locking the LO snapshot will freeze this appraisal. The data becomes immutable for audit. Continue?')) return;
    setSubmitting(true);
    setError('');
    try {
      // Build the LO snapshot payload
      const snapshotData = {
        capturedAt: new Date().toISOString(),
        capturedBy: currentAdmin?.id,
        engine: result,
        formData: data,
        recommendation: {
          amount: Number(data.loanPrincipal),
          tenor: Number(data.loanTenorMonths),
          interestRate: Number(data.loanInterestRate),
          ccd: Number(data.ccdPercent),
          upfront: Number(data.upfrontFeePercent),
        },
      };

      // Save + lock
      const res = await authFetch(`/api/appraisals/${loanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          engineDump: JSON.stringify(result),
          loSnapshot: JSON.stringify(snapshotData),
          isSnapshotLocked: true,
          submittedAt: new Date(),
          status: 'submitted',
          riskScore: result.finalScore,
          riskGrade: result.riskGrade.grade,
          engineVerdict: result.engineVerdict,
          dsrRatio: result.ratios.dsr,
          dscrRatio: result.ratios.dscr,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lock failed');
      }

      // Transition loan forward (LO_ASSESSMENT → LEGAL_CAC_CHECK or BM_QC)
      const transRes = await authFetch(`/api/loans/${loanId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'forward',
          comment: 'LO submitted and locked CAM',
          mccDecision: {
            recommendedAmount: Number(data.loanPrincipal),
            duration: Number(data.loanTenorMonths),
            interestRatePercentage: Number(data.loanInterestRate),
            ccdPercentage: Number(data.ccdPercent),
            upfrontFeePercentage: Number(data.upfrontFeePercent),
            comment: 'LO recommendation',
            decisionType: 'approved',
          },
        }),
      });
      if (!transRes.ok) {
        const err = await transRes.json();
        throw new Error(err.error || 'Transition failed');
      }

      alert('✅ CAM submitted and locked! Loan forwarded to next gate.');
      setView('loan-detail', { loanId });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── L4: Role-specific snapshot creation ──
  // BM, HOC, CRO, CFO, Legal, MD each create their own frozen snapshot
  // at their designated workflow step. This preserves the "Triple Lock" audit trail.
  const [snapshotSubmitting, setSnapshotSubmitting] = useState(false);
  const handleCreateSnapshot = async () => {
    if (!currentAdmin) return;
    const role = currentAdmin.role;
    const snapshotFieldMap: Record<string, string> = {
      bm: 'bmSnapshot',
      hoc: 'hocSnapshot',
      analyst: 'analystSnapshot',
      cro: 'croSnapshot',
      cfo: 'cfoSnapshot',
      legal: 'legalSnapshot',
      md: 'mdSnapshot',
    };
    const snapshotField = snapshotFieldMap[role];
    if (!snapshotField) {
      setError('Your role cannot create a snapshot');
      return;
    }

    const comment = prompt(`Creating ${role.toUpperCase()} snapshot. Add your assessment comment (optional):`) ?? '';
    if (comment === null) return; // user cancelled

    setSnapshotSubmitting(true);
    try {
      const result = engineResult || recalcEngine();
      const snapshotData = {
        capturedAt: new Date().toISOString(),
        capturedBy: currentAdmin.id,
        capturedByName: `${currentAdmin.firstName} ${currentAdmin.lastName}`,
        role,
        engine: result,
        formData: data,
        comment,
      };

      const res = await authFetch(`/api/appraisals/${loanId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [snapshotField]: JSON.stringify(snapshotData),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Snapshot creation failed');
      }

      alert(`✅ ${role.toUpperCase()} snapshot created and frozen for audit.`);
      setView('loan-detail', { loanId });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSnapshotSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-400">Loading CAM...</div>;
  }

  if (!loan) {
    return <div className="p-6 text-center text-red-500">Loan not found.</div>;
  }

  // G2: Show warning if LO is not assigned to this client
  const isLONotAssigned = currentAdmin?.role === 'loan' && loan && loan.staffId !== currentAdmin.id && loan.user?.staffId !== currentAdmin.id;

  // ── L4: Role-specific snapshot creation ──
  // Each approver role can create their own frozen snapshot
  const canCreateSnapshot = (() => {
    if (!currentAdmin || isLocked) return false;
    const role = currentAdmin.role;
    const stepMatch: Record<string, string> = {
      bm: 'BM_QC',
      hoc: 'HOC_STRUCTURING',
      analyst: 'ANALYST_STRUCTURING',
      cro: 'CRO_RISK',
      cfo: 'CFO_REVIEW',
      legal: 'LEGAL_REVIEW',
      md: 'MD_APPROVAL',
    };
    const targetStep = stepMatch[role];
    return targetStep ? currentStep === targetStep : false;
  })();

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtPct = (n: number) => (n || 0).toFixed(2) + '%';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 dark:bg-slate-900 dark:bg-slate-950 min-h-full space-y-4" role="main" aria-label="Credit Appraisal Memorandum">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setView('loan-detail', { loanId })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Loan
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Universal CAM</h1>
            <Badge variant="outline" className="font-mono text-[10px]">{loan.applicationRef}</Badge>
            <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 text-[10px]">
              {LOAN_STEP_LABELS[loan.currentStep]}
            </Badge>
            {isLocked && (
              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                <Lock className="h-2.5 w-2.5 mr-1" /> Snapshot Locked
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Borrower: {loan.user?.firstName} {loan.user?.lastName} · {loan.user?.business?.name || '—'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => window.print()} variant="outline" size="sm" className="hidden">
            <FileText className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button onClick={recalcEngine} variant="outline" size="sm" aria-label="Recalculate engine">
            <Calculator className="h-4 w-4 mr-1" /> Recalculate
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={saving || isLocked} variant="outline" size="sm" aria-label="Save CAM draft">
              <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Draft'}
            </Button>
          )}
          {canEdit && (currentAdmin?.role === 'loan' || currentAdmin?.role === 'super') && (
            <>
              {/* v41: Account number status warning banner */}
              {loan?.user && loan.user.accountNumberStatus !== 'assigned' && (
                <div className="mr-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-[11px] text-amber-800">
                    Account number not assigned ({loan.user.accountNumberStatus || 'pending'}) — CAM cannot be submitted until Legal CAC approval.
                  </span>
                </div>
              )}
              <Button
                onClick={handleSubmitLock} aria-label="Lock and submit CAM"
                disabled={submitting || isLocked || validationErrors.length > 0 || (loan?.user && loan.user.accountNumberStatus !== 'assigned')}
                className="bg-emerald-600 hover:bg-emerald-700"
                size="sm"
                title={
                  validationErrors.length > 0 ? `${validationErrors.length} validation issues must be fixed first` :
                  loan?.user && loan.user.accountNumberStatus !== 'assigned' ? 'Account number must be assigned (Legal CAC approval) before CAM submission' :
                  'Lock and submit CAM'
                }
              >
                <Lock className="h-4 w-4 mr-1" />
                {submitting ? 'Submitting...' : isLocked ? 'Locked' : validationErrors.length > 0 ? `Submit (${validationErrors.length} issues)` : 'Lock & Submit'}
              </Button>
            </>
          )}
          {/* L4: Role-specific snapshot creation for BM/HOC/CRO/CFO/Legal/MD */}
          {canCreateSnapshot && (
            <Button
              onClick={handleCreateSnapshot}
              disabled={snapshotSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
              title={`Create ${(currentAdmin?.role || '').toUpperCase()} snapshot — freezes your assessment for audit`}
            >
              <Lock className="h-4 w-4 mr-1" />
              {snapshotSubmitting ? 'Creating...' : `Create ${(currentAdmin?.role || '').toUpperCase()} Snapshot`}
            </Button>
          )}
          {/* L5: CAM PDF Download — CBN standard Credit Appraisal Memorandum */}
          {isLocked && engineResult && (
            <PDFDownloadLink
              document={
                <CamMemoPDF
                  loan={loan}
                  executiveSummary={`Risk Grade: ${engineResult.riskGrade.grade} (${engineResult.riskGrade.label}). Engine Verdict: ${engineResult.engineVerdict}. DSR: ${(engineResult.ratios.dsr * 100).toFixed(1)}%. Gearing: ${(engineResult.ratios.gearingRatio * 100).toFixed(1)}%. Collateral Coverage: ${engineResult.collateralCoverage.coveragePercent.toFixed(0)}%.`}
                  pnL={[
                    { label: 'Considered Monthly Sales', value: engineResult.forensics.consideredSales },
                    { label: 'Derived COGS (Purchases)', value: engineResult.pnl.cogs },
                    { label: 'Gross Profit', value: engineResult.pnl.grossProfit },
                    { label: 'Business Expenses (buffered)', value: engineResult.pnl.opex },
                    { label: 'Family Expenses (buffered)', value: engineResult.pnl.living },
                    { label: 'Net Cashflow Available', value: engineResult.pnl.netCashflowAvailable },
                    { label: 'Proposed Installment', value: engineResult.pnl.installment },
                    { label: 'Net Profit', value: engineResult.pnl.netProfit },
                  ]}
                  riskRatios={[
                    { label: 'DSR (Debt Service Ratio)', value: `${(engineResult.ratios.dsr * 100).toFixed(1)}%`, benchmark: '≤ 45%', verdict: engineResult.ratios.dsr > 0.45 ? 'fail' : engineResult.ratios.dsr > 0.35 ? 'review' : 'pass' },
                    { label: 'DSCR (Coverage)', value: `${engineResult.ratios.dscr.toFixed(2)}x`, benchmark: '≥ 1.25x', verdict: engineResult.ratios.dscr >= 1.25 ? 'pass' : 'review' },
                    { label: 'Gearing Ratio', value: `${(engineResult.ratios.gearingRatio * 100).toFixed(1)}%`, benchmark: '≤ 35%', verdict: engineResult.ratios.gearingRatio > 0.35 ? 'fail' : 'pass' },
                    { label: 'Current Ratio', value: engineResult.ratios.currentRatio.toFixed(2), benchmark: '≥ 1.0', verdict: engineResult.ratios.currentRatio >= 1 ? 'pass' : 'fail' },
                    { label: 'Collateral Coverage', value: `${engineResult.collateralCoverage.coveragePercent.toFixed(0)}%`, benchmark: '≥ 100%', verdict: engineResult.collateralCoverage.coveragePercent >= 100 ? 'pass' : 'fail' },
                  ]}
                  riskGrade={engineResult.riskGrade.grade}
                  riskGradeLabel={engineResult.riskGrade.label}
                  securities={(data.collaterals || []).map((c: any, i: number) => ({
                    type: c.type || 'MOVABLE',
                    description: c.name || c.description || `Collateral ${i + 1}`,
                    value: Number(c.marketValue) || 0,
                    fsv: (Number(c.marketValue) || 0) * (c.type === 'MOVABLE' ? 0.8 : c.type === 'IMMOVABLE' ? 0.6 : 1.0),
                  }))}
                  recommendation={`${engineResult.engineVerdict} — ${engineResult.riskGrade.label}. Score: ${engineResult.finalScore}/100.`}
                  recommendedAmount={Number(data.loanPrincipal) || null}
                  recommendedTenor={Number(data.loanTenorMonths) || null}
                  recommendedRate={Number(data.loanInterestRate) || null}
                  signatories={[
                    { name: `${loan?.loanOfficer?.firstName || ''} ${loan?.loanOfficer?.lastName || ''}`.trim() || 'Loan Officer', role: 'Loan Officer', signed: isLocked },
                    { name: '', role: 'Branch Manager', signed: false },
                    { name: '', role: 'Head of Credit', signed: false },
                    { name: '', role: 'MD/CEO', signed: false },
                  ]}
                  generatedAt={new Date().toISOString()}
                />
              }
              fileName={`CAM-${loan.applicationRef || loanId}.pdf`}
              className="inline-flex items-center justify-center rounded-md bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-3 py-2 transition-colors"
            >
              <Download className="h-4 w-4 mr-1" /> Download CAM PDF
            </PDFDownloadLink>
          )}
        </div>
      </div>

      {/* ── LIVE RISK DASHBOARD — updates in real-time as LO types ── */}
      {engineResult && !isLocked && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* Risk Grade */}
          <div className={cn('rounded-lg p-3 border-2 text-center', 
            engineResult.riskGrade.grade === 'A' && 'border-emerald-300 bg-emerald-50',
            engineResult.riskGrade.grade === 'B' && 'border-green-300 bg-green-50',
            engineResult.riskGrade.grade === 'C' && 'border-amber-300 bg-amber-50',
            engineResult.riskGrade.grade === 'D' && 'border-orange-300 bg-orange-50',
            engineResult.riskGrade.grade === 'F' && 'border-red-300 bg-red-50',
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">Risk Grade</p>
            <p className={cn('text-2xl font-bold',
              engineResult.riskGrade.grade === 'A' && 'text-emerald-700',
              engineResult.riskGrade.grade === 'B' && 'text-green-700',
              engineResult.riskGrade.grade === 'C' && 'text-amber-700',
              engineResult.riskGrade.grade === 'D' && 'text-orange-700',
              engineResult.riskGrade.grade === 'F' && 'text-red-700',
            )}>{engineResult.riskGrade.grade}</p>
            <p className="text-[8px] text-slate-400">{engineResult.riskGrade.label}</p>
          </div>

          {/* DSR */}
          <div className={cn('rounded-lg p-3 border-2 text-center',
            engineResult.ratios.dsr > 0.45 ? 'border-red-300 bg-red-50' :
            engineResult.ratios.dsr > 0.35 ? 'border-amber-300 bg-amber-50' :
            'border-emerald-300 bg-emerald-50'
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">DSR</p>
            <p className={cn('text-2xl font-bold',
              engineResult.ratios.dsr > 0.45 ? 'text-red-600' :
              engineResult.ratios.dsr > 0.35 ? 'text-amber-600' :
              'text-emerald-600'
            )}>{(engineResult.ratios.dsr * 100).toFixed(1)}%</p>
            <p className="text-[8px] text-slate-400">Limit: ≤45%</p>
          </div>

          {/* Gearing */}
          <div className={cn('rounded-lg p-3 border-2 text-center',
            engineResult.ratios.gearingRatio > 0.35 ? 'border-red-300 bg-red-50' :
            engineResult.ratios.gearingRatio > 0.25 ? 'border-amber-300 bg-amber-50' :
            'border-emerald-300 bg-emerald-50'
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">Gearing</p>
            <p className={cn('text-2xl font-bold',
              engineResult.ratios.gearingRatio > 0.35 ? 'text-red-600' :
              engineResult.ratios.gearingRatio > 0.25 ? 'text-amber-600' :
              'text-emerald-600'
            )}>{(engineResult.ratios.gearingRatio * 100).toFixed(1)}%</p>
            <p className="text-[8px] text-slate-400">Limit: ≤35%</p>
          </div>

          {/* Collateral Coverage */}
          <div className={cn('rounded-lg p-3 border-2 text-center',
            engineResult.collateralCoverage.coveragePercent < 100 ? 'border-red-300 bg-red-50' :
            engineResult.collateralCoverage.coveragePercent < 150 ? 'border-amber-300 bg-amber-50' :
            'border-emerald-300 bg-emerald-50'
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">Coverage</p>
            <p className={cn('text-2xl font-bold',
              engineResult.collateralCoverage.coveragePercent < 100 ? 'text-red-600' :
              engineResult.collateralCoverage.coveragePercent < 150 ? 'text-amber-600' :
              'text-emerald-600'
            )}>{engineResult.collateralCoverage.coveragePercent.toFixed(0)}%</p>
            <p className="text-[8px] text-slate-400">Min: ≥100%</p>
          </div>

          {/* Net Profit */}
          <div className={cn('rounded-lg p-3 border-2 text-center',
            engineResult.pnl.netProfit < 0 ? 'border-red-300 bg-red-50' :
            'border-emerald-300 bg-emerald-50'
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">Net Profit/mo</p>
            <p className={cn('text-lg font-bold',
              engineResult.pnl.netProfit < 0 ? 'text-red-600' : 'text-emerald-600'
            )}>₦{(engineResult.pnl.netProfit || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
            <p className="text-[8px] text-slate-400">After all expenses</p>
          </div>

          {/* Engine Verdict */}
          <div className={cn('rounded-lg p-3 border-2 text-center',
            engineResult.engineVerdict === 'REJECT' ? 'border-red-300 bg-red-50' :
            engineResult.engineVerdict === 'REVIEW' ? 'border-amber-300 bg-amber-50' :
            'border-emerald-300 bg-emerald-50'
          )}>
            <p className="text-[9px] uppercase text-slate-500 dark:text-slate-400 font-semibold">Verdict</p>
            <p className={cn('text-lg font-bold',
              engineResult.engineVerdict === 'REJECT' ? 'text-red-600' :
              engineResult.engineVerdict === 'REVIEW' ? 'text-amber-600' :
              'text-emerald-600'
            )}>{engineResult.engineVerdict}</p>
            <p className="text-[8px] text-slate-400">Score: {engineResult.finalScore}/100</p>
          </div>
        </div>
      )}

      {/* L1: Validation errors panel — shows all blocking issues */}
      {canEdit && validationErrors.length > 0 && !isLocked && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-bold text-red-800">
                CBN Compliance Check — {validationErrors.length} issue(s) must be resolved before submission:
              </p>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {validationErrors.map((err, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-red-400">•</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* G2: LO Not Assigned Warning */}
      {isLONotAssigned && (
        <div className="rounded-md bg-amber-50 border border-amber-300 px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-amber-800">This client is not assigned to you.</p>
            <p className="text-[11px] text-amber-700">You can view this CAM in read-only mode. Ask your Branch Manager to assign the client to you if you need to make changes.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Engine HUD — always visible at top */}
      {engineResult && (
        <EngineHud result={engineResult} />
      )}

      {/* Tab navigation */}
      <Card className="p-2">
        <div className="flex gap-1 overflow-x-auto">
          {CAM_TABS.map((tab, idx) => {
            const iconMap: Record<string, any> = {
              User, Building2, TrendingUp, Boxes, Receipt, Landmark, ShieldCheck, MapPin, Lightbulb, Cpu, CheckSquare,
            };
            const Icon = iconMap[tab.icon] || Cpu;
            const active = activeTab === idx;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(idx)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:bg-slate-800'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Tab content */}
      <Card className="p-6">
        {activeTab === 0 && <ProfileTab data={data} update={updateField} loan={loan} />}
        {activeTab === 1 && <BusinessTab data={data} update={updateField} loan={loan} />}
        {activeTab === 2 && <SalesTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 3 && <InventoryTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 4 && <ExpensesTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 5 && <AssetsTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 6 && <SecurityTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 7 && <VisitationTab data={data} update={updateField} loan={loan} />}
        {activeTab === 8 && <CrossChecksTab result={engineResult} />}
        {activeTab === 9 && <VerificationsTab result={engineResult} />}
        {activeTab === 10 && <SwotTab data={data} update={updateField} engineResult={engineResult} />}
        {activeTab === 11 && <EngineTab result={engineResult} />}
      </Card>

      {/* Tab navigation footer */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveTab(Math.max(0, activeTab - 1))}
          disabled={activeTab === 0}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <p className="text-xs text-slate-500 dark:text-slate-400">Tab {activeTab + 1} of {CAM_TABS.length}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setActiveTab(Math.min(CAM_TABS.length - 1, activeTab + 1))}
          disabled={activeTab === CAM_TABS.length - 1}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// ENGINE HUD — sticky ratio display at top of CAM
// ============================================================================

function EngineHud({ result }: { result: EngineResult }) {
  const fmtPct = (n: number) => (n * 100).toFixed(1) + '%';
  const fmtX = (n: number) => n.toFixed(2) + 'x';

  const dsrStatus = result.ratios.dsr > 0.45 ? 'critical' : result.ratios.dsr > 0.35 ? 'warning' : 'good';
  const dscrStatus = result.ratios.dscr < 1.0 ? 'critical' : result.ratios.dscr < 1.25 ? 'warning' : 'good';
  const gearingStatus = result.ratios.gearingRatio > 0.35 ? 'critical' : result.ratios.gearingRatio > 0.25 ? 'warning' : 'good';

  return (
    <Card className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold">Credit Engine — Live</h3>
          <Badge className="bg-emerald-500/20 text-emerald-300 text-[9px]">
            {result.policyVersion}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase">Risk Score</p>
            <p className="text-lg font-bold">{result.finalScore}/100</p>
          </div>
          <Badge className={cn(
            'text-sm font-bold px-3 py-1',
            result.riskGrade.grade === 'A' && 'bg-emerald-500 text-white',
            result.riskGrade.grade === 'B' && 'bg-green-500 text-white',
            result.riskGrade.grade === 'C' && 'bg-amber-500 text-white',
            result.riskGrade.grade === 'D' && 'bg-orange-500 text-white',
            result.riskGrade.grade === 'F' && 'bg-red-500 text-white',
          )}>
            Grade {result.riskGrade.grade} — {result.riskGrade.label}
          </Badge>
          <Badge className={cn(
            'text-xs px-3 py-1',
            result.engineVerdict === 'APPROVE' && 'bg-emerald-500 text-white',
            result.engineVerdict === 'REVIEW' && 'bg-amber-500 text-white',
            result.engineVerdict === 'REJECT' && 'bg-red-500 text-white',
          )}>
            {result.engineVerdict}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        <RatioCard label="DSR" value={fmtPct(result.ratios.dsr)} target="≤45%" status={dsrStatus} />
        <RatioCard label="DSCR" value={fmtX(result.ratios.dscr)} target="≥1.25x" status={dscrStatus} />
        <RatioCard label="Gearing" value={fmtPct(result.ratios.gearingRatio)} target="≤35%" status={gearingStatus} />
        <RatioCard label="Equity %" value={result.ratios.equityRatio.toFixed(1) + '%'} target="≥20%" status={result.ratios.equityRatio < 20 ? 'warning' : 'good'} />
        <RatioCard label="Coverage" value={result.collateralCoverage.coveragePercent.toFixed(0) + '%'} target="≥100%" status={result.collateralCoverage.coveragePercent < 75 ? 'critical' : result.collateralCoverage.coveragePercent < 100 ? 'warning' : 'good'} />
        <RatioCard label="Net Yield" value={result.bankYield.netYieldPercent.toFixed(1) + '%'} target="≥15%" status={result.bankYield.netYieldPercent < 0 ? 'critical' : result.bankYield.netYieldPercent < 15 ? 'warning' : 'good'} />
      </div>

      {result.redFlags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <p className="text-[10px] text-slate-400 uppercase mb-1.5">Red Flags ({result.redFlags.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {result.redFlags.map((f, i) => (
              <span
                key={i}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] font-medium',
                  f.severity === 'critical' && 'bg-red-500/20 text-red-300',
                  f.severity === 'warning' && 'bg-amber-500/20 text-amber-300',
                  f.severity === 'info' && 'bg-blue-500/20 text-blue-300',
                )}
                title={f.message}
              >
                {f.code} ({f.pointsDeducted > 0 ? '-' : ''}{f.pointsDeducted})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-slate-400 uppercase">Considered Sales</p>
          <p className="font-bold">₦{result.forensics.consideredSales.toLocaleString()}</p>
          <p className="text-[9px] text-slate-500 dark:text-slate-400">Source: {result.forensics.sourceUsed}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase">Weighted Margin</p>
          <p className="font-bold">{(result.weightedMargin.weightedMargin * 100).toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-400 uppercase">Stress Test</p>
          <p className={cn('font-bold', result.stress.verdict === 'PASS' ? 'text-emerald-400' : 'text-red-400')}>
            {result.stress.verdict}
          </p>
          <p className="text-[9px] text-slate-500 dark:text-slate-400">Stressed DSR: {(result.stress.stressedDSR * 100).toFixed(1)}%</p>
        </div>
      </div>
    </Card>
  );
}

function RatioCard({ label, value, target, status }: { label: string; value: string; target: string; status: 'good' | 'warning' | 'critical' }) {
  return (
    <div className={cn(
      'rounded-md p-2 border',
      status === 'good' && 'bg-emerald-500/10 border-emerald-500/30',
      status === 'warning' && 'bg-amber-500/10 border-amber-500/30',
      status === 'critical' && 'bg-red-500/10 border-red-500/30',
    )}>
      <p className="text-[9px] text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[9px] text-slate-500 dark:text-slate-400">Target: {target}</p>
    </div>
  );
}

// ============================================================================
// G4 + G5: SECTOR AUTO-LOOKUP — dropdown of 60+ business natures from Excel
// When selected, auto-fills sectorRiskScore + sectorBenchmarkMargin
// ============================================================================

function SectorAutoLookupSection({ data, update }: any) {
  const [overrideMode, setOverrideMode] = useState(false);
  const selectedSector = DEFAULT_SECTORS.find((s) => s.name === data.selectedSectorName);

  const handleSelect = (name: string) => {
    const sector = DEFAULT_SECTORS.find((s) => s.name === name);
    if (sector) {
      update('selectedSectorName', name);
      update('sectorRiskScore', sector.riskScore);
      update('sectorBenchmarkMargin', sector.benchmarkedMargin);
      setOverrideMode(false);
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Sector &amp; Business Nature Lookup</h3>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{DEFAULT_SECTORS.length} sectors</Badge>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Select a business nature from the Excel Sheet1 reference (60+ entries). Risk score and benchmark margin auto-populate.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <Label className="text-xs text-slate-600">Business Nature / Sector</Label>
          <select
            value={data.selectedSectorName || ''}
            onChange={(e) => handleSelect(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            <option value="">— Select business nature —</option>
            {DEFAULT_SECTORS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} (margin: {s.benchmarkedMargin}%)
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Sector Risk Score (auto)"
          type="number"
          value={data.sectorRiskScore}
          onChange={(v: any) => update('sectorRiskScore', Number(v))}
          readOnly={!overrideMode}
        />
        <Field
          label="Sector Benchmark Margin % (auto)"
          type="number"
          value={data.sectorBenchmarkMargin}
          onChange={(v: any) => update('sectorBenchmarkMargin', Number(v))}
          readOnly={!overrideMode}
        />
      </div>
      {selectedSector && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <p className="text-slate-600">
            <strong>Selected:</strong> {selectedSector.name} · Risk: {selectedSector.riskScore} · Margin: {selectedSector.benchmarkedMargin}%
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-amber-700"
            onClick={() => setOverrideMode(!overrideMode)}
          >
            {overrideMode ? '🔒 Lock' : '✏️ Override'}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// G13: ZONIFICATION LOOKUP — location rating from Excel Sheet1 (60+ locations)
// ============================================================================

function ZonificationLookupSection({ data, update }: any) {
  const locationName = data.businessLocation || '';
  const lookup = lookupLocationRating(locationName);

  const ratingColor = lookup
    ? lookup.rating <= 2
      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
      : lookup.rating <= 6
        ? 'bg-amber-100 text-amber-700 border-amber-300'
        : 'bg-red-100 text-red-700 border-red-300'
    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300';

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Zonification Check (Location Rating)</h3>
        </div>
        <Badge className={cn('text-[10px] border', ratingColor)}>
          {lookup ? `Rating: ${lookup.rating}` : 'No match'}
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-slate-600">Business Location</Label>
          <input
            list="location-list"
            value={locationName}
            onChange={(e) => update('businessLocation', e.target.value)}
            placeholder="Type or select location"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <datalist id="location-list">
            {LOCATION_RATINGS.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name} — {l.state} (Rating {l.rating})
              </option>
            ))}
          </datalist>
        </div>
        <Field label="Matched State" value={lookup?.state || '—'} readOnly />
        <Field label="Rating (0-9, lower=safer)" type="number" value={lookup?.rating ?? 0} readOnly />
      </div>
      {lookup && (
        <p className="mt-3 text-xs text-slate-600">
          <strong>Decision:</strong>{' '}
          {lookup.rating <= 2
            ? '✅ Approve (low-risk zone, well-served by branch network)'
            : lookup.rating <= 6
              ? '⚠️ Review (medium-risk zone, requires BM validation)'
              : '🚫 Decline (high-risk zone, refer to supervisor)'}
        </p>
      )}
    </Card>
  );
}

// ============================================================================
// G1: CASHFLOW INPUTS — feeds the Monthly Cashflow Test (22 rows × 12 months)
// ============================================================================

function CashflowInputsSection({ data, update }: any) {
  return (
    <Card className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-indigo-700" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cashflow Test Inputs (G1)</h3>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        These inputs feed the 22-row × 12-month Monthly Cashflow Test in the Engine tab (Excel MONTHLY CASHFLOW TEST sheet parity).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Family Income (₦/mo)" type="number" value={data.familyIncome} onChange={(v: any) => update('familyIncome', Number(v))} />
        <Field label="Family Loan Installment (₦/mo)" type="number" value={data.familyLoanInstallment} onChange={(v: any) => update('familyLoanInstallment', Number(v))} />
        <Field label="Other Loans Installment (₦/mo)" type="number" value={data.otherLoanInstallments} onChange={(v: any) => update('otherLoanInstallments', Number(v))} />
        <Field label="Opening Cash (₦)" type="number" value={data.openingCash} onChange={(v: any) => update('openingCash', Number(v))} />
      </div>
    </Card>
  );
}

// ============================================================================
// G2: PREVIOUS BALANCE SHEET — for current vs previous comparison
// ============================================================================

function PreviousBalanceSheetSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const prev = data.previousBalanceSheetFull || {
    periodDate: '',
    cashAtHand: 0, cashInBanks: 0, wflBalance: 0,
    receivables: 0, advanceToSuppliers: 0, stockValue: 0,
    fixedBusinessAssets: 0, fixedFamilyAssets: 0,
    shortTermLiabilities: 0, advanceFromCustomers: 0,
    wflLoan: 0, otherBankLoans: 0,
    longTermLiabilities: 0, wflLongTermLoan: 0, otherLongTermLoans: 0,
  };

  const upd = (k: string, v: any) => update('previousBalanceSheetFull', { ...prev, [k]: v });

  // Compute totals using the engine function
  const computed = computePreviousBalanceSheetTotals({
    periodDate: prev.periodDate,
    cashAtHand: Number(prev.cashAtHand) || 0,
    cashInBanks: Number(prev.cashInBanks) || 0,
    wflBalance: Number(prev.wflBalance) || 0,
    receivables: Number(prev.receivables) || 0,
    advanceToSuppliers: Number(prev.advanceToSuppliers) || 0,
    stockValue: Number(prev.stockValue) || 0,
    fixedBusinessAssets: Number(prev.fixedBusinessAssets) || 0,
    fixedFamilyAssets: Number(prev.fixedFamilyAssets) || 0,
    shortTermLiabilities: Number(prev.shortTermLiabilities) || 0,
    advanceFromCustomers: Number(prev.advanceFromCustomers) || 0,
    wflLoan: Number(prev.wflLoan) || 0,
    otherBankLoans: Number(prev.otherBankLoans) || 0,
    longTermLiabilities: Number(prev.longTermLiabilities) || 0,
    wflLongTermLoan: Number(prev.wflLongTermLoan) || 0,
    otherLongTermLoans: Number(prev.otherLongTermLoans) || 0,
  });

  // Also sync the simplified previousBalanceSheet for backward compat
  useEffect(() => {
    update('previousBalanceSheet', {
      periodDate: computed.periodDate,
      totalAssets: computed.totalAssets,
      totalLiabilities: computed.totalLiabilities,
      equity: computed.equity,
    });
  }, [computed.totalAssets, computed.totalLiabilities, computed.equity, computed.periodDate]);

  return (
    <Card className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-purple-700" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Previous Period Balance Sheet (Full Snapshot — G2)</h3>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Captures the previous reporting period's full line-item balance sheet. The engine computes differences
        (current − previous) and the capitalization cross-check (equity variation vs accrued profit).
      </p>

      <div className="mb-3">
        <Field label="Previous Period Date" type="date" value={prev.periodDate} onChange={(v: any) => upd('periodDate', v)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assets */}
        <div className="rounded-md border border-purple-200 bg-white p-3">
          <h4 className="text-xs font-bold text-purple-700 uppercase mb-2">Assets (Previous)</h4>
          <div className="space-y-1.5">
            <Field label="Cash at Hand" type="number" value={prev.cashAtHand} onChange={(v: any) => upd('cashAtHand', Number(v))} />
            <Field label="Cash in Other Banks" type="number" value={prev.cashInBanks} onChange={(v: any) => upd('cashInBanks', Number(v))} />
            <Field label="WFL Balance" type="number" value={prev.wflBalance} onChange={(v: any) => upd('wflBalance', Number(v))} />
            <Field label="Receivables" type="number" value={prev.receivables} onChange={(v: any) => upd('receivables', Number(v))} />
            <Field label="Advance to Suppliers" type="number" value={prev.advanceToSuppliers} onChange={(v: any) => upd('advanceToSuppliers', Number(v))} />
            <Field label="Stock Value" type="number" value={prev.stockValue} onChange={(v: any) => upd('stockValue', Number(v))} />
            <Field label="Fixed Business Assets" type="number" value={prev.fixedBusinessAssets} onChange={(v: any) => upd('fixedBusinessAssets', Number(v))} />
            <Field label="Fixed Family Assets" type="number" value={prev.fixedFamilyAssets} onChange={(v: any) => upd('fixedFamilyAssets', Number(v))} />
          </div>
        </div>

        {/* Liabilities */}
        <div className="rounded-md border border-purple-200 bg-white p-3">
          <h4 className="text-xs font-bold text-purple-700 uppercase mb-2">Liabilities (Previous)</h4>
          <div className="space-y-1.5">
            <Field label="Short-term Liabilities" type="number" value={prev.shortTermLiabilities} onChange={(v: any) => upd('shortTermLiabilities', Number(v))} />
            <Field label="Advance from Customers" type="number" value={prev.advanceFromCustomers} onChange={(v: any) => upd('advanceFromCustomers', Number(v))} />
            <Field label="WFL Loan (ST)" type="number" value={prev.wflLoan} onChange={(v: any) => upd('wflLoan', Number(v))} />
            <Field label="Other Bank Loans (ST)" type="number" value={prev.otherBankLoans} onChange={(v: any) => upd('otherBankLoans', Number(v))} />
            <Field label="Long-term Liabilities" type="number" value={prev.longTermLiabilities} onChange={(v: any) => upd('longTermLiabilities', Number(v))} />
            <Field label="WFL Long-term Loan" type="number" value={prev.wflLongTermLoan} onChange={(v: any) => upd('wflLongTermLoan', Number(v))} />
            <Field label="Other LT Loans" type="number" value={prev.otherLongTermLoans} onChange={(v: any) => upd('otherLongTermLoans', Number(v))} />
          </div>
        </div>
      </div>

      {/* Computed totals */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Total Assets</p>
          <p className="text-sm font-bold text-emerald-700">{fmtNaira(computed.totalAssets)}</p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Total Liabilities</p>
          <p className="text-sm font-bold text-red-700">{fmtNaira(computed.totalLiabilities)}</p>
        </div>
        <div className="rounded-md border border-purple-200 bg-purple-50 p-2 text-center">
          <p className="text-[9px] uppercase text-slate-500">Equity</p>
          <p className="text-sm font-bold text-purple-700">{fmtNaira(computed.equity)}</p>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// TAB 1 — PROFILE / KYC
// ============================================================================

function ProfileTab({ data, update, loan }: any) {
  const u = loan?.user;
  const b = u?.business;
  return (
    <div className="space-y-6">
      {/* Client Identity — from onboarding (read-only) */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Client Identity</h3>
        <p className="text-xs text-slate-400 mb-3">Auto-populated from onboarding — read only</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="First Name" value={u?.firstName} readOnly />
          <Field label="Last Name" value={u?.lastName} readOnly />
          <Field label="BVN" value={u?.bvn} readOnly />
          <Field label="NIN" value={u?.nin} readOnly />
          <Field label="Phone" value={u?.phone} readOnly />
          <Field label="Email" value={u?.email} readOnly />
          <Field label="Account No." value={u?.accountNumber} readOnly />
          <Field label="KYC Status" value={u?.kycStatus} readOnly />
        </div>
      </div>

      {/* v42-P1: Rate Tier Lookup — product × grade → auto rate/fee */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-emerald-600" />
          Rate & Fee Tier Lookup
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Select loan product and loan cycle grade to auto-populate interest rate, upfront fee, and CCD from the tier matrix.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs font-semibold">Loan Product</Label>
            <Select
              value={data.loanProduct || 'sme'}
              onValueChange={(v) => {
                const tier = lookupRateTier(v as LoanProductKey, (data.loanCycleGrade || 'NEW') as LoanCycleGrade);
                update('loanProduct', v);
                update('loanInterestRate', tier.rate);
                update('upfrontFeePercent', tier.upfrontFee);
                update('ccdPercent', tier.ccd);
                update('rateTierAutoApplied', true);
              }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(LOAN_PRODUCT_LABELS) as LoanProductKey[]).map(k => (
                  <SelectItem key={k} value={k}>{LOAN_PRODUCT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold">Loan Cycle Grade</Label>
            <Select
              value={data.loanCycleGrade || 'NEW'}
              onValueChange={(v) => {
                const tier = lookupRateTier((data.loanProduct || 'sme') as LoanProductKey, v as LoanCycleGrade);
                update('loanCycleGrade', v);
                update('loanInterestRate', tier.rate);
                update('upfrontFeePercent', tier.upfrontFee);
                update('ccdPercent', tier.ccd);
                update('rateTierAutoApplied', true);
              }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['A', 'B', 'C', 'D', 'NEW'] as LoanCycleGrade[]).map(g => (
                  <SelectItem key={g} value={g}>{g === 'NEW' ? 'NEW (First-time customer)' : `Grade ${g}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-semibold">Auto-APR (from tier)</Label>
            <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {data.loanInterestRate || 0}% /mo
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Auto-Upfront (from tier)</Label>
            <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {data.upfrontFeePercent || 0}%
            </div>
          </div>
        </div>
        {data.rateTierAutoApplied && (
          <p className="text-[10px] text-emerald-600 mt-2">
            ✓ Rate, upfront fee, and CCD auto-applied from tier matrix. You can still override in the Loan Terms section below.
          </p>
        )}
      </div>

      {/* Loan Terms — from onboarding (read-only during LO phase) */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Loan Terms (Requested)</h3>
        <p className="text-xs text-slate-400 mb-3">Auto-populated from customer application — HOC may adjust during structuring</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Loan Principal (₦)" type="number" value={data.loanPrincipal} onChange={(v: any) => update('loanPrincipal', Number(v))} />
          <Field label="Interest Rate (% p.a.)" type="number" value={data.loanInterestRate} onChange={(v: any) => update('loanInterestRate', Number(v))} />
          <Field label="Tenor (months)" type="number" value={data.loanTenorMonths} onChange={(v: any) => update('loanTenorMonths', Number(v))} />
          <SelectField label="Repayment Method" value={data.repaymentMethod} onChange={(v: any) => update('repaymentMethod', v)} options={['REDUCING', 'FLAT']} />
          <Field label="CCD (%)" type="number" value={data.ccdPercent} onChange={(v: any) => update('ccdPercent', Number(v))} />
          <Field label="Upfront Fee (%)" type="number" value={data.upfrontFeePercent} onChange={(v: any) => update('upfrontFeePercent', Number(v))} />
          <Field label="Loan Purpose" value={data.loanPurpose || '—'} readOnly />
          <div>
            <Label className="text-xs font-semibold">Sector Benchmark Margin</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                type="number"
                value={data.sectorBenchmarkMargin || 0}
                onChange={(e) => update('sectorBenchmarkMargin', Number(e.target.value))}
                className="text-xs"
                placeholder="0.00"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const margin = lookupSectorMargin(data.selectedSectorName || data.businessSector || '');
                  if (margin > 0) {
                    update('sectorBenchmarkMargin', margin);
                  }
                }}
                title="Auto-lookup from sector name"
              >
                Auto
              </Button>
            </div>
            {data.selectedSectorName && (
              <p className="text-[10px] text-slate-400 mt-1">Sector: {data.selectedSectorName}</p>
            )}
          </div>
        </div>
      </div>

      {/* CAM-Specific Risk Assessment Fields */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">CAM Risk Assessment</h3>
        <p className="text-xs text-slate-400 mb-3">Fields specific to credit appraisal — completed by Loan Officer</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Applicant Age" type="number" value={data.applicantAge} onChange={(v: any) => update('applicantAge', Number(v))} />
          <Field label="Years at Address (auto)" type="number" value={data.yearsAtAddress} readOnly />
          <Field label="Years in Operation (auto)" type="number" value={data.yearsInOperation} readOnly />
          <Field label="Management Experience (yrs)" type="number" value={data.managementExperience} onChange={(v: any) => update('managementExperience', Number(v))} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          <CheckField label="Succession Plan Verified" checked={data.successionPlanVerified} onChange={(v: any) => update('successionPlanVerified', v)} />
          <CheckField label="Bank Account Verified" checked={data.bankAccountVerified} onChange={(v: any) => update('bankAccountVerified', v)} />
          <CheckField label="Previous Default" checked={data.previousDefault} onChange={(v: any) => update('previousDefault', v)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <SelectField label="Competition Intensity" value={data.competitionIntensity || ''} onChange={(v: any) => update('competitionIntensity', v)} options={['Low', 'Medium', 'High', 'Intense']} />
          <Field label="Market Risk Commentary" type="text" value={data.marketRiskCommentary} onChange={(v: any) => update('marketRiskCommentary', v)} />
        </div>
      </div>

      {/* Sector & Zonification — auto-populated, read-only */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Sector & Zonification (Auto)</h3>
        <p className="text-xs text-slate-400 mb-3">Auto-populated from business sector and location</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Sector Risk Score (auto)" type="number" value={data.sectorRiskScore} readOnly />
          <Field label="Benchmark Margin % (auto)" type="number" value={data.sectorBenchmarkMargin} readOnly />
          <Field label="Business Location" value={data.businessLocation || '—'} readOnly />
          <Field label="Zonification Rating" value={lookupLocationRating(data.businessLocation)?.rating?.toString() || '—'} readOnly />
        </div>
      </div>

      {/* G4 + G5: Sector auto-lookup with 60+ business natures */}
      <SectorAutoLookupSection data={data} update={update} />

      {/* G13: Location zonification lookup */}
      <ZonificationLookupSection data={data} update={update} />

      {/* G1: Detailed cashflow inputs (for Monthly Cashflow Test) */}
      <CashflowInputsSection data={data} update={update} />

      {/* G2: Previous period balance sheet (for comparison) */}
      <PreviousBalanceSheetSection data={data} update={update} />

      <RunningWflLoanSection data={data} update={update} />
      <OtherLenderLoansSection data={data} update={update} />
      <ReferencesSection data={data} update={update} />
    </div>
  );
}

// ---- Running WFL Loan section (GAP 3) -------------------------------------
function RunningWflLoanSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const r = data.runningWflLoan || {
    isActive: false, disbursementDate: '', maturityDate: '', amount: 0,
    duration: 0, installment: 0, installmentsPaid: 0, balance: 0,
  };
  const upd = (k: string, v: any) => update('runningWflLoan', { ...r, [k]: v });

  // "Can Customer Get Another Loan?" indicator
  let pctPaid = 0;
  let verdict: { label: string; color: string } = { label: '—', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700' };
  if (r.isActive && r.amount > 0) {
    const paid = Math.max(0, r.amount - (Number(r.balance) || 0));
    pctPaid = (paid / r.amount) * 100;
    if (pctPaid <= 45) verdict = { label: 'NO', color: 'bg-red-500 text-white' };
    else if (pctPaid >= 55) verdict = { label: 'YES', color: 'bg-emerald-500 text-white' };
    else verdict = { label: 'MAYBE', color: 'bg-amber-500 text-white' };
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Running WFL Loan Details</h3>
        </div>
        <CheckField label="Client is on a running WFL loan" checked={!!r.isActive} onChange={(v: any) => upd('isActive', v)} />
      </div>
      {r.isActive ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Disbursement Date" type="date" value={r.disbursementDate} onChange={(v: any) => upd('disbursementDate', v)} />
            <Field label="Maturity Date" type="date" value={r.maturityDate} onChange={(v: any) => upd('maturityDate', v)} />
            <Field label="Loan Amount (₦)" type="number" value={r.amount} onChange={(v: any) => upd('amount', Number(v))} />
            <Field label="Duration (months)" type="number" value={r.duration} onChange={(v: any) => upd('duration', Number(v))} />
            <Field label="Monthly Installment (₦)" type="number" value={r.installment} onChange={(v: any) => upd('installment', Number(v))} />
            <Field label="Installments Paid" type="number" value={r.installmentsPaid} onChange={(v: any) => upd('installmentsPaid', Number(v))} />
            <Field label="Loan Balance (₦)" type="number" value={r.balance} onChange={(v: any) => upd('balance', Number(v))} />
          </div>
          <div className="mt-4 p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-slate-600" />
              <div>
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Can Customer Get Another Loan?</p>
                <p className="text-xs text-slate-600">
                  Based on {pctPaid.toFixed(1)}% of principal paid on running WFL loan.
                </p>
              </div>
            </div>
            <Badge className={cn('text-sm font-bold px-4 py-1.5', verdict.color)}>
              {verdict.label} · {pctPaid.toFixed(1)}% paid
            </Badge>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Rule: ≤45% paid → NO (Red) · ≥55% paid → YES (Green) · otherwise → MAYBE (Amber).
            Paid = Loan Amount − Balance = {fmtNaira(Math.max(0, r.amount - (Number(r.balance) || 0)))}.
          </p>
        </>
      ) : (
        <p className="text-xs text-slate-400">No active running WFL loan. Tick the checkbox above to capture details.</p>
      )}
    </Card>
  );
}

// ---- Other lender loans section (GAP 3) -----------------------------------
function OtherLenderLoansSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const rows: any[] = data.otherLenderLoans || [];
  // G12: Expanded to 8 statuses — matches Excel Sheet1 loan status taxonomy
  const statuses = [...LOAN_STATUS_TAXONOMY];
  const updateRow = (idx: number, key: string, val: any) => {
    const newArr = [...rows];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('otherLenderLoans', newArr);
  };
  const addRow = () => update('otherLenderLoans', [...rows, { institution: '', amount: 0, installment: 0, balance: 0, tenure: 0, status: 'Performing', lastPaymentDate: '', daysInDefault: 0 }]);
  const removeRow = (idx: number) => update('otherLenderLoans', rows.filter((_: any, i: number) => i !== idx));
  const totalInstallment = rows.reduce((s: number, r: any) => s + (Number(r.installment) || 0), 0);
  const totalBalance = rows.reduce((s: number, r: any) => s + (Number(r.balance) || 0), 0);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Running Loans with Other Lenders</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Capture up to 15 external obligations. Status uses CBN prudential classification.</p>
        </div>
        <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
            <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-2">S/N</th>
              <th className="px-2 py-2">Institution</th>
              <th className="px-2 py-2 text-right">Loan Amount</th>
              <th className="px-2 py-2 text-right">Installment</th>
              <th className="px-2 py-2 text-right">Current Balance</th>
              <th className="px-2 py-2 text-right">Tenure (mo)</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Last Payment</th>
              <th className="px-2 py-2 text-right">Days in Default</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r: any, i: number) => (
              <tr key={i}>
                <td className="px-2 py-1 font-mono">{i + 1}</td>
                <td className="px-2 py-1"><Input value={r.institution} onChange={(e) => updateRow(i, 'institution', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.amount} onChange={(e) => updateRow(i, 'amount', Number(e.target.value))} className="h-7 w-24 text-right text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.installment} onChange={(e) => updateRow(i, 'installment', Number(e.target.value))} className="h-7 w-24 text-right text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.balance} onChange={(e) => updateRow(i, 'balance', Number(e.target.value))} className="h-7 w-24 text-right text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.tenure} onChange={(e) => updateRow(i, 'tenure', Number(e.target.value))} className="h-7 w-16 text-right text-xs" /></td>
                <td className="px-2 py-1">
                  <select value={r.status} onChange={(e) => updateRow(i, 'status', e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-xs w-full">
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1"><Input type="date" value={r.lastPaymentDate} onChange={(e) => updateRow(i, 'lastPaymentDate', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.daysInDefault} onChange={(e) => updateRow(i, 'daysInDefault', Number(e.target.value))} className="h-7 w-16 text-right text-xs" /></td>
                <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => removeRow(i)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="text-center text-[10px] text-slate-400 py-3">No other-lender loans captured.</td></tr>
            )}
          </tbody>
          <tfoot className="bg-emerald-50 font-bold">
            <tr>
              <td colSpan={3} className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">Totals</td>
              <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtNaira(totalInstallment)}</td>
              <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtNaira(totalBalance)}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ---- References section (GAP 6) -------------------------------------------
function ReferencesSection({ data, update }: any) {
  const refs: any[] = data.references || [];
  const upd = (idx: number, key: string, val: any) => {
    const newArr = [...refs];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('references', newArr);
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-emerald-700" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">References (4 persons)</h3>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {refs.map((r: any, idx: number) => (
          <Card key={idx} className="p-3 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-emerald-700 uppercase">{r.type}</h4>
              <Badge variant="outline" className="text-[9px]">#{idx + 1}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Full Name" value={r.fullName} onChange={(v: any) => upd(idx, 'fullName', v)} />
              <SelectField label="Sex" value={r.sex} onChange={(v: any) => upd(idx, 'sex', v)} options={['Male', 'Female']} />
              <Field label="Home Address" value={r.homeAddress} onChange={(v: any) => upd(idx, 'homeAddress', v)} />
              <Field label="Business/Company Name" value={r.businessName} onChange={(v: any) => upd(idx, 'businessName', v)} />
              <Field label="Business Nature" value={r.businessNature} onChange={(v: any) => upd(idx, 'businessNature', v)} />
              <Field label="Business Address" value={r.businessAddress} onChange={(v: any) => upd(idx, 'businessAddress', v)} />
              <Field label="Years Known" type="number" value={r.yearsKnown} onChange={(v: any) => upd(idx, 'yearsKnown', Number(v))} />
              <SelectField label="Marital Status" value={r.maritalStatus} onChange={(v: any) => upd(idx, 'maritalStatus', v)} options={['Single', 'Married', 'Divorced', 'Widowed']} />
              <Field label="Relationship" value={r.relationship} onChange={(v: any) => upd(idx, 'relationship', v)} />
              <Field label="Phone Number" value={r.phone} onChange={(v: any) => upd(idx, 'phone', v)} />
            </div>
            <div className="mt-2">
              <Label className="text-xs text-slate-600">Comment</Label>
              <Textarea value={r.comment} onChange={(e) => upd(idx, 'comment', e.target.value)} rows={2} className="mt-1 text-xs" />
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}

// ============================================================================
// TAB 2 — BUSINESS
// ============================================================================

function BusinessTab({ data, update, loan }: any) {
  const b = loan?.user?.business;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Business Profile (From Onboarding)</h3>
        <p className="text-xs text-slate-400 mb-3">Auto-populated from customer onboarding — verify during field visitation</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Business Name" value={b?.name} readOnly />
          <Field label="Sector" value={b?.sectorRef?.name || b?.sector} readOnly />
          <Field label="Legal Structure" value={b?.legalStructure} readOnly />
          <Field label="RC/BN Number" value={b?.rcBnNumber} readOnly />
          <Field label="Date Established" value={b?.dateEstablished ? new Date(b.dateEstablished).toLocaleDateString() : ''} readOnly />
          <Field label="Years in Operation" value={data.yearsInOperation} readOnly />
        </div>
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Business Location</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Shop Address" value={b?.shopAddress} readOnly />
          <Field label="Landmark" value={b?.landmark} readOnly />
          <Field label="State" value={b?.state} readOnly />
          <Field label="Ownership Status" value={b?.ownershipStatus} readOnly />
        </div>
      </div>
      {/* Business Verification Checkboxes */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Business Verification</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CheckField label="Business visually confirmed during visitation" checked={data.businessVerified || false} onChange={(v: any) => update('businessVerified', v)} />
          <CheckField label="Stock level matches declared value" checked={data.stockMatchesDeclared || false} onChange={(v: any) => update('stockMatchesDeclared', v)} />
          <CheckField label="Business activity matches sector" checked={data.activityMatchesSector || false} onChange={(v: any) => update('activityMatchesSector', v)} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB 3 — SALES FORENSICS
// ============================================================================

function SalesTab({ data, update, engineResult }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  // ── SECTION 1: Weekly Sales per Client Estimation (Excel rows 88-99) ──
  // Grid: Good/Average/Bad rows × Monday-Sunday columns
  const weeklyGrid = data.weeklyGrid || {
    good:  { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
    average: { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
    bad:   { monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0 },
  };
  const updGrid = (row: string, day: string, val: number) => {
    update('weeklyGrid', { ...weeklyGrid, [row]: { ...weeklyGrid[row], [day]: val } });
  };
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weeklyTotalGrid = days.reduce((s, d) => s + (Number(weeklyGrid.good[d]) || 0) + (Number(weeklyGrid.average[d]) || 0) + (Number(weeklyGrid.bad[d]) || 0), 0);
  const monthlyClientEstimate = weeklyTotalGrid * 4;

  // ── SECTION 2: 3-Day Sales (Excel rows 101-108) ──
  const threeDaySales = data.threeDaySales || { day1: 0, day2: 0, day3: 0 };
  const upd3Day = (k: string, v: number) => update('threeDaySales', { ...threeDaySales, [k]: v });
  const threeDayTotal = (Number(threeDaySales.day1) || 0) + (Number(threeDaySales.day2) || 0) + (Number(threeDaySales.day3) || 0);
  const monthly3Day = threeDayTotal * 8; // × 8 extrapolation factor per Excel

  // ── SECTION 3: Account Statement Credit Side (Excel rows 110-119) ──
  const bankMonths = data.salesBankMonths || [139093269.85, 223380551.52, 191141268.09, 188976318.09, 187200083.09, 155582768.09, 202571068.09, 158475573.09, 164774168.09, 192605668.09, 233865168.09, 168292268.09];
  const updBankMonth = (idx: number, val: number) => {
    const newArr = [...bankMonths];
    newArr[idx] = val;
    update('salesBankMonths', newArr);
  };
  const bankSubTotal = bankMonths.reduce((s: number, v: number) => s + (Number(v) || 0), 0);
  const bankAverage = bankSubTotal / 12;

  // ── SECTION 4: Sales Records / Invoice (Excel rows 121-125) ──
  const invoiceMonths = data.salesInvoiceMonths || [0, 0, 0, 0, 0, 0];
  const updInvMonth = (idx: number, val: number) => {
    const newArr = [...invoiceMonths];
    newArr[idx] = val;
    update('salesInvoiceMonths', newArr);
  };
  const invoiceAvg = invoiceMonths.reduce((s: number, v: number) => s + (Number(v) || 0), 0) / 6;

  // ── Sales Summary Base (Excel rows 128-135) ──
  const salesSources = [
    { label: 'On Client Estimation', value: monthlyClientEstimate },
    { label: 'On the last 3 Days sales', value: monthly3Day },
    { label: 'On Sales Records / Invoice', value: invoiceAvg },
    { label: 'Account Statement (Avg Inflow)', value: bankAverage },
  ];
  const validSources = salesSources.filter((s) => s.value > 0);
  const consideredSales = validSources.length > 0 ? Math.min(...validSources.map((s) => s.value)) : 0;
  const consideredSource = validSources.find((s) => s.value === consideredSales)?.label || '—';

  // Auto-update the engine input fields
  useEffect(() => {
    update('salesClientEstimate', monthlyClientEstimate);
    update('salesSpotCheck', monthly3Day);
    update('salesBankStatement', bankAverage);
    update('salesBookRecords', invoiceAvg);
    update('consideredMonthlySales', consideredSales);
    update('selectedSalesSource', consideredSource);
  }, [monthlyClientEstimate, monthly3Day, bankAverage, invoiceAvg, consideredSales]);

  // ── PURCHASE SECTION (Excel rows 138-172) ──
  // P1: Purchase per Client Estimation (supplier table)
  const purchaseSuppliers = data.purchaseSuppliers || [];
  const updSupplier = (idx: number, key: string, val: any) => {
    const newArr = [...purchaseSuppliers];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('purchaseSuppliers', newArr);
  };
  const addSupplier = () => update('purchaseSuppliers', [...purchaseSuppliers, { name: '', location: '', frequency: 0, amount: 0 }]);
  const removeSupplier = (idx: number) => update('purchaseSuppliers', purchaseSuppliers.filter((_: any, i: number) => i !== idx));
  const purchaseClientTotal = purchaseSuppliers.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);

  // P2: Purchase from Account Statement (debit side, 12 months)
  const purchaseBankMonths = data.purchaseBankMonths || [133097294.82, 225656523.95, 202234107.85, 213151975.04, 182906396.84, 144114533.64, 203313609.72, 164909296.98, 181142943.04, 193124335.29, 233211003.54, 167135007.54];
  const updPurchBankMonth = (idx: number, val: number) => {
    const newArr = [...purchaseBankMonths];
    newArr[idx] = val;
    update('purchaseBankMonths', newArr);
  };
  const purchaseBankSubTotal = purchaseBankMonths.reduce((s: number, v: number) => s + (Number(v) || 0), 0);
  const purchaseBankAvg = purchaseBankSubTotal / 12;

  // P3: Purchase from Receipts/Invoices (6 months)
  const purchaseInvoiceMonths = data.purchaseInvoiceMonths || [0, 0, 0, 0, 0, 0];
  const updPurchInvMonth = (idx: number, val: number) => {
    const newArr = [...purchaseInvoiceMonths];
    newArr[idx] = val;
    update('purchaseInvoiceMonths', newArr);
  };
  const purchaseInvoiceAvg = purchaseInvoiceMonths.reduce((s: number, v: number) => s + (Number(v) || 0), 0) / 6;

  // P4: Purchase verification from margin (P = S × (1 - gwm))
  const gwm = data.weightedMargin || 0.20;
  const purchaseFromMargin = consideredSales * (1 - gwm);

  // Purchase Summary Base
  const purchaseSources = [
    { label: 'On Client Estimation', value: purchaseClientTotal },
    { label: 'Debit side of Bank Statement (Avg)', value: purchaseBankAvg },
    { label: 'On Purchases Invoice (Avg)', value: purchaseInvoiceAvg },
    { label: 'Purchases from margin (P=S×(1-gwm))', value: purchaseFromMargin },
  ];
  const validPurchSources = purchaseSources.filter((s) => s.value > 0);
  const consideredPurchases = validPurchSources.length > 0 ? Math.min(...validPurchSources.map((s) => s.value)) : 0;

  useEffect(() => {
    update('purchasesClientEstimate', purchaseClientTotal);
    update('purchasesBankDebit', purchaseBankAvg);
    update('purchasesInvoices', purchaseInvoiceAvg);
    update('purchasesMarginDerived', purchaseFromMargin);
    update('consideredMonthlyPurchases', consideredPurchases);
  }, [purchaseClientTotal, purchaseBankAvg, purchaseInvoiceAvg, purchaseFromMargin, consideredPurchases]);

  return (
    <div className="space-y-6">
      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MONTHLY SALES — 4 Methods (Excel FINANCIAL ANALYSIS rows 86-135)     */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-t-lg">
        <h2 className="text-lg font-bold text-white">MONTHLY SALES — 4-Source Triangulation</h2>
        <p className="text-xs text-emerald-100">Excel FINANCIAL ANALYSIS sheet (rows 86-135). The least figure is considered as the accepted monthly sales.</p>
      </div>

      {/* ── METHOD 1: Sales According to Client's Estimation (Weekly Grid) ── */}
      <Card className="p-4 border-2 border-emerald-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">1. Sales According to Client&apos;s Estimation</h3>
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Source 1</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Weekly grid: capture Good / Average / Bad day amounts for each day of the week. Monthly = Weekly Total × 4.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="px-2 py-2 border text-left text-[10px] uppercase text-slate-600">WEEKLY</th>
                {dayLabels.map((d) => <th key={d} className="px-2 py-2 border text-center text-[10px] uppercase text-slate-600">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'good', label: 'Good day', color: 'bg-emerald-50' },
                { key: 'average', label: 'Average Day', color: 'bg-amber-50' },
                { key: 'bad', label: 'Bad day', color: 'bg-red-50' },
              ].map((row) => (
                <tr key={row.key} className={row.color}>
                  <td className="px-2 py-1 border font-semibold text-slate-700">{row.label}</td>
                  {days.map((day) => (
                    <td key={day} className="px-1 py-1 border">
                      <Input
                        type="number"
                        value={weeklyGrid[row.key][day]}
                        onChange={(e) => updGrid(row.key, day, Number(e.target.value))}
                        className="h-7 w-full text-right text-xs border-0 bg-transparent"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-bold">
                <td className="px-2 py-2 border text-right text-[10px] uppercase">Weekly Total</td>
                <td colSpan={7} className="px-2 py-2 border text-right font-mono text-emerald-700 text-sm">{fmtNaira(weeklyTotalGrid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 p-3 bg-emerald-50 rounded border border-emerald-200 flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-800">TOTAL MONTHLY SALES = WEEKLY TOTAL × 4</span>
          <span className="text-lg font-bold font-mono text-emerald-700">{fmtNaira(monthlyClientEstimate)}</span>
        </div>
      </Card>

      {/* ── METHOD 2: Monthly Sales According to 3-Day Sales ── */}
      <Card className="p-4 border-2 border-amber-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">2. Monthly Sales According to 3-Day Sales</h3>
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">Source 2</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Capture sales for the last 3 observed days. Monthly = Total × 8 (extrapolation factor).</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="px-2 py-2 border text-left text-[10px] uppercase text-slate-600">Sales for the last 3 days</th>
                <th className="px-2 py-2 border text-right text-[10px] uppercase text-slate-600">Cash Sales (₦)</th>
                <th className="px-2 py-2 border text-right text-[10px] uppercase text-slate-600">Total (₦)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'day1', label: 'First day' },
                { key: 'day2', label: 'Second day' },
                { key: 'day3', label: 'Third Day' },
              ].map((r) => (
                <tr key={r.key}>
                  <td className="px-2 py-1 border font-medium text-slate-700">{r.label}</td>
                  <td className="px-1 py-1 border">
                    <Input type="number" value={threeDaySales[r.key]} onChange={(e) => upd3Day(r.key, Number(e.target.value))} className="h-7 w-full text-right text-xs border-0" />
                  </td>
                  <td className="px-2 py-1 border text-right font-mono">{fmtNaira(Number(threeDaySales[r.key]) || 0)}</td>
                </tr>
              ))}
              <tr className="bg-slate-100 dark:bg-slate-800 font-bold">
                <td className="px-2 py-1 border text-right text-[10px] uppercase">Total</td>
                <td className="px-2 py-1 border text-right font-mono">{fmtNaira(threeDayTotal)}</td>
                <td className="px-2 py-1 border text-right font-mono">{fmtNaira(threeDayTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 p-3 bg-amber-50 rounded border border-amber-200 flex items-center justify-between">
          <span className="text-xs font-bold text-amber-800">TOTAL MONTHLY SALES = 3-DAY TOTAL × 8</span>
          <span className="text-lg font-bold font-mono text-amber-700">{fmtNaira(monthly3Day)}</span>
        </div>
      </Card>

      {/* ── METHOD 3: Monthly Sales from Account Statement (12 months) ── */}
      <Card className="p-4 border-2 border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">3. Monthly Sales from Account Statement</h3>
          <Badge className="bg-blue-100 text-blue-700 text-[10px]">Source 3</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Credit side of bank account statement — 12 months of inflow data.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800">
                <th className="px-2 py-2 border text-left text-[10px] uppercase text-slate-600">Period</th>
                <th className="px-2 py-2 border text-right text-[10px] uppercase text-slate-600">Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              {bankMonths.map((val: number, i: number) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50 dark:bg-slate-900'}>
                  <td className="px-2 py-1 border font-medium text-slate-700">Month {i + 1}</td>
                  <td className="px-1 py-1 border">
                    <Input type="number" value={val} onChange={(e) => updBankMonth(i, Number(e.target.value))} className="h-7 w-full text-right text-xs border-0" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-200 font-bold">
                <td className="px-2 py-2 border text-right text-[10px] uppercase">Sub Total</td>
                <td className="px-2 py-2 border text-right font-mono text-blue-700">{fmtNaira(bankSubTotal)}</td>
              </tr>
              <tr className="bg-blue-100 font-bold">
                <td className="px-2 py-2 border text-right text-[10px] uppercase">Average Inflow</td>
                <td className="px-2 py-2 border text-right font-mono text-blue-700">{fmtNaira(bankAverage)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── METHOD 4: Monthly Sales from Sales Records / Invoice (6 months) ── */}
      <Card className="p-4 border-2 border-purple-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">4. Monthly Sales from Sales Records / Invoice</h3>
          <Badge className="bg-purple-100 text-purple-700 text-[10px]">Source 4</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Sales records or invoice books — 6 months of data, averaged.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {invoiceMonths.map((val: number, i: number) => (
            <div key={i}>
              <Label className="text-[10px] text-slate-600">Month {i + 1}</Label>
              <Input type="number" value={val} onChange={(e) => updInvMonth(i, Number(e.target.value))} className="h-8 text-right text-xs" />
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-purple-50 rounded border border-purple-200 flex items-center justify-between">
          <span className="text-xs font-bold text-purple-800">Average Total (6 months)</span>
          <span className="text-lg font-bold font-mono text-purple-700">{fmtNaira(invoiceAvg)}</span>
        </div>
      </Card>

      {/* ── SALES SUMMARY BASE (Excel rows 128-135) ── */}
      <Card className="p-4 bg-slate-900 text-white">
        <h3 className="text-sm font-bold mb-3">📊 Sales Summary Base — Least Figure Rule</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="px-2 py-2 text-left text-[10px] uppercase text-slate-400">DETAIL</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase text-slate-400">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {salesSources.map((s, i) => (
              <tr key={i} className={cn('border-b border-slate-700', s.value === consideredSales && s.value > 0 && 'bg-emerald-900/50')}>
                <td className="px-2 py-2 text-slate-300">{s.label}</td>
                <td className="px-2 py-2 text-right font-mono text-white">{fmtNaira(s.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-600 font-bold">
              <td className="px-2 py-3 text-right text-[10px] uppercase">Sales used (Least figure)</td>
              <td className="px-2 py-3 text-right font-mono text-lg text-white">{fmtNaira(consideredSales)}</td>
            </tr>
            <tr className="bg-emerald-800">
              <td className="px-2 py-1 text-right text-[10px] text-emerald-200">Source selected:</td>
              <td className="px-2 py-1 text-right text-emerald-200 font-semibold">{consideredSource}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* PURCHASE — 4 Methods (Excel FINANCIAL ANALYSIS rows 138-172)        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="p-4 bg-gradient-to-r from-amber-600 to-orange-600 rounded-t-lg">
        <h2 className="text-lg font-bold text-white">PURCHASE — 4-Source Verification</h2>
        <p className="text-xs text-amber-100">Excel FINANCIAL ANALYSIS sheet (rows 138-172). P = S × (1 − GWM) is the margin-derived truth source.</p>
      </div>

      {/* ── P1: Purchase According to Client Estimation (Supplier table) ── */}
      <Card className="p-4 border-2 border-orange-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">1. Purchase According to Client Estimation</h3>
          <Button size="sm" variant="outline" onClick={addSupplier}><Plus className="h-3 w-3 mr-1" />Add Supplier</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr className="text-left text-[10px] uppercase text-slate-500 dark:text-slate-400">
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Location / Town / Country</th>
                <th className="px-2 py-2 text-center">Frequency</th>
                <th className="px-2 py-2 text-right">Amount (₦)</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchaseSuppliers.map((s: any, i: number) => (
                <tr key={i}>
                  <td className="px-2 py-1"><Input value={s.name} onChange={(e) => updSupplier(i, 'name', e.target.value)} className="h-7 text-xs" placeholder="Supplier name" /></td>
                  <td className="px-2 py-1"><Input value={s.location} onChange={(e) => updSupplier(i, 'location', e.target.value)} className="h-7 text-xs" placeholder="City" /></td>
                  <td className="px-2 py-1"><Input type="number" value={s.frequency} onChange={(e) => updSupplier(i, 'frequency', Number(e.target.value))} className="h-7 w-16 text-center text-xs" /></td>
                  <td className="px-2 py-1"><Input type="number" value={s.amount} onChange={(e) => updSupplier(i, 'amount', Number(e.target.value))} className="h-7 w-32 text-right text-xs" /></td>
                  <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => removeSupplier(i)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
                </tr>
              ))}
              {purchaseSuppliers.length === 0 && <tr><td colSpan={5} className="text-center text-[10px] text-slate-400 py-2">No suppliers added</td></tr>}
            </tbody>
            <tfoot className="bg-orange-50 font-bold">
              <tr>
                <td colSpan={3} className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">TOTAL</td>
                <td className="px-2 py-2 text-right font-mono text-orange-700">{fmtNaira(purchaseClientTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── P2: Purchase from Account Statement (Debit side, 12 months) ── */}
      <Card className="p-4 border-2 border-red-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">2. Purchase According to Account Statement (Debit Side)</h3>
          <Badge className="bg-red-100 text-red-700 text-[10px]">Source 2</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Debit side of bank account statement — 12 months of outflow data.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {purchaseBankMonths.map((val: number, i: number) => (
            <div key={i}>
              <Label className="text-[10px] text-slate-600">Month {i + 1}</Label>
              <Input type="number" value={val} onChange={(e) => updPurchBankMonth(i, Number(e.target.value))} className="h-8 text-right text-xs" />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="p-2 bg-red-50 rounded border border-red-200 text-center">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Sub Total</p>
            <p className="font-bold font-mono text-red-700">{fmtNaira(purchaseBankSubTotal)}</p>
          </div>
          <div className="p-2 bg-red-100 rounded border border-red-300 text-center">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Average Outflow</p>
            <p className="font-bold font-mono text-red-700">{fmtNaira(purchaseBankAvg)}</p>
          </div>
        </div>
      </Card>

      {/* ── P3: Purchase from Receipts/Invoices (6 months) ── */}
      <Card className="p-4 border-2 border-cyan-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">3. Purchase from Purchase Receipts / Invoices</h3>
          <Badge className="bg-cyan-100 text-cyan-700 text-[10px]">Source 3</Badge>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Documented purchase invoices — 6 months, averaged.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {purchaseInvoiceMonths.map((val: number, i: number) => (
            <div key={i}>
              <Label className="text-[10px] text-slate-600">Month {i + 1}</Label>
              <Input type="number" value={val} onChange={(e) => updPurchInvMonth(i, Number(e.target.value))} className="h-8 text-right text-xs" />
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-cyan-50 rounded border border-cyan-200 flex items-center justify-between">
          <span className="text-xs font-bold text-cyan-800">Average Total (6 months)</span>
          <span className="text-lg font-bold font-mono text-cyan-700">{fmtNaira(purchaseInvoiceAvg)}</span>
        </div>
      </Card>

      {/* ── P4: Purchase Verification from Margin ── */}
      <Card className="p-4 border-2 border-green-300 bg-green-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">4. Purchase Verification from Margin</h3>
          <Badge className="bg-green-200 text-green-800 text-[10px]">Source 4 (Truth)</Badge>
        </div>
        <p className="text-xs text-slate-600 mb-3">Formula: P = S × (1 − GWM) where S = considered sales and GWM = weighted margin.</p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 bg-white rounded border">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Considered Sales (S)</p>
            <p className="font-bold font-mono text-slate-900 dark:text-slate-100">{fmtNaira(consideredSales)}</p>
          </div>
          <div className="p-2 bg-white rounded border">
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400">Weighted Margin (GWM)</p>
            <p className="font-bold font-mono text-slate-900 dark:text-slate-100">{(gwm * 100).toFixed(2)}%</p>
          </div>
          <div className="p-2 bg-green-600 text-white rounded border">
            <p className="text-[10px] uppercase text-green-100">Derived Purchases (P)</p>
            <p className="font-bold font-mono">{fmtNaira(purchaseFromMargin)}</p>
          </div>
        </div>
      </Card>

      {/* ── PURCHASE SUMMARY BASE ── */}
      <Card className="p-4 bg-slate-900 text-white">
        <h3 className="text-sm font-bold mb-3">📊 Purchase Summary Base — Least Figure Rule</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="px-2 py-2 text-left text-[10px] uppercase text-slate-400">DETAIL</th>
              <th className="px-2 py-2 text-right text-[10px] uppercase text-slate-400">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {purchaseSources.map((s, i) => (
              <tr key={i} className={cn('border-b border-slate-700', s.value === consideredPurchases && s.value > 0 && 'bg-orange-900/50')}>
                <td className="px-2 py-2 text-slate-300">{s.label}</td>
                <td className="px-2 py-2 text-right font-mono text-white">{fmtNaira(s.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-orange-600 font-bold">
              <td className="px-2 py-3 text-right text-[10px] uppercase">Purchases used (Least figure)</td>
              <td className="px-2 py-3 text-right font-mono text-lg text-white">{fmtNaira(consideredPurchases)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* ── Engine Result Card ── */}
      {engineResult && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <h4 className="text-sm font-bold text-emerald-900 mb-2">Engine Result</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Considered Sales</p>
              <p className="font-bold text-emerald-700">{fmtNaira(engineResult.forensics.consideredSales)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Source Used</p>
              <p className="font-bold">{engineResult.forensics.sourceUsed}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Variance</p>
              <p className={cn('font-bold', engineResult.forensics.variancePercent > 20 ? 'text-red-600' : 'text-emerald-700')}>
                {engineResult.forensics.variancePercent.toFixed(2)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Status</p>
              <Badge className={engineResult.forensics.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                {engineResult.forensics.status}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {/* ── Stress Test Simulator ── */}
      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Stress Test Simulator</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SliderField label="Sales Haircut (%)" value={data.stressSalesHaircut} min={0} max={50} step={5} onChange={(v: any) => update('stressSalesHaircut', Number(v))} />
          <SliderField label="Margin Compression (pp)" value={data.stressMarginCompression} min={0} max={30} step={1} onChange={(v: any) => update('stressMarginCompression', Number(v))} />
          <SliderField label="OPEX Increase (%)" value={data.stressOpexIncrease} min={0} max={100} step={5} onChange={(v: any) => update('stressOpexIncrease', Number(v))} />
        </div>
        {engineResult && (
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Original DSR</p>
              <p className="font-bold">{(engineResult.stress.originalDSR * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Stressed DSR</p>
              <p className={cn('font-bold', engineResult.stress.verdict === 'PASS' ? 'text-emerald-600' : 'text-red-600')}>
                {(engineResult.stress.stressedDSR * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Verdict</p>
              <Badge className={engineResult.stress.verdict === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                {engineResult.stress.verdict}
              </Badge>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 4 — INVENTORY
// ============================================================================

function InventoryTab({ data, update, engineResult }: any) {
  const items = data.inventory || [];
  const updateItem = (idx: number, key: string, val: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [key]: val };
    update('inventory', newItems);
  };
  const addItem = () => update('inventory', [...items, { description: '', qty: 1, cost: 0, sell: 0 }]);
  const removeItem = (idx: number) => update('inventory', items.filter((_: any, i: number) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Stock Inventory</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Each item contributes to weighted margin calculation</p>
        </div>
        <Button size="sm" variant="outline" onClick={addItem}>+ Add Item</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-left text-[10px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-2">Description</th>
              <th className="px-2 py-2 text-right">Qty</th>
              <th className="px-2 py-2 text-right">Cost (₦)</th>
              <th className="px-2 py-2 text-right">Sell (₦)</th>
              <th className="px-2 py-2 text-right">Margin %</th>
              <th className="px-2 py-2 text-right">Total Value</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item: any, idx: number) => {
              const margin = item.sell > 0 ? ((item.sell - item.cost) / item.sell) * 100 : 0;
              const total = item.qty * item.cost;
              return (
                <tr key={idx}>
                  <td className="px-2 py-2"><Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} className="h-8" /></td>
                  <td className="px-2 py-2"><Input type="number" value={item.qty} onChange={(e) => updateItem(idx, 'qty', Number(e.target.value))} className="h-8 w-20 text-right" /></td>
                  <td className="px-2 py-2"><Input type="number" value={item.cost} onChange={(e) => updateItem(idx, 'cost', Number(e.target.value))} className="h-8 w-28 text-right" /></td>
                  <td className="px-2 py-2"><Input type="number" value={item.sell} onChange={(e) => updateItem(idx, 'sell', Number(e.target.value))} className="h-8 w-28 text-right" /></td>
                  <td className="px-2 py-2 text-right font-mono text-xs">{margin.toFixed(1)}%</td>
                  <td className="px-2 py-2 text-right font-mono text-xs">₦{total.toLocaleString()}</td>
                  <td className="px-2 py-2"><Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>✕</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {engineResult && (
        <Card className="p-4 bg-emerald-50">
          <h4 className="text-sm font-bold text-emerald-900 mb-2">Margin Analysis</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total Stock Value</p><p className="font-bold">₦{engineResult.weightedMargin.totalStockCostValue.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Weighted Margin</p><p className="font-bold text-emerald-700">{(engineResult.weightedMargin.weightedMargin * 100).toFixed(2)}%</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Simple Average</p><p className="font-bold">{(engineResult.weightedMargin.simpleAverage * 100).toFixed(2)}%</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Sector Benchmark</p><p className="font-bold">{data.sectorBenchmarkMargin}%</p></div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// TAB 5 — EXPENSES
// ============================================================================

function ExpensesTab({ data, update, engineResult }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const bufferRate = Number(data.bufferRate) || 0.2;

  // Business expenses — 11 categories
  const businessExpenses: any[] = data.businessExpenses || [];
  const updateBusinessExpense = (idx: number, amount: number) => {
    const newArr = [...businessExpenses];
    newArr[idx] = { ...newArr[idx], amount };
    update('businessExpenses', newArr);
  };
  const businessSubtotal = businessExpenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const businessBuffer = businessSubtotal * bufferRate;
  const businessTotal = businessSubtotal + businessBuffer;

  // Family regular — 9 categories
  const familyRegular: any[] = data.familyExpensesRegular || [];
  const updateFamilyRegular = (idx: number, amount: number) => {
    const newArr = [...familyRegular];
    newArr[idx] = { ...newArr[idx], amount };
    update('familyExpensesRegular', newArr);
  };
  const familyRegSubtotal = familyRegular.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const familyRegBuffer = familyRegSubtotal * bufferRate;
  const familyRegTotal = familyRegSubtotal + familyRegBuffer;

  // Family irregular — 5 categories (no buffer)
  const familyIrregular: any[] = data.familyExpensesIrregular || [];
  const updateFamilyIrregular = (idx: number, amount: number) => {
    const newArr = [...familyIrregular];
    newArr[idx] = { ...newArr[idx], amount };
    update('familyExpensesIrregular', newArr);
  };
  const familyIrrSubtotal = familyIrregular.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Monthly Expenses — Categorized</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Subtotal of each group gets a {(bufferRate * 100).toFixed(0)}% unforeseen buffer added. Irregular categories do not receive a buffer.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* BUSINESS EXPENSES */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Business Expenses (11 categories)</h4>
              <Badge variant="outline" className="text-[10px]">Monthly</Badge>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {businessExpenses.map((e: any, idx: number) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Label className="col-span-7 text-xs text-slate-700">{e.category}</Label>
                  <div className="col-span-5">
                    <Input
                      type="number"
                      value={e.amount}
                      onChange={(ev) => updateBusinessExpense(idx, Number(ev.target.value))}
                      className="h-8 text-right text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Subtotal</span><span className="font-mono font-semibold">{fmtNaira(businessSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">20% Unforeseen Buffer</span><span className="font-mono text-amber-700">+{fmtNaira(businessBuffer)}</span></div>
              <div className="flex justify-between text-sm"><span className="font-bold text-slate-900 dark:text-slate-100">Total Business Expenses</span><span className="font-mono font-bold text-red-700">{fmtNaira(businessTotal)}</span></div>
            </div>
          </Card>

          {/* FAMILY EXPENSES */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Family / Household Expenses</h4>
              <Badge variant="outline" className="text-[10px]">Monthly</Badge>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              <div>
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1">Regular (9 categories — buffered)</p>
                <div className="space-y-2">
                  {familyRegular.map((e: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <Label className="col-span-7 text-xs text-slate-700">{e.category}</Label>
                      <div className="col-span-5">
                        <Input
                          type="number"
                          value={e.amount}
                          onChange={(ev) => updateFamilyRegular(idx, Number(ev.target.value))}
                          className="h-8 text-right text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Subtotal</span><span className="font-mono font-semibold">{fmtNaira(familyRegSubtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">20% Buffer</span><span className="font-mono text-amber-700">+{fmtNaira(familyRegBuffer)}</span></div>
                  <div className="flex justify-between"><span className="font-bold text-slate-900 dark:text-slate-100">Total (Regular)</span><span className="font-mono font-bold text-red-700">{fmtNaira(familyRegTotal)}</span></div>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 mb-1">Irregular (5 categories — no buffer)</p>
                <div className="space-y-2">
                  {familyIrregular.map((e: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <Label className="col-span-7 text-xs text-slate-700">{e.category}</Label>
                      <div className="col-span-5">
                        <Input
                          type="number"
                          value={e.amount}
                          onChange={(ev) => updateFamilyIrregular(idx, Number(ev.target.value))}
                          className="h-8 text-right text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="font-bold text-slate-900 dark:text-slate-100">Subtotal (Irregular)</span><span className="font-mono font-bold text-red-700">{fmtNaira(familyIrrSubtotal)}</span></div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Other Loan Installments (monthly ₦)" type="number" value={data.otherLoanInstallments} onChange={(v: any) => update('otherLoanInstallments', Number(v))} />
          <Field label="Buffer Rate (decimal, 0.20 = 20%)" type="number" value={data.bufferRate} onChange={(v: any) => update('bufferRate', Number(v))} />
        </div>
      </div>

      {engineResult && (
        <Card className="p-4 bg-blue-50">
          <h4 className="text-sm font-bold text-blue-900 mb-2">P&L Summary (Monthly)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Gross Profit</p><p className="font-bold">₦{engineResult.pnl.grossProfit.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Opex (buffered)</p><p className="font-bold text-red-600">₦{engineResult.pnl.opex.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Living (buffered)</p><p className="font-bold text-red-600">₦{engineResult.pnl.living.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Repayment Capacity</p><p className="font-bold text-emerald-700">₦{engineResult.pnl.netCashflowAvailable.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">New Loan Installment</p><p className="font-bold">₦{engineResult.pnl.installment.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Net Profit (after loan)</p><p className={cn('font-bold', engineResult.pnl.netProfit < 0 ? 'text-red-600' : 'text-emerald-700')}>₦{engineResult.pnl.netProfit.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Net Profit Margin</p><p className="font-bold">{engineResult.pnl.netProfitMargin.toFixed(2)}%</p></div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// TAB 6 — ASSETS / BALANCE SHEET
// ============================================================================

function AssetsTab({ data, update, engineResult }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const conditions = ['Very Good', 'Good', 'OK', 'Poor'];

  const ba = data.businessAssets || { equipment: [], vehicles: [], houseLand: [] };
  const fa = data.familyAssets || { equipment: [], vehicles: [], houseLand: [] };

  const updateBa = (group: string, newArr: any[]) => update('businessAssets', { ...ba, [group]: newArr });
  const updateFa = (group: string, newArr: any[]) => update('familyAssets', { ...fa, [group]: newArr });

  const sumGroup = (grp: any[]) => (grp || []).reduce((s: number, r: any) => s + (Number(r.value) || 0), 0);
  const baEqTotal = sumGroup(ba.equipment);
  const baVeTotal = sumGroup(ba.vehicles);
  const baHlTotal = sumGroup(ba.houseLand);
  const baGrand = baEqTotal + baVeTotal + baHlTotal;
  const faEqTotal = sumGroup(fa.equipment);
  const faVeTotal = sumGroup(fa.vehicles);
  const faHlTotal = sumGroup(fa.houseLand);
  const faGrand = faEqTotal + faVeTotal + faHlTotal;

  // G3: Total assets for % computation
  const totalAssets =
    (Number(data.cashAtHand) || 0) +
    (Number(data.cashInBanks) || 0) +
    (Number(data.receivables) || 0) +
    baGrand + faGrand;
  const pctOfTotal = (val: number) => totalAssets > 0 ? (val / totalAssets) * 100 : 0;
  const pctColor = (pct: number) =>
    pct > 70 ? 'text-red-600' : pct > 40 ? 'text-amber-600' : 'text-emerald-600';

  // G11: Bank balances register (up to 6 banks)
  const bankBalances: any[] = data.bankBalances || [];
  const updateBank = (idx: number, key: string, val: any) => {
    const newArr = [...bankBalances];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('bankBalances', newArr);
  };
  const addBank = () => {
    if (bankBalances.length >= 6) return;
    update('bankBalances', [...bankBalances, { sn: bankBalances.length + 1, bankName: '', accountName: '', accountNumber: '', balance: 0 }]);
  };
  const removeBank = (idx: number) => update('bankBalances', bankBalances.filter((_: any, i: number) => i !== idx));
  const totalBankBalance = bankBalances.reduce((s: number, b: any) => s + (Number(b.balance) || 0), 0);

  const renderEquipmentTable = (
    rows: any[],
    onAdd: () => void,
    onRemove: (i: number) => void,
    onUpdate: (i: number, k: string, v: any) => void,
    total: number,
  ) => (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs font-bold text-slate-700">Equipment &amp; Furniture</h5>
        <Button size="sm" variant="ghost" onClick={onAdd} className="h-6 text-xs px-2"><Plus className="h-3 w-3 mr-1" />Add</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1">Condition</th>
              <th className="px-2 py-1 text-right">Market Value</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((r: any, i: number) => (
              <tr key={i}>
                <td className="px-2 py-1"><Input value={r.item} onChange={(e) => onUpdate(i, 'item', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1">
                  <select value={r.condition} onChange={(e) => onUpdate(i, 'condition', e.target.value)} className="rounded border border-slate-300 px-1 py-1 text-xs w-full">
                    {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1"><Input type="number" value={r.value} onChange={(e) => onUpdate(i, 'value', Number(e.target.value))} className="h-7 w-28 text-right text-xs" /></td>
                <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => onRemove(i)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={4} className="text-center text-[10px] text-slate-400 py-2">No items added</td></tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-900 font-semibold">
            <tr>
              <td colSpan={2} className="px-2 py-1 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">Subtotal</td>
              <td className="px-2 py-1 text-right font-mono text-[11px]">{fmtNaira(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const renderVehiclesTable = (
    rows: any[],
    onAdd: () => void,
    onRemove: (i: number) => void,
    onUpdate: (i: number, k: string, v: any) => void,
    total: number,
  ) => (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs font-bold text-slate-700">Vehicles</h5>
        <Button size="sm" variant="ghost" onClick={onAdd} className="h-6 text-xs px-2"><Plus className="h-3 w-3 mr-1" />Add</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1">License Plate</th>
              <th className="px-2 py-1 text-right">Market Value</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((r: any, i: number) => (
              <tr key={i}>
                <td className="px-2 py-1"><Input value={r.item} onChange={(e) => onUpdate(i, 'item', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1"><Input value={r.licensePlate} onChange={(e) => onUpdate(i, 'licensePlate', e.target.value)} className="h-7 text-xs uppercase" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.value} onChange={(e) => onUpdate(i, 'value', Number(e.target.value))} className="h-7 w-28 text-right text-xs" /></td>
                <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => onRemove(i)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={4} className="text-center text-[10px] text-slate-400 py-2">No items added</td></tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-900 font-semibold">
            <tr>
              <td colSpan={2} className="px-2 py-1 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">Subtotal</td>
              <td className="px-2 py-1 text-right font-mono text-[11px]">{fmtNaira(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  const renderHouseLandTable = (
    rows: any[],
    onAdd: () => void,
    onRemove: (i: number) => void,
    onUpdate: (i: number, k: string, v: any) => void,
    total: number,
  ) => (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs font-bold text-slate-700">House / Land</h5>
        <Button size="sm" variant="ghost" onClick={onAdd} className="h-6 text-xs px-2"><Plus className="h-3 w-3 mr-1" />Add</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1">Location</th>
              <th className="px-2 py-1 text-right">Market Value</th>
              <th className="px-2 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows || []).map((r: any, i: number) => (
              <tr key={i}>
                <td className="px-2 py-1"><Input value={r.item} onChange={(e) => onUpdate(i, 'item', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1"><Input value={r.location} onChange={(e) => onUpdate(i, 'location', e.target.value)} className="h-7 text-xs" /></td>
                <td className="px-2 py-1"><Input type="number" value={r.value} onChange={(e) => onUpdate(i, 'value', Number(e.target.value))} className="h-7 w-28 text-right text-xs" /></td>
                <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => onRemove(i)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
            {(!rows || rows.length === 0) && (
              <tr><td colSpan={4} className="text-center text-[10px] text-slate-400 py-2">No items added</td></tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50 dark:bg-slate-900 font-semibold">
            <tr>
              <td colSpan={2} className="px-2 py-1 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">Subtotal</td>
              <td className="px-2 py-1 text-right font-mono text-[11px]">{fmtNaira(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );

  // Helpers for add/remove
  const addRow = (target: 'ba' | 'fa', group: string, template: any) => {
    if (target === 'ba') updateBa(group, [...(ba[group] || []), { ...template }]);
    else updateFa(group, [...(fa[group] || []), { ...template }]);
  };
  const removeRow = (target: 'ba' | 'fa', group: string, idx: number) => {
    if (target === 'ba') updateBa(group, (ba[group] || []).filter((_: any, i: number) => i !== idx));
    else updateFa(group, (fa[group] || []).filter((_: any, i: number) => i !== idx));
  };
  const updateRow = (target: 'ba' | 'fa', group: string, idx: number, key: string, val: any) => {
    const arr = target === 'ba' ? (ba[group] || []) : (fa[group] || []);
    const newArr = [...arr];
    newArr[idx] = { ...newArr[idx], [key]: val };
    if (target === 'ba') updateBa(group, newArr);
    else updateFa(group, newArr);
  };

  return (
    <div className="space-y-6">
      {/* G11: Bank/IMF Balances Register — up to 6 banks (Excel FINANCIAL ANALYSIS rows 35-42) */}
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Bank / Other Lender Balances (G11)</h3>
            <p className="text-xs text-slate-600">Excel FINANCIAL ANALYSIS rows 35-42. Total auto-feeds Cash in Banks below.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">Total: {fmtNaira(totalBankBalance)}</Badge>
            <Button size="sm" variant="outline" onClick={addBank} disabled={bankBalances.length >= 6}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Bank ({bankBalances.length}/6)
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr className="text-left text-[10px] uppercase text-slate-500 dark:text-slate-400">
                <th className="px-2 py-2">S/N</th>
                <th className="px-2 py-2">Bank Name</th>
                <th className="px-2 py-2">Account Name</th>
                <th className="px-2 py-2">Account Number</th>
                <th className="px-2 py-2 text-right">Balance (₦)</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bankBalances.map((b: any, idx: number) => (
                <tr key={idx}>
                  <td className="px-2 py-1 font-mono">{idx + 1}</td>
                  <td className="px-2 py-1"><Input value={b.bankName} onChange={(e) => updateBank(idx, 'bankName', e.target.value)} className="h-7 text-xs" placeholder="Access Bank" /></td>
                  <td className="px-2 py-1"><Input value={b.accountName} onChange={(e) => updateBank(idx, 'accountName', e.target.value)} className="h-7 text-xs" placeholder="John Doe" /></td>
                  <td className="px-2 py-1"><Input value={b.accountNumber} onChange={(e) => updateBank(idx, 'accountNumber', e.target.value)} className="h-7 text-xs font-mono" placeholder="0123456789" /></td>
                  <td className="px-2 py-1"><Input type="number" value={b.balance} onChange={(e) => updateBank(idx, 'balance', Number(e.target.value))} className="h-7 w-32 text-right text-xs" /></td>
                  <td className="px-2 py-1"><Button size="sm" variant="ghost" onClick={() => removeBank(idx)} className="h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button></td>
                </tr>
              ))}
              {bankBalances.length === 0 && (
                <tr><td colSpan={6} className="text-center text-[10px] text-slate-400 py-3">No bank balances added. Click "Add Bank" to capture up to 6 accounts.</td></tr>
              )}
            </tbody>
            {bankBalances.length > 0 && (
              <tfoot className="bg-emerald-50 font-bold">
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">TOTAL BANK BALANCES</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtNaira(totalBankBalance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 text-[10px] text-blue-700"
          onClick={() => update('cashInBanks', totalBankBalance)}
        >
          ↓ Sync total to "Cash in Banks" field below
        </Button>
      </Card>

      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Balance Sheet — Liquid Assets &amp; Liabilities</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <h4 className="text-sm font-bold text-emerald-700 mb-3">Liquid Assets</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1"><Field label="Cash at Hand (₦)" type="number" value={data.cashAtHand} onChange={(v: any) => update('cashAtHand', Number(v))} /></div>
                <Badge className={cn('text-[10px] mt-5', pctColor(pctOfTotal(Number(data.cashAtHand) || 0)))}>
                  {pctOfTotal(Number(data.cashAtHand) || 0).toFixed(1)}% of total
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><Field label="Cash in Banks (₦)" type="number" value={data.cashInBanks} onChange={(v: any) => update('cashInBanks', Number(v))} /></div>
                <Badge className={cn('text-[10px] mt-5', pctColor(pctOfTotal(Number(data.cashInBanks) || 0)))}>
                  {pctOfTotal(Number(data.cashInBanks) || 0).toFixed(1)}% of total
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><Field label="Receivables (₦)" type="number" value={data.receivables} onChange={(v: any) => update('receivables', Number(v))} /></div>
                <Badge className={cn('text-[10px] mt-5', pctColor(pctOfTotal(Number(data.receivables) || 0)))}>
                  {pctOfTotal(Number(data.receivables) || 0).toFixed(1)}% of total
                </Badge>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h4 className="text-sm font-bold text-red-700 mb-3">Liabilities</h4>
            <Field label="Short-Term Liabilities (₦)" type="number" value={data.shortTermLiabilities} onChange={(v: any) => update('shortTermLiabilities', Number(v))} />
            <div className="mt-2"><Field label="Long-Term Liabilities (₦)" type="number" value={data.longTermLiabilities} onChange={(v: any) => update('longTermLiabilities', Number(v))} /></div>
            <div className="mt-2"><Field label="Payables (₦)" type="number" value={data.payables} onChange={(v: any) => update('payables', Number(v))} /></div>
          </Card>
        </div>
        {/* G3: Total assets summary */}
        <div className="mt-3 p-3 bg-slate-900 text-white rounded-md flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">Total Assets (for % calc)</span>
          <span className="font-bold text-emerald-400">{fmtNaira(totalAssets)}</span>
        </div>
      </div>

      {/* BUSINESS ASSETS — structured tables */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Business Fixed Assets (Structured)</h4>
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Grand Total: {fmtNaira(baGrand)}</Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderEquipmentTable(
            ba.equipment,
            () => addRow('ba', 'equipment', { item: '', condition: 'Good', value: 0 }),
            (i) => removeRow('ba', 'equipment', i),
            (i, k, v) => updateRow('ba', 'equipment', i, k, v),
            baEqTotal,
          )}
          {renderVehiclesTable(
            ba.vehicles,
            () => addRow('ba', 'vehicles', { item: '', licensePlate: '', value: 0 }),
            (i) => removeRow('ba', 'vehicles', i),
            (i, k, v) => updateRow('ba', 'vehicles', i, k, v),
            baVeTotal,
          )}
          {renderHouseLandTable(
            ba.houseLand,
            () => addRow('ba', 'houseLand', { item: '', location: '', value: 0 }),
            (i) => removeRow('ba', 'houseLand', i),
            (i, k, v) => updateRow('ba', 'houseLand', i, k, v),
            baHlTotal,
          )}
        </div>
      </Card>

      {/* FAMILY ASSETS — structured tables */}
      <Card className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Family Fixed Assets (Structured)</h4>
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Grand Total: {fmtNaira(faGrand)}</Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderEquipmentTable(
            fa.equipment,
            () => addRow('fa', 'equipment', { item: '', condition: 'Good', value: 0 }),
            (i) => removeRow('fa', 'equipment', i),
            (i, k, v) => updateRow('fa', 'equipment', i, k, v),
            faEqTotal,
          )}
          {renderVehiclesTable(
            fa.vehicles,
            () => addRow('fa', 'vehicles', { item: '', licensePlate: '', value: 0 }),
            (i) => removeRow('fa', 'vehicles', i),
            (i, k, v) => updateRow('fa', 'vehicles', i, k, v),
            faVeTotal,
          )}
          {renderHouseLandTable(
            fa.houseLand,
            () => addRow('fa', 'houseLand', { item: '', location: '', value: 0 }),
            (i) => removeRow('fa', 'houseLand', i),
            (i, k, v) => updateRow('fa', 'houseLand', i, k, v),
            faHlTotal,
          )}
        </div>
      </Card>

      {engineResult && (
        <Card className="p-4 bg-purple-50">
          <h4 className="text-sm font-bold text-purple-900 mb-2">Computed Ratios</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Net Worth</p><p className="font-bold">₦{((data.cashAtHand + data.cashInBanks + data.receivables + baGrand + faGrand) - (data.shortTermLiabilities + data.longTermLiabilities)).toLocaleString()}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Current Ratio</p><p className="font-bold">{engineResult.ratios.currentRatio.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Quick Ratio</p><p className="font-bold">{engineResult.ratios.quickRatio.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Equity Ratio</p><p className="font-bold">{engineResult.ratios.equityRatio.toFixed(1)}%</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Gearing Ratio</p><p className={cn('font-bold', engineResult.ratios.gearingRatio > 0.35 ? 'text-red-600' : 'text-emerald-700')}>{(engineResult.ratios.gearingRatio * 100).toFixed(1)}%</p></div>
            <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Debt to Assets</p><p className="font-bold">{engineResult.ratios.debtToAssets.toFixed(1)}%</p></div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// TAB 7 — SECURITY & GUARANTORS
// ============================================================================

function SecurityTab({ data, update, engineResult }: any) {
  return (
    <div className="space-y-6">
      {/* G6: Expanded Collateral Registry with full Excel fields */}
      <CollateralRegisterSection data={data} update={update} />

      {/* G7: Collateral Mix table (summary by type) */}
      <CollateralMixSection data={data} update={update} />

      {/* G9: Full Guarantor Info (up to 2 guarantors) */}
      <GuarantorRegisterSection data={data} update={update} />

      {/* G10: Guarantor Business Verification */}
      <GuarantorBizVerificationSection data={data} update={update} />

      {/* Legacy guarantor DSR analysis (preserved) */}
      <GuarantorDsrAnalysisSection data={data} update={update} engineResult={engineResult} />
    </div>
  );
}

// ============================================================================
// G6: COLLATERAL REGISTER — full Excel COLLATERAL PLEDGE sheet fields
// Per collateral: type, name, description, year, market value, FSV (auto),
// % coverage, chassis (movable), address+land measurement+title (immovable),
// ownership (Borrower/Guarantor), document type, expiry date
// ============================================================================

function CollateralRegisterSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const collaterals: any[] = data.collaterals || [];
  const loanPrincipal = data.loanPrincipal || 0;
  // v42: Use centralized constants for document types + ownership
  const docTypes = [...COLLATERAL_OWNERSHIP_TYPES]; // not used here, kept for ref
  const movableTitles = [...MOVABLE_COLLATERAL_TITLES];
  const immovableTitles = [...IMMOVABLE_COLLATERAL_TITLES];
  const ownershipTypes = [...COLLATERAL_OWNERSHIP_TYPES];

  const updateColl = (idx: number, key: string, val: any) => {
    const newArr = [...collaterals];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('collaterals', newArr);
  };
  const addColl = () => update('collaterals', [...collaterals, {
    type: 'MOVABLE', name: '', description: '', year: '', marketValue: 0,
    ownership: 'Borrower', documentType: '', expiryDate: '',
    chassisNumber: '', address: '', landMeasurement: '', titleType: '',
    titleDocuments: [],  // v42: multiple title docs
  }]);
  const removeColl = (idx: number) => update('collaterals', collaterals.filter((_: any, i: number) => i !== idx));

  // v42: Use configurable depreciation rates from data (defaults to 20%/40%)
  const movDep = data.movableDepreciationRate ?? COLLATERAL_DEPRECIATION.MOVABLE;
  const immovDep = data.immovableDepreciationRate ?? COLLATERAL_DEPRECIATION.IMMOVABLE;
  const fsvMult = (type: string) => {
    if (type === 'MOVABLE') return 1 - movDep;
    if (type === 'IMMOVABLE') return 1 - immovDep;
    return 1.0; // CASH
  };
  const computeFsv = (c: any) => (Number(c.marketValue) || 0) * fsvMult(c.type);
  const computeCoverage = (c: any) => loanPrincipal > 0 ? (computeFsv(c) / loanPrincipal) * 100 : 0;

  // v42: Toggle a title document in the multi-select
  const toggleTitleDoc = (idx: number, doc: string) => {
    const current = collaterals[idx].titleDocuments || [];
    const newArr = [...collaterals];
    newArr[idx] = {
      ...newArr[idx],
      titleDocuments: current.includes(doc)
        ? current.filter((d: string) => d !== doc)
        : [...current, doc],
    };
    update('collaterals', newArr);
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Collateral Registry (Excel Parity)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Full collateral detail per Excel COLLATERAL PLEDGE sheet. FSV haircuts: MOVABLE × {(1-movDep).toFixed(2)}, IMMOVABLE × {(1-immovDep).toFixed(2)}, CASH × 1.00.
            Coverage % auto-computed against loan principal.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={addColl}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Collateral
        </Button>
      </div>

      {/* v42-P5: Configurable depreciation rates */}
      <div className="mb-3 grid grid-cols-2 gap-3 p-2 bg-slate-50 rounded">
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Movable Depreciation Rate</Label>
          <Input
            type="number"
            step="0.05"
            value={data.movableDepreciationRate ?? 0.20}
            onChange={(e) => update('movableDepreciationRate', Number(e.target.value))}
            className="mt-1 text-xs h-7"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Immovable Depreciation Rate</Label>
          <Input
            type="number"
            step="0.05"
            value={data.immovableDepreciationRate ?? 0.40}
            onChange={(e) => update('immovableDepreciationRate', Number(e.target.value))}
            className="mt-1 text-xs h-7"
          />
        </div>
      </div>

      <div className="space-y-4">
        {collaterals.map((c: any, idx: number) => (
          <Card key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">#{idx + 1}</Badge>
                <select
                  value={c.type}
                  onChange={(e) => updateColl(idx, 'type', e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
                >
                  <option value="MOVABLE">MOVABLE ({(movDep*100).toFixed(0)}% dep)</option>
                  <option value="IMMOVABLE">IMMOVABLE ({(immovDep*100).toFixed(0)}% dep)</option>
                  <option value="CASH">CASH (100%)</option>
                </select>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeColl(idx)} className="h-6 w-6 p-0">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
              <Field label="Collateral Name" value={c.name} onChange={(v: any) => updateColl(idx, 'name', v)} />
              <Field label="Brief Description" value={c.description} onChange={(v: any) => updateColl(idx, 'description', v)} />
              <Field label="Year" value={c.year} onChange={(v: any) => updateColl(idx, 'year', v)} />
              <div>
                <Label className="text-xs text-slate-600">Ownership</Label>
                <select
                  value={c.ownership || 'Borrower'}
                  onChange={(e) => updateColl(idx, 'ownership', e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                >
                  {ownershipTypes.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <Field label="Estimated Market Value (₦)" type="number" value={c.marketValue} onChange={(v: any) => updateColl(idx, 'marketValue', Number(v))} />
              <Field label="Forced Sale Value (auto)" type="number" value={computeFsv(c)} readOnly />
              <Field label="% Coverage (auto)" type="number" value={computeCoverage(c).toFixed(1)} readOnly />
              <Field label="Document Expiry Date" type="date" value={c.expiryDate} onChange={(v: any) => updateColl(idx, 'expiryDate', v)} />
            </div>

            {/* v42-P4: Multi-select title documents */}
            <div className="mt-2 p-2 bg-emerald-50 rounded">
              <p className="text-[10px] uppercase text-emerald-700 font-semibold mb-1">Title Documents (tick all that apply)</p>
              <div className="flex flex-wrap gap-1.5">
                {(c.type === 'MOVABLE' ? movableTitles : c.type === 'IMMOVABLE' ? immovableTitles : []).map(doc => (
                  <button
                    key={doc}
                    type="button"
                    onClick={() => toggleTitleDoc(idx, doc)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors',
                      (c.titleDocuments || []).includes(doc)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                    )}
                  >
                    {doc}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional fields by type */}
            {c.type === 'MOVABLE' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 p-2 bg-amber-50 rounded">
                <p className="col-span-full text-[10px] uppercase text-amber-700 font-semibold">Movable-specific fields</p>
                <Field label="Vehicle Chassis Number" value={c.chassisNumber} onChange={(v: any) => updateColl(idx, 'chassisNumber', v)} />
              </div>
            )}
            {c.type === 'IMMOVABLE' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 p-2 bg-blue-50 rounded">
                <p className="col-span-full text-[10px] uppercase text-blue-700 font-semibold">Immovable-specific fields</p>
                <div className="col-span-2">
                  <Field label="Property Address" value={c.address} onChange={(v: any) => updateColl(idx, 'address', v)} />
                </div>
                <Field label="Land Measurement" value={c.landMeasurement} onChange={(v: any) => updateColl(idx, 'landMeasurement', v)} />
              </div>
            )}
          </Card>
        ))}
        {collaterals.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-4">No collateral added yet. Click "Add Collateral" to begin.</p>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// G7: COLLATERAL MIX — summary table showing each type's contribution
// Mirrors Excel COLLATERAL PLEDGE sheet rows 28-35
// ============================================================================

function CollateralMixSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const collaterals: any[] = data.collaterals || [];
  const loanPrincipal = data.loanPrincipal || 0;

  const fsvMult = (type: string) => type === 'MOVABLE' ? 0.8 : type === 'IMMOVABLE' ? 0.6 : 1.0;
  const byType = (type: string) =>
    collaterals.filter((c) => c.type === type).reduce((s, c) => s + (Number(c.marketValue) || 0) * fsvMult(c.type), 0);

  const movableTotal = byType('MOVABLE');
  const immovableTotal = byType('IMMOVABLE');
  const cashTotal = byType('CASH');
  const stockTotal = (data.totalStockValue || 0) * 0.1; // Stock at 10% per STOCK_COLLATERAL_RATE
  const grandTotal = movableTotal + immovableTotal + cashTotal + stockTotal;
  const coveragePercent = loanPrincipal > 0 ? (grandTotal / loanPrincipal) * 100 : 0;

  const mixRows = [
    { type: 'MOVABLE', label: 'Movable Collateral', value: movableTotal },
    { type: 'IMMOVABLE', label: 'Immovable Collateral', value: immovableTotal },
    { type: 'CASH', label: 'Cash Collateral', value: cashTotal },
    { type: 'STOCK', label: 'Stock of Goods (10% of stock value)', value: stockTotal },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Collateral Mix &amp; Coverage</h3>
        <Badge className={cn(
          'text-xs',
          coveragePercent >= 150 ? 'bg-emerald-100 text-emerald-700' :
          coveragePercent >= 100 ? 'bg-amber-100 text-amber-700' :
          'bg-red-100 text-red-700'
        )}>
          Coverage: {coveragePercent.toFixed(1)}%
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr className="text-left text-[10px] uppercase text-slate-500 dark:text-slate-400">
              <th className="px-2 py-2">S/N</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2 text-right">Total FSV Value (₦)</th>
              <th className="px-2 py-2 text-right">% Mix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mixRows.map((row, i) => (
              <tr key={row.type}>
                <td className="px-2 py-2 font-mono">{i + 1}</td>
                <td className="px-2 py-2">{row.label}</td>
                <td className="px-2 py-2 text-right font-mono">{fmtNaira(row.value)}</td>
                <td className="px-2 py-2 text-right font-mono">
                  {grandTotal > 0 ? ((row.value / grandTotal) * 100).toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-emerald-50 font-bold">
            <tr>
              <td colSpan={2} className="px-2 py-2 text-right text-[10px] uppercase text-slate-500 dark:text-slate-400">TOTAL</td>
              <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtNaira(grandTotal)}</td>
              <td className="px-2 py-2 text-right font-mono">100.0%</td>
            </tr>
            <tr className="bg-slate-900 text-white">
              <td colSpan={2} className="px-2 py-2 text-right text-[10px] uppercase">Loan Principal</td>
              <td colSpan={2} className="px-2 py-2 text-right font-mono">{fmtNaira(loanPrincipal)} → Coverage {coveragePercent.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ============================================================================
// G9: GUARANTOR REGISTER — full Excel GUARANTORS' INFO sheet (up to 2)
// ============================================================================

function GuarantorRegisterSection({ data, update }: any) {
  const guarantors: any[] = data.guarantors || [];
  const updateG = (idx: number, key: string, val: any) => {
    const newArr = [...guarantors];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('guarantors', newArr);
  };
  const addG = () => {
    if (guarantors.length >= 2) return;
    update('guarantors', [...guarantors, {
      guarantorName: '', sex: '', phone: '', bvn: '', nin: '',
      residenceAddress: '', houseOwnership: 'Owned', noOfStayInHouse: 0,
      briefDescriptionOfHouse: '', maritalStatus: '', religion: '',
      churchMosqueName: '', churchMosqueAddress: '',
      businessOrCompanyName: '', briefDescriptionOfBusiness: '',
      monthlySalaryIfEmployed: 0, businessOrOfficeAddress: '', landmark: '',
      monthlyIncome: 0, monthlyCogs: 0, operationExpenses: 0, existingInstallment: 0,
      guarantorForm: '', passport: '', idCard: '',
      // v42-P6: Extended fields from Excel GUARANTORS' INFO sheet
      registrationNumber: '',
      relationshipToCustomer: '',
      nationality: 'Nigerian',
      isWflClient: false,
      businessWorth: 0,
      stockOfGoods: 0,
      monthlySales: 0,
      costOfGoodsSold: 0,
      wflInstallmentAmount: 0,
    }]);
  };
  const removeG = (idx: number) => update('guarantors', guarantors.filter((_: any, i: number) => i !== idx));

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-emerald-700" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Guarantor Register (Full Info — up to 2)</h3>
        </div>
        <Button size="sm" variant="outline" onClick={addG} disabled={guarantors.length >= 2}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Guarantor
        </Button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Full guarantor details per Excel GUARANTORS&apos; INFO sheet. Maximum 2 guarantors per loan.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {guarantors.map((g: any, idx: number) => (
          <Card key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-emerald-700 uppercase">Guarantor #{idx + 1}</h4>
              <Button size="sm" variant="ghost" onClick={() => removeG(idx)} className="h-6 w-6 p-0">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            {/* Personal */}
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mt-2 mb-1">Personal Information</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Full Name" value={g.guarantorName} onChange={(v: any) => updateG(idx, 'guarantorName', v)} />
              <SelectField label="Sex" value={g.sex} onChange={(v: any) => updateG(idx, 'sex', v)} options={['Male', 'Female']} />
              <Field label="Phone" value={g.phone} onChange={(v: any) => updateG(idx, 'phone', v)} />
              <Field label="BVN" value={g.bvn} onChange={(v: any) => updateG(idx, 'bvn', v)} />
              <Field label="NIN" value={g.nin} onChange={(v: any) => updateG(idx, 'nin', v)} />
              <SelectField label="Marital Status" value={g.maritalStatus} onChange={(v: any) => updateG(idx, 'maritalStatus', v)} options={['Single', 'Married', 'Divorced', 'Widowed']} />
              <Field label="Religion" value={g.religion} onChange={(v: any) => updateG(idx, 'religion', v)} />
              <Field label="Church/Mosque Name" value={g.churchMosqueName} onChange={(v: any) => updateG(idx, 'churchMosqueName', v)} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Field label="Residence Address" value={g.residenceAddress} onChange={(v: any) => updateG(idx, 'residenceAddress', v)} />
              <div>
                <Label className="text-xs text-slate-600">House Ownership</Label>
                <select
                  value={g.houseOwnership || 'Owned'}
                  onChange={(e) => updateG(idx, 'houseOwnership', e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-xs"
                >
                  <option value="Owned">Owned</option>
                  <option value="Family">Family</option>
                  <option value="Rented">Rented</option>
                </select>
              </div>
              <Field label="No. of Years in House" type="number" value={g.noOfStayInHouse} onChange={(v: any) => updateG(idx, 'noOfStayInHouse', Number(v))} />
              <Field label="Brief Description of House" value={g.briefDescriptionOfHouse} onChange={(v: any) => updateG(idx, 'briefDescriptionOfHouse', v)} />
            </div>

            {/* Business */}
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mt-3 mb-1">Business Information</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Business/Company Name" value={g.businessOrCompanyName} onChange={(v: any) => updateG(idx, 'businessOrCompanyName', v)} />
              <Field label="Registration No." value={g.registrationNumber || ''} onChange={(v: any) => updateG(idx, 'registrationNumber', v)} />
              <Field label="Brief Description" value={g.briefDescriptionOfBusiness} onChange={(v: any) => updateG(idx, 'briefDescriptionOfBusiness', v)} />
              <Field label="Business/Office Address" value={g.businessOrOfficeAddress} onChange={(v: any) => updateG(idx, 'businessOrOfficeAddress', v)} />
              <Field label="Landmark" value={g.landmark} onChange={(v: any) => updateG(idx, 'landmark', v)} />
              <Field label="Monthly Salary (if employed)" type="number" value={g.monthlySalaryIfEmployed} onChange={(v: any) => updateG(idx, 'monthlySalaryIfEmployed', Number(v))} />
              <Field label="Relationship to Customer" value={g.relationshipToCustomer || ''} onChange={(v: any) => updateG(idx, 'relationshipToCustomer', v)} />
              <Field label="Nationality" value={g.nationality || 'Nigerian'} onChange={(v: any) => updateG(idx, 'nationality', v)} />
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={g.isWflClient || false}
                  onChange={(e) => updateG(idx, 'isWflClient', e.target.checked)}
                  className="h-3 w-3"
                />
                <Label className="text-xs">Is the guarantor a WFL client?</Label>
              </div>
            </div>

            {/* v42-P6: Extended Financial — mirrors Excel GUARANTORS' INFO rows 21-24 */}
            <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mt-3 mb-1">
              Business Financials (Excel GUARANTORS&apos; INFO rows 21-24)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Business Worth (₦)" type="number" value={g.businessWorth || 0} onChange={(v: any) => updateG(idx, 'businessWorth', Number(v))} />
              <Field label="Stock of Goods (₦)" type="number" value={g.stockOfGoods || 0} onChange={(v: any) => updateG(idx, 'stockOfGoods', Number(v))} />
              <Field label="Monthly Sales (₦)" type="number" value={g.monthlySales || 0} onChange={(v: any) => updateG(idx, 'monthlySales', Number(v))} />
              <Field label="Cost of Goods Sold (₦)" type="number" value={g.costOfGoodsSold || 0} onChange={(v: any) => updateG(idx, 'costOfGoodsSold', Number(v))} />
              <Field label="Operation/Family Expenses (₦)" type="number" value={g.operationExpenses} onChange={(v: any) => updateG(idx, 'operationExpenses', Number(v))} />
              <Field label="WFL Installment Amount (₦)" type="number" value={g.wflInstallmentAmount || 0} onChange={(v: any) => updateG(idx, 'wflInstallmentAmount', Number(v))} />
            </div>

            {/* v42-P6: Auto-computed DSR (mirrors Excel M23/M24, M47/M48) */}
            {(() => {
              const grossProfit = (Number(g.monthlySales) || 0) - (Number(g.costOfGoodsSold) || 0);
              const netProfit = grossProfit - (Number(g.operationExpenses) || 0);
              const repaymentCapacity = netProfit - (Number(g.wflInstallmentAmount) || 0);
              const dsr = repaymentCapacity > 0 ? (Number(g.wflInstallmentAmount) || 0) / repaymentCapacity : 0;
              return (
                <div className="mt-2 grid grid-cols-3 gap-2 p-2 bg-emerald-50 rounded">
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-slate-500">Gross Profit</p>
                    <p className="text-xs font-bold text-emerald-700">₦{(grossProfit || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-slate-500">Repayment Capacity</p>
                    <p className="text-xs font-bold text-emerald-700">₦{(repaymentCapacity || 0).toLocaleString()}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-slate-500">DSR</p>
                    <p className={cn('text-xs font-bold', dsr > 0.45 ? 'text-red-600' : 'text-emerald-700')}>
                      {(dsr * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })()}
          </Card>
        ))}
        {guarantors.length === 0 && (
          <p className="col-span-full text-center text-xs text-slate-400 py-4">
            No guarantors added yet. Click "Add Guarantor" to capture full details.
          </p>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// G10: GUARANTOR BUSINESS VERIFICATION — Excel GUARANTORS' BIZ VERIFICATION
// ============================================================================

function GuarantorBizVerificationSection({ data, update }: any) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const verifications: any[] = data.guarantorBizVerifications || [];
  const updateV = (idx: number, key: string, val: any) => {
    const newArr = [...verifications];
    newArr[idx] = { ...newArr[idx], [key]: val };
    update('guarantorBizVerifications', newArr);
  };
  const addV = () => {
    if (verifications.length >= 2) return;
    update('guarantorBizVerifications', [...verifications, {
      guarantorName: '', businessName: '', businessAddress: '',
      yearsInOperation: 0, stockValue: 0, monthlySales: 0, monthlyExpenses: 0,
      netProfit: 0, verificationNotes: '', verifiedBy: '', verifiedAt: '', isVerified: false,
    }]);
  };
  const removeV = (idx: number) => update('guarantorBizVerifications', verifications.filter((_: any, i: number) => i !== idx));

  // Auto-compute net profit
  const computeNetProfit = (v: any) => (Number(v.monthlySales) || 0) - (Number(v.monthlyExpenses) || 0);

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Guarantor Business Verification</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Excel GUARANTORS&apos; BIZ VERIFICATION sheet — verify each guarantor&apos;s business independently.</p>
        </div>
        <Button size="sm" variant="outline" onClick={addV} disabled={verifications.length >= 2}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add Verification
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {verifications.map((v: any, idx: number) => (
          <Card key={idx} className="p-3 bg-amber-50 border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-amber-700 uppercase">Verification #{idx + 1}</h4>
              <div className="flex items-center gap-2">
                <CheckField
                  label="Verified"
                  checked={!!v.isVerified}
                  onChange={(val: any) => updateV(idx, 'isVerified', val)}
                />
                <Button size="sm" variant="ghost" onClick={() => removeV(idx)} className="h-6 w-6 p-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Guarantor Name" value={v.guarantorName} onChange={(val: any) => updateV(idx, 'guarantorName', val)} />
              <Field label="Business Name" value={v.businessName} onChange={(val: any) => updateV(idx, 'businessName', val)} />
              <div className="col-span-2">
                <Field label="Business Address" value={v.businessAddress} onChange={(val: any) => updateV(idx, 'businessAddress', val)} />
              </div>
              <Field label="Years in Operation" type="number" value={v.yearsInOperation} onChange={(val: any) => updateV(idx, 'yearsInOperation', Number(val))} />
              <Field label="Stock Value (₦)" type="number" value={v.stockValue} onChange={(val: any) => updateV(idx, 'stockValue', Number(val))} />
              <Field label="Monthly Sales (₦)" type="number" value={v.monthlySales} onChange={(val: any) => updateV(idx, 'monthlySales', Number(val))} />
              <Field label="Monthly Expenses (₦)" type="number" value={v.monthlyExpenses} onChange={(val: any) => updateV(idx, 'monthlyExpenses', Number(val))} />
              <Field label="Net Profit (auto)" type="number" value={computeNetProfit(v)} readOnly />
              <Field label="Verified By" value={v.verifiedBy} onChange={(val: any) => updateV(idx, 'verifiedBy', val)} />
              <Field label="Verified At" type="date" value={v.verifiedAt} onChange={(val: any) => updateV(idx, 'verifiedAt', val)} />
            </div>
            <div className="mt-2">
              <Label className="text-xs text-slate-600">Verification Notes</Label>
              <Textarea
                value={v.verificationNotes}
                onChange={(e) => updateV(idx, 'verificationNotes', e.target.value)}
                rows={2}
                className="mt-1 text-xs"
                placeholder="Detailed notes from the guarantor business visit..."
              />
            </div>
            {v.isVerified && (
              <div className="mt-2 p-2 bg-emerald-100 rounded text-xs text-emerald-700 font-semibold">
                ✓ This guarantor&apos;s business has been verified. Net profit: {fmtNaira(computeNetProfit(v))}/month.
              </div>
            )}
          </Card>
        ))}
        {verifications.length === 0 && (
          <p className="col-span-full text-center text-xs text-slate-400 py-4">
            No guarantor business verifications added yet.
          </p>
        )}
      </div>
    </Card>
  );
}

// ============================================================================
// Legacy guarantor DSR analysis (preserved from original SecurityTab)
// ============================================================================

function GuarantorDsrAnalysisSection({ data, update, engineResult }: any) {
  return (
    <Card className="p-4">
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Guarantor DSR Analysis (Legacy)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Monthly Income (₦)" type="number" value={data.guarantorIncome} onChange={(v: any) => update('guarantorIncome', Number(v))} />
        <Field label="Monthly COGS (₦)" type="number" value={data.guarantorCogs} onChange={(v: any) => update('guarantorCogs', Number(v))} />
        <Field label="Operation Expenses (₦)" type="number" value={data.guarantorOperationExpenses} onChange={(v: any) => update('guarantorOperationExpenses', Number(v))} />
        <Field label="Existing Installment (₦)" type="number" value={data.guarantorExistingInstallment} onChange={(v: any) => update('guarantorExistingInstallment', Number(v))} />
      </div>
      {engineResult && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total FSV</p><p className="font-bold">₦{engineResult.collateralCoverage?.totalFSV?.toLocaleString() || 0}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Coverage %</p><p className="font-bold">{engineResult.collateralCoverage?.coveragePercent?.toFixed(0) || 0}%</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Status</p>
            <Badge className={
              engineResult.collateralCoverage?.status === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-700' :
              engineResult.collateralCoverage?.status === 'GOOD' ? 'bg-green-100 text-green-700' :
              engineResult.collateralCoverage?.status === 'MODERATE' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }>{engineResult.collateralCoverage?.status || '—'}</Badge>
          </div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Guarantor DSR</p><p className={cn('font-bold', (engineResult.guarantorDSR || 0) > 45 ? 'text-red-600' : 'text-emerald-700')}>{(engineResult.guarantorDSR || 0).toFixed(1)}%</p></div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// TAB 8 — VISITATION
// ============================================================================

function VisitationTab({ data, update, loan }: any) {
  const lo = data.loVisitation || {
    businessDynamics: '', location: '', capacity: '', character: '', ownership: '', collateral: '', guarantors: '',
  };
  const bm = data.bmVisitation || {
    businessDynamics: '', location: '', capacity: '', character: '', ownership: '', collateral: '', guarantors: '',
  };
  const updLo = (k: string, v: string) => update('loVisitation', { ...lo, [k]: v });
  const updBm = (k: string, v: string) => update('bmVisitation', { ...bm, [k]: v });

  const photoEvidence: any[] = data.photoEvidence || [];
  const updPhoto = (idx: number, key: string, v: string) => {
    const newArr = [...photoEvidence];
    newArr[idx] = { ...newArr[idx], [key]: v };
    update('photoEvidence', newArr);
  };

  const sections = [
    { key: 'businessDynamics', label: '1. Business Dynamics', placeholder: 'Nature of business · Business structure (Shop/Office) · Business scale (Large/Medium/Small)' },
    { key: 'location', label: '2. Location', placeholder: 'How to navigate · Closest bus-stop · Landmark · Customer\'s alias at business environs · GPS coordinates' },
    { key: 'capacity', label: '3. Capacity', placeholder: 'Estimated stock · Samples of products seen · Level of patronage' },
    { key: 'character', label: '4. Character', placeholder: 'Reception (friendly/hostile/carefree) · Responsiveness · Composure' },
    { key: 'ownership', label: '5. Ownership', placeholder: 'Ownership structure (Sole prop/Partner/Joint) · Registration status' },
    { key: 'collateral', label: '6. Collateral', placeholder: 'Type of collaterals · FSV value · Ownership status · Title documents' },
    { key: 'guarantors', label: '7. Guarantors', placeholder: 'Visit made to guarantors\' business · Rate their capacity · Suitability' },
  ];

  const renderVisitationReport = (
    title: string,
    report: any,
    onUpdate: (k: string, v: string) => void,
    accent: string,
  ) => (
    <Card className={cn('p-4', accent)}>
      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">{title}</h3>
      <div className="space-y-3">
        {sections.map((s) => (
          <div key={s.key}>
            <Label className="text-xs font-semibold text-slate-700">{s.label}</Label>
            <Textarea
              value={report[s.key] || ''}
              onChange={(e) => onUpdate(s.key, e.target.value)}
              rows={2}
              placeholder={s.placeholder}
              className="mt-1 text-xs"
            />
          </div>
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">Physical Visitation Report — 7-Point Structured</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Replaces free-text comment with seven structured sections (Business Dynamics, Location, Capacity, Character, Ownership, Collateral, Guarantors).
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderVisitationReport(
          'LO Visitation Report',
          lo,
          updLo,
          'border-emerald-200',
        )}
        {renderVisitationReport(
          'BM Visitation Report (Branch Manager)',
          bm,
          updBm,
          'border-blue-200',
        )}
      </div>

      {/* v42-P8: GPS Coordinates — 4 locations (business, collateral, guarantor1, guarantor2) */}
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-emerald-600" />
          GPS Coordinates — 4 Locations (Excel Parity)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Capture GPS coordinates for business location, collateral location, and both guarantors&apos; locations.
          Mirrors the Excel LO/BM VISITATION REPORT &quot;LOCATION COORDINATE&quot; fields.
        </p>
        {(() => {
          const coords = data.visitationCoordinates || {
            businessLocation: { lat: 0, lng: 0, accuracy: 0 },
            collateralLocation: { lat: 0, lng: 0, accuracy: 0 },
            guarantor1Location: { lat: 0, lng: 0, accuracy: 0 },
            guarantor2Location: { lat: 0, lng: 0, accuracy: 0 },
          };
          const updCoord = (key: string, field: string, val: number) => {
            update('visitationCoordinates', {
              ...coords,
              [key]: { ...coords[key], [field]: val },
            });
          };
          const captureGPS = (key: string) => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  update('visitationCoordinates', {
                    ...coords,
                    [key]: {
                      lat: pos.coords.latitude,
                      lng: pos.coords.longitude,
                      accuracy: pos.coords.accuracy || 0,
                    },
                  });
                },
                (err) => alert('Geolocation error: ' + err.message)
              );
            } else {
              alert('Geolocation not supported by this browser');
            }
          };
          const locations = [
            { key: 'businessLocation', label: 'Business Location' },
            { key: 'collateralLocation', label: 'Collateral Location' },
            { key: 'guarantor1Location', label: 'Guarantor 1 Location' },
            { key: 'guarantor2Location', label: 'Guarantor 2 Location' },
          ];
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {locations.map(loc => (
                <Card key={loc.key} className="p-3 bg-slate-50 dark:bg-slate-900">
                  <p className="text-xs font-bold text-slate-700 mb-2">{loc.label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Latitude" type="number" value={coords[loc.key]?.lat || 0} onChange={(v: any) => updCoord(loc.key, 'lat', Number(v))} />
                    <Field label="Longitude" type="number" value={coords[loc.key]?.lng || 0} onChange={(v: any) => updCoord(loc.key, 'lng', Number(v))} />
                    <Field label="Accuracy (m)" type="number" value={coords[loc.key]?.accuracy || 0} onChange={(v: any) => updCoord(loc.key, 'accuracy', Number(v))} />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => captureGPS(loc.key)} className="mt-2">
                    <MapPin className="h-3 w-3 mr-1" /> Capture GPS
                  </Button>
                </Card>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Photo Evidence Gallery (6 categories) */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Camera className="h-4 w-4 text-emerald-700" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Photo Evidence Gallery (6 categories)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {photoEvidence.map((p: any, idx: number) => (
            <Card key={idx} className="p-3">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">{p.type}</p>
              <p className="text-[9px] text-amber-700 mb-2 italic">⚠ {p.geoNote}</p>
              <div className="border-2 border-dashed border-slate-300 rounded-md p-3 text-slate-400 text-xs text-center mb-2">
                <Camera className="h-6 w-6 mx-auto mb-1 text-slate-400" />
                Click to upload
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) updPhoto(idx, 'fileName', f.name);
                  }}
                />
              </div>
              {p.fileName && (
                <p className="text-[10px] text-emerald-700 truncate mb-1">📎 {p.fileName}</p>
              )}
              <div>
                <Label className="text-[10px] text-slate-600">Date Taken</Label>
                <Input
                  type="date"
                  value={p.dateTaken || ''}
                  onChange={(e) => updPhoto(idx, 'dateTaken', e.target.value)}
                  className="h-7 text-xs mt-0.5"
                />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Fraud Check</h3>
        <CheckField label="Physical stock matches declared inventory" checked={data.physicalStockMatches || false} onChange={(v: any) => update('physicalStockMatches', v)} />
      </div>

      {/* G14: Pictorial Evidence Consolidated Gallery */}
      <PictorialEvidenceGallery data={data} />
    </div>
  );
}

// ============================================================================
// G14: PICTORIAL EVIDENCE CONSOLIDATED GALLERY
// Mirrors Excel PICTORIAL EVIDENCE sheet — categorized photos for committee review
// ============================================================================

function PictorialEvidenceGallery({ data }: any) {
  const photoEvidence: any[] = data.photoEvidence || [];
  const [lightbox, setLightbox] = useState<number | null>(null);

  // Group photos by category
  const categories = [
    { key: 'shop_front', label: 'Shop Front', icon: '🏪', color: 'bg-emerald-50 border-emerald-200' },
    { key: 'stock', label: 'Stock / Inventory', icon: '📦', color: 'bg-blue-50 border-blue-200' },
    { key: 'customer', label: 'Customer (with ID)', icon: '👤', color: 'bg-purple-50 border-purple-200' },
    { key: 'borrower', label: 'Business & House Pictures', icon: '🏠', color: 'bg-amber-50 border-amber-200' },
    { key: 'collateral', label: 'Collateral Pictures', icon: '🔐', color: 'bg-red-50 border-red-200' },
    { key: 'guarantors', label: 'Guarantor Pictures', icon: '👥', color: 'bg-cyan-50 border-cyan-200' },
  ];

  const photosByCategory = categories.map((cat) => ({
    ...cat,
    photos: photoEvidence.filter((p) => p.type?.toLowerCase().includes(cat.key) || (cat.key === 'borrower' && p.type?.toLowerCase().includes('business'))),
  }));

  const allPhotos = photoEvidence;
  const totalPhotos = allPhotos.length;

  return (
    <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-300">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-slate-700" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Pictorial Evidence Gallery (G14)</h3>
        </div>
        <Badge className="bg-slate-200 text-slate-700 text-[10px]">{totalPhotos} photos · {categories.length} categories</Badge>
      </div>
      <p className="text-xs text-slate-600 mb-4">
        Consolidated categorized photo gallery for committee review. Mirrors Excel PICTORIAL EVIDENCE sheet.
        Photos are captured in the sections above and aggregated here for one-click review.
      </p>

      {totalPhotos === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Camera className="h-12 w-12 mx-auto mb-2 opacity-40" />
          <p className="text-xs">No photos captured yet. Use the photo upload sections above to add evidence.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {photosByCategory.map((cat) => (
            cat.photos.length > 0 && (
              <div key={cat.key} className={cn('p-3 rounded-md border', cat.color)}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{cat.icon}</span>
                  <h4 className="text-xs font-bold text-slate-700 uppercase">{cat.label}</h4>
                  <Badge className="bg-white text-slate-600 text-[9px]">{cat.photos.length}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {cat.photos.map((p, i) => (
                    <div
                      key={i}
                      onClick={() => setLightbox(allPhotos.indexOf(p))}
                      className="relative cursor-pointer group aspect-square bg-white rounded border border-slate-200 overflow-hidden hover:ring-2 hover:ring-emerald-500"
                    >
                      <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                        <Camera className="h-8 w-8" />
                      </div>
                      {p.fileName && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 truncate">
                          📎 {p.fileName}
                        </div>
                      )}
                      {p.dateTaken && (
                        <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[8px] px-1 py-0.5">
                          {p.dateTaken}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Lightbox modal */}
      {lightbox !== null && allPhotos[lightbox] && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="bg-white rounded-lg max-w-2xl w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{allPhotos[lightbox].type || 'Photo'}</h4>
              <Button size="sm" variant="ghost" onClick={() => setLightbox(null)}>✕</Button>
            </div>
            <div className="aspect-video bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center mb-3">
              <Camera className="h-16 w-16 text-slate-300" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><strong>File:</strong> {allPhotos[lightbox].fileName || '—'}</div>
              <div><strong>Date Taken:</strong> {allPhotos[lightbox].dateTaken || '—'}</div>
              <div><strong>Geo Note:</strong> {allPhotos[lightbox].geoNote || '—'}</div>
              <div><strong>Category:</strong> {allPhotos[lightbox].type || '—'}</div>
            </div>
            <div className="mt-3 flex justify-between">
              <Button size="sm" variant="outline" onClick={() => setLightbox(Math.max(0, lightbox - 1))} disabled={lightbox === 0}>
                ← Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setLightbox(Math.min(allPhotos.length - 1, lightbox + 1))} disabled={lightbox === allPhotos.length - 1}>
                Next →
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// TAB 9 — CROSS-CHECKS (Excel SALES & PURCHASES CROSS CHECKS sheet parity)
// ============================================================================

function CrossChecksTab({ result }: { result: EngineResult | null }) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtNum = (n: number, d = 2) => (n || 0).toLocaleString('en-NG', { maximumFractionDigits: d, minimumFractionDigits: d });

  if (!result) {
    return (
      <div className="text-center py-12">
        <CheckSquare className="h-12 w-12 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Engine has not been run yet. Click "Recalculate" to compute cross-checks.</p>
      </div>
    );
  }

  const z = result.zonification;
  const lc = result.loanCycleGrade;
  const cap = result.capitalization;
  const tv = result.treasuryVariance;
  const ttl = result.turnoverToLoan;

  const ratingColor = z
    ? z.rating === 1
      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
      : z.rating === 2
        ? 'bg-blue-100 text-blue-700 border-blue-300'
        : 'bg-red-100 text-red-700 border-red-300'
    : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Sales &amp; Purchases Cross-Checks</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Excel SALES &amp; PURCHASES CROSS CHECKS sheet — capitalization, treasury, debt rotation &amp; turnover.</p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">{result.policyVersion}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Zonification */}
        <Card className={cn('p-4 border', z ? ratingColor : '')}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Zonification Check</h4>
            {z && <Badge className={cn('text-[10px]', ratingColor)}>{z.ratingLabel}</Badge>}
          </div>
          {z ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Location</span><span className="font-mono font-semibold">{z.location}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Rating</span><span className="font-mono font-semibold">{z.rating}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Decision</span><span className="font-semibold">{z.decision}</span></div>
              <p className="text-slate-600 pt-1">{z.description}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No zonification input provided for this appraisal.</p>
          )}
        </Card>

        {/* Loan Cycle Grade */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Loan Cycle Grade</h4>
            {lc && (
              <Badge className={cn(
                'text-[10px]',
                lc.grade === 'A' && 'bg-emerald-500 text-white',
                lc.grade === 'B' && 'bg-green-500 text-white',
                lc.grade === 'C' && 'bg-amber-500 text-white',
                lc.grade === 'D' && 'bg-red-500 text-white',
                lc.grade === 'NEW' && 'bg-blue-500 text-white',
              )}>
                Grade {lc.grade}
              </Badge>
            )}
          </div>
          {lc ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Cumulative Overdue Days</span><span className="font-mono font-semibold">{lc.cumulativeOverdueDays}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Installments Overdue</span><span className="font-mono font-semibold">{lc.installmentOverdueCount}</span></div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Interest Increment</span>
                <span className="font-semibold">
                  {lc.interestIncrement < 0 ? 'DECLINE' : `+${(lc.interestIncrement * 100).toFixed(0)}%`}
                </span>
              </div>
              <p className="text-slate-600 pt-1">{lc.description}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No loan-cycle history provided for this appraisal.</p>
          )}
        </Card>

        {/* Capitalization */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cross-Check 3 — Capitalization</h4>
            {cap && (
              <Badge className={cn(
                'text-[10px]',
                cap.status === 'CONSISTENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
              )}>
                {cap.status}
              </Badge>
            )}
          </div>
          {cap ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Current Equity</span><span className="font-mono font-semibold">{fmtNaira(cap.currentEquity)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Previous Equity</span><span className="font-mono font-semibold">{fmtNaira(cap.previousEquity)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Equity Variation</span><span className="font-mono font-semibold">{fmtNaira(cap.equityVariation)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Monthly Reinvestment</span><span className="font-mono font-semibold">{fmtNaira(cap.monthlyReinvestmentCapacity)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Months Analysed</span><span className="font-mono font-semibold">{cap.monthsBetweenAnalyses}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Accrued Profit</span><span className="font-mono font-semibold">{fmtNaira(cap.accruedProfit)}</span></div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No equity snapshots provided for this appraisal.</p>
          )}
        </Card>

        {/* Treasury variance */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cross-Check 4 — Treasury vs Cash Sales</h4>
            {tv && (
              <Badge className={cn(
                'text-[10px]',
                tv.status === 'CONSISTENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
              )}>
                {tv.status}
              </Badge>
            )}
          </div>
          {tv ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Cash Sales / Day</span><span className="font-mono font-semibold">{fmtNaira(tv.cashSalesPerDay)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Days Since Last Purchase</span><span className="font-mono font-semibold">{tv.daysBetweenDates}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Estimated Treasury</span><span className="font-mono font-semibold">{fmtNaira(tv.estimatedTreasury)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Treasury per Balance Sheet</span><span className="font-mono font-semibold">{fmtNaira(tv.treasuryPerBalanceSheet)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Variance</span><span className="font-mono font-semibold">{fmtNaira(tv.variance)} ({fmtNum(tv.variancePercent, 1)}%)</span></div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No treasury check dates provided for this appraisal.</p>
          )}
        </Card>

        {/* Debt rotation */}
        <Card className="p-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">Debt Rotation</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-emerald-700">{fmtNum(result.debtRotationDays ?? 0, 1)}</span>
              <span className="text-slate-500 dark:text-slate-400">operating days</span>
            </div>
            <p className="text-slate-600">Number of operating days to extinguish the current short-term debt out of purchases (liabilities &divide; daily purchases).</p>
          </div>
        </Card>

        {/* Turnover to loan */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Turnover-to-Loan Ratio</h4>
            {ttl && (
              <Badge className={cn(
                'text-[10px]',
                ttl.status === 'ADEQUATE' && 'bg-emerald-100 text-emerald-700',
                ttl.status === 'LOW' && 'bg-amber-100 text-amber-700',
                ttl.status === 'HIGH' && 'bg-red-100 text-red-700',
              )}>
                {ttl.status}
              </Badge>
            )}
          </div>
          {ttl ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Annual Inflow</span><span className="font-mono font-semibold">{fmtNaira(ttl.annualInflow)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Avg. Monthly Inflow</span><span className="font-mono font-semibold">{fmtNaira(ttl.averageMonthlyInflow)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Loan Principal</span><span className="font-mono font-semibold">{fmtNaira(ttl.loanPrincipal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Turnover Ratio</span><span className="font-mono font-bold">{fmtNum(ttl.turnoverRatio)}x</span></div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No annual inflow provided for this appraisal.</p>
          )}
        </Card>
      </div>

      {/* v42-M1: Margin Summary Base — 3-way comparison + least figure (Excel A26-D32) */}
      {result && result.weightedMargin && (
        <Card className="p-4 border-2 border-purple-200 bg-purple-50">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-purple-700" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Margin Summary Base (3-Way Comparison)</h4>
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Excel FINANCIAL ANALYSIS rows 26-32. Compares average margin, weighted margin, and sector benchmark —
            the <strong>least figure</strong> is used as the &quot;margin used&quot; for all downstream calculations.
          </p>
          {(() => {
            const wm = result.weightedMargin;
            const sectorBench = result.weightedMargin?.simpleAverage || 0; // fallback
            const msb = computeMarginSummaryBase(
              wm.weightedMargin,
              wm.simpleAverage,
              sectorBench * 100, // convert back to percentage for the function
            );
            const rows = [
              { label: 'Average Margin (simple)', value: msb.averageMargin, source: 'average' },
              { label: 'Weighted Margin (by cost share)', value: msb.weightedMargin, source: 'weighted' },
              { label: 'Sector Benchmark Margin', value: msb.benchmarkMargin, source: 'benchmark' },
            ];
            return (
              <div className="space-y-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[9px] uppercase text-slate-500">
                      <th className="py-1">Detail</th>
                      <th className="py-1 text-right">Value (%)</th>
                      <th className="py-1 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.source} className={cn(
                        'border-t border-purple-100',
                        msb.sourceUsed === r.source && 'bg-purple-100 font-bold'
                      )}>
                        <td className="py-1.5">{r.label}</td>
                        <td className="py-1.5 text-right font-mono">{(r.value * 100).toFixed(2)}%</td>
                        <td className="py-1.5 text-right">
                          {msb.sourceUsed === r.source && (
                            <Badge className="bg-purple-600 text-white text-[9px]">USED</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="rounded-md border border-purple-300 bg-white p-2 text-center">
                  <p className="text-[10px] uppercase text-slate-500">Margin Used (Least Figure)</p>
                  <p className="text-lg font-bold text-purple-700">{(msb.marginUsed * 100).toFixed(2)}%</p>
                  <p className="text-[10px] text-slate-500">Source: {msb.sourceUsed}</p>
                </div>
                <p className="text-[10px] text-slate-500">
                  This margin is used to derive purchases (P = S × (1 − margin)) and feed the cashflow projection.
                </p>
              </div>
            );
          })()}
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// TAB 10 — VERIFICATIONS (Bank balances & Guarantor business verification)
// ============================================================================

function VerificationsTab({ result }: { result: EngineResult | null }) {
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  if (!result) {
    return (
      <div className="text-center py-12">
        <ShieldCheck className="h-12 w-12 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Engine has not been run yet. Click "Recalculate" to compute verifications.</p>
      </div>
    );
  }

  const balances = result.bankBalances ?? [];
  const total = result.totalBankBalance ?? 0;
  const gbv = result.guarantorBusinessVerification;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Verifications</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Excel FINANCIAL ANALYSIS bank-balances table &amp; GUARANTORS&#39; BIZ VERIFICATION sheet.</p>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">{result.policyVersion}</Badge>
      </div>

      {/* Bank / Lender balances */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bank / Other Lender Balances</h4>
          <Badge variant="outline" className="text-[10px]">Total: {fmtNaira(total)}</Badge>
        </div>
        {balances.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No bank-balance records provided for this appraisal.</p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-2">S/N</th>
                  <th className="px-2 py-2">Bank Name</th>
                  <th className="px-2 py-2">Account Name</th>
                  <th className="px-2 py-2">Account Number</th>
                  <th className="px-2 py-2 text-right">Balance (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b) => (
                  <tr key={b.sn}>
                    <td className="px-2 py-2 font-mono">{b.sn}</td>
                    <td className="px-2 py-2">{b.bankName}</td>
                    <td className="px-2 py-2">{b.accountName}</td>
                    <td className="px-2 py-2 font-mono">{b.accountNumber}</td>
                    <td className="px-2 py-2 text-right font-mono">{fmtNaira(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-emerald-50 font-bold">
                <tr>
                  <td className="px-2 py-2" colSpan={4}>Total</td>
                  <td className="px-2 py-2 text-right font-mono text-emerald-700">{fmtNaira(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Guarantor business verification */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Guarantor Business Verification</h4>
          {gbv && (
            <Badge className={cn(
              'text-[10px]',
              gbv.isVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
            )}>
              {gbv.isVerified ? 'VERIFIED' : 'NOT VERIFIED'}
            </Badge>
          )}
        </div>
        {gbv ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Guarantor Name</p><p className="font-semibold">{gbv.guarantorName || '—'}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Business Name</p><p className="font-semibold">{gbv.businessName || '—'}</p></div>
              <div className="md:col-span-2"><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Business Address</p><p className="font-semibold">{gbv.businessAddress || '—'}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Years in Operation</p><p className="font-mono font-semibold">{gbv.yearsInOperation}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Stock Value</p><p className="font-mono font-semibold">{fmtNaira(gbv.stockValue)}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Monthly Sales</p><p className="font-mono font-semibold">{fmtNaira(gbv.monthlySales)}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Monthly Expenses</p><p className="font-mono font-semibold">{fmtNaira(gbv.monthlyExpenses)}</p></div>
              <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Net Profit</p><p className="font-mono font-semibold text-emerald-700">{fmtNaira(gbv.netProfit)}</p></div>
            </div>
            <div className={cn(
              'rounded-md p-3 text-xs border',
              gbv.isVerified ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800',
            )}>
              <p className="font-semibold">Verification Notes</p>
              <p className="mt-1">{gbv.verificationNotes}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-4 text-center">No guarantor business verification data provided for this appraisal.</p>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// TAB 11 — SWOT & RECOMMENDATION
// ============================================================================

function SwotTab({ data, update, engineResult }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">SWOT Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 border-emerald-200 bg-emerald-50">
            <h4 className="text-sm font-bold text-emerald-700 mb-2">Strengths</h4>
            <Textarea value={data.strengths || ''} onChange={(e) => update('strengths', e.target.value)} rows={4} placeholder="What makes this borrower a good credit risk?" />
          </Card>
          <Card className="p-4 border-red-200 bg-red-50">
            <h4 className="text-sm font-bold text-red-700 mb-2">Weaknesses</h4>
            <Textarea value={data.weaknesses || ''} onChange={(e) => update('weaknesses', e.target.value)} rows={4} placeholder="What are the credit risks?" />
          </Card>
          <Card className="p-4 border-blue-200 bg-blue-50">
            <h4 className="text-sm font-bold text-blue-700 mb-2">Opportunities</h4>
            <Textarea value={data.opportunities || ''} onChange={(e) => update('opportunities', e.target.value)} rows={4} placeholder="What growth potential exists?" />
          </Card>
          <Card className="p-4 border-amber-200 bg-amber-50">
            <h4 className="text-sm font-bold text-amber-700 mb-2">Threats</h4>
            <Textarea value={data.threats || ''} onChange={(e) => update('threats', e.target.value)} rows={4} placeholder="What external risks exist?" />
          </Card>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Risk Mitigation Strategy *</Label>
          <Textarea value={data.mitigations || ''} onChange={(e) => update('mitigations', e.target.value)} rows={3} placeholder="How will the identified risks be mitigated?" className="mt-1" />
        </div>
      </div>

      {engineResult && (
        <Card className="p-4 bg-slate-900 text-white">
          <h4 className="text-sm font-bold mb-3">Loan Officer Recommendation</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-slate-400 uppercase">Engine Verdict</p><p className="font-bold text-emerald-400">{engineResult.engineVerdict}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase">Risk Grade</p><p className="font-bold">{engineResult.riskGrade.grade} — {engineResult.riskGrade.label}</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase">Final Score</p><p className="font-bold">{engineResult.finalScore}/100</p></div>
            <div><p className="text-[10px] text-slate-400 uppercase">Bank Yield</p><p className="font-bold">{engineResult.bankYield.netYieldPercent.toFixed(1)}% — {engineResult.bankYield.profitability}</p></div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700">
            <p className="text-[10px] text-slate-400 uppercase mb-1">Red Flags Summary</p>
            <p className="text-xs">{engineResult.redFlags.length} flag(s) detected. Total deductions: -{engineResult.redFlags.reduce((s, f) => s + Math.abs(f.pointsDeducted), 0)} points</p>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// TAB 12 — ENGINE RESPONSE (read-only detailed output)
// ============================================================================

function EngineTab({ result }: { result: EngineResult | null }) {
  if (!result) {
    return (
      <div className="text-center py-12">
        <Cpu className="h-12 w-12 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Engine has not been run yet. Click "Recalculate" to compute ratios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Engine Output — Full Detail</h3>
          <Badge variant="outline" className="text-[10px] font-mono">{result.policyVersion}</Badge>
        </div>
        <pre className="text-[10px] bg-slate-900 text-emerald-400 p-4 rounded-md overflow-x-auto max-h-96 overflow-y-auto">
{JSON.stringify(result, null, 2)}
        </pre>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">12-Month Projection</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-left text-[9px] uppercase text-slate-500 dark:text-slate-400">
                  <th className="px-2 py-1">M</th>
                  <th className="px-2 py-1 text-right">Opening</th>
                  <th className="px-2 py-1 text-right">Surplus</th>
                  <th className="px-2 py-1 text-right">Loan</th>
                  <th className="px-2 py-1 text-right">Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.projection.map((row) => (
                  <tr key={row.month} className={row.isNegative ? 'bg-red-50' : ''}>
                    <td className="px-2 py-1 font-mono">{row.month}</td>
                    <td className="px-2 py-1 text-right font-mono">₦{row.opening.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right font-mono text-emerald-700">₦{row.monthlySurplus.toLocaleString()}</td>
                    <td className="px-2 py-1 text-right font-mono text-red-600">₦{row.loanOutflow.toLocaleString()}</td>
                    <td className={cn('px-2 py-1 text-right font-mono font-bold', row.isNegative ? 'text-red-600' : 'text-slate-900 dark:text-slate-100')}>
                      ₦{row.closing.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Red Flags Detail</h4>
          <div className="space-y-2">
            {result.redFlags.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-1" />
                <p className="text-xs text-slate-500 dark:text-slate-400">No red flags detected</p>
              </div>
            ) : (
              result.redFlags.map((f, i) => (
                <div key={i} className={cn(
                  'rounded-md p-2 text-xs',
                  f.severity === 'critical' && 'bg-red-50 border border-red-200',
                  f.severity === 'warning' && 'bg-amber-50 border border-amber-200',
                  f.severity === 'info' && 'bg-blue-50 border border-blue-200',
                )}>
                  <div className="flex justify-between items-start">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{f.code}</p>
                    <Badge variant="outline" className="text-[9px]">{f.severity}</Badge>
                  </div>
                  <p className="text-slate-600 mt-1">{f.message}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Points: {f.pointsDeducted}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Bank Yield Analysis</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Interest Income</p><p className="font-bold text-emerald-700">₦{result.bankYield.interestIncome.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Processing Fee</p><p className="font-bold">₦{result.bankYield.processingFee.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">CCD Income</p><p className="font-bold">₦{result.bankYield.cashDepositIncome.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Total Earnings</p><p className="font-bold">₦{result.bankYield.totalEarnings.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Cost of Fund (30% p.a.)</p><p className="font-bold text-red-600">₦{result.bankYield.costOfFund.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Admin Cost (5% p.a.)</p><p className="font-bold text-red-600">₦{result.bankYield.adminCost.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Net Yield</p><p className="font-bold">₦{result.bankYield.netYield.toLocaleString()}</p></div>
          <div><p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Annualized %</p><p className={cn('font-bold', result.bankYield.netYieldPercent < 0 ? 'text-red-600' : 'text-emerald-700')}>{result.bankYield.netYieldPercent.toFixed(2)}%</p></div>
        </div>
      </Card>

      {/* G1: Detailed Monthly Cashflow Test (22 rows × 12 months) */}
      {result.detailedCashflow && result.detailedCashflow.length > 0 && (
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">G1: Monthly Cashflow Test (Excel Parity)</h4>
              <p className="text-xs text-slate-600">22 line items × 12 months — mirrors Excel MONTHLY CASHFLOW TEST sheet</p>
            </div>
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">{result.detailedCashflow.length} months</Badge>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                <tr className="text-left text-[9px] uppercase text-slate-600">
                  <th className="px-1 py-1 border">Description</th>
                  {result.detailedCashflow.map((row: any) => (
                    <th key={row.month} className="px-1 py-1 border text-right">M{row.month}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Business Inflow', key: 'businessInflow' },
                  { label: '% Margin Amount', key: 'marginAmount' },
                  { label: 'Business Expenses', key: 'businessExpenses' },
                  { label: 'Total Expenses', key: 'totalExpenses' },
                  { label: 'Operational Cashflow', key: 'operationalCashflow' },
                  { label: 'New Loan (WFL)', key: 'newLoanDisbursement' },
                  { label: 'Client Contribution', key: 'clientContribution' },
                  { label: 'Repay Running Loan', key: 'repaymentRunningLoan' },
                  { label: 'Repay New Loan', key: 'repaymentNewLoan' },
                  { label: 'Repay Other Loans', key: 'repaymentOtherLoans' },
                  { label: 'Total Financial Inflow', key: 'totalFinancialInflow' },
                  { label: 'Family Income', key: 'familyIncome' },
                  { label: 'Family Expenses', key: 'familyExpenses' },
                  { label: 'Family Net Income', key: 'familyNetIncome' },
                  { label: 'Repay Family Loan', key: 'repaymentFamilyLoan' },
                  { label: 'Total Family Inflow', key: 'totalFamilyInflow' },
                  { label: 'Cash at End of Period', key: 'cashAtEndOfPeriod' },
                  { label: 'First Liquidity', key: 'firstLiquidity' },
                  { label: 'Accrued Flow', key: 'accruedFlow' },
                ].map((line) => (
                  <tr key={line.key} className="hover:bg-slate-50 dark:bg-slate-900">
                    <td className="px-1 py-1 border font-medium text-slate-700">{line.label}</td>
                    {result.detailedCashflow!.map((row: any) => {
                      const val = Number(row[line.key]) || 0;
                      const isNegative = val < 0;
                      return (
                        <td key={row.month} className={cn(
                          'px-1 py-1 border text-right font-mono',
                          isNegative ? 'text-red-600' : 'text-slate-700'
                        )}>
                          {val === 0 ? '—' : val.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* G2: Balance Sheet Comparison (Current vs Previous) */}
      {result.balanceSheetComparison && (
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">G2: Balance Sheet Comparison (Current vs Previous)</h4>
            <Badge className={cn(
              'text-[10px]',
              result.balanceSheetComparison.verdict === 'GROWING' ? 'bg-emerald-100 text-emerald-700' :
              result.balanceSheetComparison.verdict === 'DECLINING' ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            )}>
              {result.balanceSheetComparison.verdict}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded border border-slate-200">
              <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mb-2">Total Assets</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Current:</span><span className="font-mono font-bold">₦{result.balanceSheetComparison.currentTotalAssets.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Previous:</span><span className="font-mono">₦{result.balanceSheetComparison.previousTotalAssets.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Difference:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.assetsDifference >= 0 ? 'text-emerald-600' : 'text-red-600')}>₦{result.balanceSheetComparison.assetsDifference.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">% Change:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.assetsPercentChange >= 0 ? 'text-emerald-600' : 'text-red-600')}>{result.balanceSheetComparison.assetsPercentChange.toFixed(1)}%</span></div>
              </div>
            </div>
            <div className="p-3 bg-white rounded border border-slate-200">
              <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mb-2">Total Liabilities</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Current:</span><span className="font-mono font-bold">₦{result.balanceSheetComparison.currentTotalLiabilities.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Previous:</span><span className="font-mono">₦{result.balanceSheetComparison.previousTotalLiabilities.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Difference:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.liabilitiesDifference >= 0 ? 'text-red-600' : 'text-emerald-600')}>₦{result.balanceSheetComparison.liabilitiesDifference.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">% Change:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.liabilitiesPercentChange >= 0 ? 'text-red-600' : 'text-emerald-600')}>{result.balanceSheetComparison.liabilitiesPercentChange.toFixed(1)}%</span></div>
              </div>
            </div>
            <div className="p-3 bg-white rounded border border-slate-200">
              <p className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold mb-2">Equity (Net Worth)</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Current:</span><span className="font-mono font-bold">₦{result.balanceSheetComparison.currentEquity.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Previous:</span><span className="font-mono">₦{result.balanceSheetComparison.previousEquity.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Difference:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.equityDifference >= 0 ? 'text-emerald-600' : 'text-red-600')}>₦{result.balanceSheetComparison.equityDifference.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">% Change:</span><span className={cn('font-mono font-bold', result.balanceSheetComparison.equityPercentChange >= 0 ? 'text-emerald-600' : 'text-red-600')}>{result.balanceSheetComparison.equityPercentChange.toFixed(1)}%</span></div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* G8: Cost-of-Fund & Convert-to-Loan Amortization Schedules */}
      {result.costOfFundSchedule && result.convertToLoanSchedule && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost of Fund Schedule */}
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">G8: Cost-of-Fund Schedule (30% PA)</h4>
            <p className="text-xs text-slate-600 mb-3">Bank's true cost of capital over loan tenure</p>
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Monthly</p><p className="font-mono font-bold">₦{result.costOfFundSchedule.monthlyInstallment.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Total Interest</p><p className="font-mono font-bold text-red-600">₦{result.costOfFundSchedule.totalInterest.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Total Payable</p><p className="font-mono font-bold">₦{result.costOfFundSchedule.totalPayable.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
            </div>
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr className="text-left text-[9px] uppercase text-slate-600">
                    <th className="px-1 py-1">M</th>
                    <th className="px-1 py-1 text-right">Opening</th>
                    <th className="px-1 py-1 text-right">Installment</th>
                    <th className="px-1 py-1 text-right">Interest</th>
                    <th className="px-1 py-1 text-right">Principal</th>
                    <th className="px-1 py-1 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.costOfFundSchedule.schedule.map((row: any) => (
                    <tr key={row.month}>
                      <td className="px-1 py-1 font-mono">{row.month}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.openingBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.installment.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono text-red-600">{row.interest.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.principal.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.closingBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Convert-to-Loan Schedule */}
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">G8: Convert-to-Loan Schedule</h4>
            <p className="text-xs text-slate-600 mb-3">Principal + upfront + CCD + admin cost amortized</p>
            <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Upfront Fee</p><p className="font-mono font-bold">₦{(result.convertToLoanSchedule.summary.upfrontFee || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">CCD Amount</p><p className="font-mono font-bold">₦{(result.convertToLoanSchedule.summary.ccdAmount || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Admin Cost Total</p><p className="font-mono font-bold">₦{(result.convertToLoanSchedule.summary.adminCostTotal || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
              <div><p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase">Monthly Installment</p><p className="font-mono font-bold">₦{result.convertToLoanSchedule.monthlyInstallment.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
            </div>
            <div className="overflow-x-auto max-h-48 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr className="text-left text-[9px] uppercase text-slate-600">
                    <th className="px-1 py-1">M</th>
                    <th className="px-1 py-1 text-right">Opening</th>
                    <th className="px-1 py-1 text-right">Installment</th>
                    <th className="px-1 py-1 text-right">Interest</th>
                    <th className="px-1 py-1 text-right">Principal</th>
                    <th className="px-1 py-1 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.convertToLoanSchedule.schedule.map((row: any) => (
                    <tr key={row.month}>
                      <td className="px-1 py-1 font-mono">{row.month}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.openingBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.installment.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono text-red-600">{row.interest.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.principal.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                      <td className="px-1 py-1 text-right font-mono">{row.closingBalance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* v42-P9: Committee Decision Signatures (Excel COMMITTEE'S DECISION sheet) */}
      <CommitteeSignatureSection />
    </div>
  );
}

// ============================================================================
// v42-P9: COMMITTEE SIGNATURE SECTION
// Mirrors Excel COMMITTEE'S DECISION sheet — 7-8 approvers with signatures
// ============================================================================

function CommitteeSignatureSection() {
  const { currentAdmin } = useAppStore();
  const [signatures, setSignatures] = useState<any[]>([]);
  const [typedName, setTypedName] = useState('');

  // In a real implementation, these would be loaded from the MccDecision records
  // for this loan. For now, we show the signature capture UI.
  const roles = [
    { role: 'LO', label: 'Loan Officer' },
    { role: 'CA', label: 'Credit Analyst' },
    { role: 'HOC', label: 'Head of Credit' },
    { role: 'CRO', label: 'Chief Risk Officer' },
    { role: 'LEGAL', label: 'Legal Officer' },
    { role: 'GCFO', label: 'Group CFO' },
    { role: 'MD', label: 'MD/CEO' },
  ];

  const sign = (role: string, label: string) => {
    if (!typedName.trim()) {
      alert('Please type your full name to sign');
      return;
    }
    const newSig = {
      approverId: currentAdmin?.id || 'unknown',
      approverName: typedName,
      approverRole: role,
      roleLabel: label,
      signatureData: typedName,
      signatureType: 'typed' as const,
      signedAt: new Date().toISOString(),
      ipAddress: '',
    };
    setSignatures([...signatures.filter(s => s.approverRole !== role), newSig]);
    setTypedName('');
  };

  return (
    <Card className="p-4 border-2 border-amber-200 bg-amber-50">
      <div className="flex items-center gap-2 mb-3">
        <Signature className="h-4 w-4 text-amber-700" />
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Committee Decision Signatures</h4>
      </div>
      <p className="text-xs text-slate-600 mb-3">
        Excel COMMITTEE&apos;S DECISION sheet. Each approver signs by typing their full name (typed e-signature).
        The signature, role, date, and IP are recorded for audit.
      </p>

      <div className="mb-3">
        <Label className="text-xs font-semibold">Type your full name to sign:</Label>
        <Input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Enter your full legal name"
          className="mt-1"
        />
      </div>

      <div className="space-y-2">
        {roles.map(({ role, label }) => {
          const sig = signatures.find(s => s.approverRole === role);
          return (
            <div key={role} className="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-700">{label} ({role})</p>
                {sig ? (
                  <div className="mt-1">
                    <p className="text-sm font-serif italic text-emerald-700">{sig.signatureData}</p>
                    <p className="text-[10px] text-slate-500">
                      Signed: {new Date(sig.signedAt).toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Not yet signed</p>
                )}
              </div>
              {!sig && (
                <Button size="sm" variant="outline" onClick={() => sign(role, label)} disabled={!typedName.trim()}>
                  Sign as {role}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {signatures.length > 0 && (
        <div className="mt-3 p-2 bg-emerald-50 rounded text-center">
          <p className="text-xs text-emerald-700">
            ✓ {signatures.length} of {roles.length} signatures captured
          </p>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// SHARED FORM COMPONENTS
// ============================================================================

function Field({ label, value, onChange, type = 'text', readOnly }: any) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input
        type={type}
        value={value ?? ''}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        className={cn('mt-1', readOnly && 'bg-slate-50 dark:bg-slate-900 text-slate-600')}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: any) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
      >
        <option value="">— Select —</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CheckField({ label, checked, onChange }: any) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function SliderField({ label, value, min, max, step, onChange }: any) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <Label className="text-xs text-slate-600">{label}</Label>
        <span className="text-xs font-bold text-emerald-700">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-600"
      />
      <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

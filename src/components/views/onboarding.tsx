'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  ONBOARDING_CHANNELS,
  ONBOARDING_CHANNEL_LABELS,
  NIGERIAN_STATES,
  LEGAL_STRUCTURES,
  KYC_STATUS_BADGES,
  KYC_STATUS_LABELS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  IdCard,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Building2,
  Wallet,
  AlertCircle,
  Upload,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TITLES = ['Mr', 'Mrs', 'Miss', 'Dr', 'Chief', 'Engr', 'Alhaji', 'Alhaja'];
const GENDERS = ['Male', 'Female'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
const HOUSE_OWNERSHIP = ['Owned', 'Rented', 'Family', 'Employer Provided'];
const RELIGIONS = ['Christianity', 'Islam', 'Other'];

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  self_onboard:
    'Customer registers themselves via the web portal. A temporary password is emailed and a branch/Loan Officer is auto-assigned by the system.',
  desk_onboard:
    'Front Desk officer captures the customer in-branch, then assigns them to a Branch Manager who allocates a Loan Officer.',
  bm_onboard:
    'Branch Manager captures the customer and assigns them directly to a Loan Officer in their branch.',
  field_onboard:
    'Loan Officer captures the customer in the field. The customer is assigned directly to the capturing officer.',
};

const STEP_LABELS = ['Bio Data & Residence', 'Business & Loan', 'Uploads & Assignment'];

// ---------------------------------------------------------------------------
// Form state shape
// ---------------------------------------------------------------------------

interface FormState {
  // personal
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string; // v38: customer sets their own password during self-onboarding
  altPhone: string;
  bvn: string;
  nin: string;
  dob: string;
  gender: string;
  maritalStatus: string;
  state: string;
  lga: string;
  town: string;
  residentialAddress: string;
  nearestLandmark: string;
  houseOwnershipStatus: string;
  yearsAtResidence: string;
  religion: string;

  // business
  businessName: string;
  sectorId: string;
  shopAddress: string;
  businessDateEstablished: string;
  legalStructure: string;
  rcBnNumber: string;
  numberOfEmployees: string;

  // loan
  loanAmount: string;
  loanDuration: string;
  planId: string;
  loanPurpose: string;
  hasExternalLoans: boolean;
  isGuarantorsewhere: boolean;

  // assignment
  branchId: string;
  bmId: string;
  staffId: string;

  // uploads (paths only, demo)
  passportPhoto: string;
  idCardPhoto: string;
  additionalDocs: string;

  // agreement
  agreed: boolean;
}

const emptyForm: FormState = {
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  altPhone: '',
  bvn: '',
  nin: '',
  dob: '',
  gender: '',
  maritalStatus: '',
  state: '',
  lga: '',
  town: '',
  residentialAddress: '',
  nearestLandmark: '',
  houseOwnershipStatus: '',
  yearsAtResidence: '',
  religion: '',
  businessName: '',
  sectorId: '',
  shopAddress: '',
  businessDateEstablished: '',
  legalStructure: '',
  rcBnNumber: '',
  numberOfEmployees: '',
  loanAmount: '',
  loanDuration: '',
  planId: '',
  loanPurpose: '',
  hasExternalLoans: false,
  isGuarantorsewhere: false,
  branchId: '',
  bmId: '',
  staffId: '',
  passportPhoto: '',
  idCardPhoto: '',
  additionalDocs: '',
  agreed: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNaira(input: string): string {
  if (!input) return '';
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-NG');
}

function unformatNaira(input: string): string {
  return input.replace(/[^\d]/g, '');
}

function calcAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return diff / (1000 * 60 * 60 * 24 * 365.25);
}

const dobMax = new Date();
dobMax.setFullYear(dobMax.getFullYear() - 21);
const dobMin = new Date();
dobMin.setFullYear(dobMin.getFullYear() - 70);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OnboardingView() {
  const { currentAdmin, setView } = useAppStore();

  const [channel, setChannel] = useState<string>(defaultChannelForRole(currentAdmin?.role));
  const [step, setStep] = useState<number>(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // duplicate detection
  const [dupMatches, setDupMatches] = useState<any[]>([]);

  // BVN / CAC verification
  const [bvnVerifying, setBvnVerifying] = useState(false);
  const [bvnVerified, setBvnVerified] = useState<{ score: number; data: any } | null>(null);
  const [bvnError, setBvnError] = useState<string>('');
  const [cacVerifying, setCacVerifying] = useState(false);
  const [cacVerified, setCacVerified] = useState<any>(null);
  const [cacError, setCacError] = useState<string>('');

  // supporting data
  const [sectors, setSectors] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [branchManagers, setBranchManagers] = useState<any[]>([]);
  const [loanOfficers, setLoanOfficers] = useState<any[]>([]);

  // submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  // v39: CAC consent dialog state
  const [showConsent, setShowConsent] = useState(false);
  const [cacFee, setCacFee] = useState<number>(5000);
  const [consentAccepted, setConsentAccepted] = useState(false);

  // ----- load supporting data on mount -----
  useEffect(() => {
    (async () => {
      try {
        const [secRes, planRes, brRes] = await Promise.all([
          fetch('/api/sectors'),
          fetch('/api/loan-plans'),
          fetch('/api/branches'),
        ]);
        const secData = await secRes.json();
        const planData = await planRes.json();
        const brData = await brRes.json();
        if (secData.sectors) setSectors(secData.sectors);
        if (planData.plans) setPlans(planData.plans);
        if (brData.branches) setBranches(brData.branches);

        // v39: Fetch CAC search fee for consent dialog
        try {
          const feeRes = await fetch('/api/public/fees');
          const feeData = await feeRes.json();
          const cacFeeEntry = feeData.fees?.find((f: any) => f.key === 'fee_cac_search');
          if (cacFeeEntry) setCacFee(cacFeeEntry.amount);
        } catch {}
      } catch (e) {
        console.error('Failed to load supporting data', e);
      }
    })();
  }, []);

  // ----- load branch managers when branch changes (desk mode) -----
  useEffect(() => {
    if (channel !== 'desk_onboard' || !form.branchId) {
      setBranchManagers([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/staff?role=bm&branchId=${form.branchId}`);
        const data = await res.json();
        setBranchManagers(data.staff || []);
      } catch (e) {
        console.error('Failed to load branch managers', e);
        setBranchManagers([]);
      }
    })();
  }, [channel, form.branchId]);

  // ----- load loan officers (bm mode) -----
  useEffect(() => {
    if (channel !== 'bm_onboard' || !currentAdmin?.branchId) {
      setLoanOfficers([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `/api/staff?role=loan&branchId=${currentAdmin.branchId}`
        );
        const data = await res.json();
        setLoanOfficers(data.staff || []);
      } catch (e) {
        console.error('Failed to load loan officers', e);
        setLoanOfficers([]);
      }
    })();
  }, [channel, currentAdmin]);

  // ----- reset channel when role changes -----
  useEffect(() => {
    setChannel(defaultChannelForRole(currentAdmin?.role));
  }, [currentAdmin?.role]);

  // ----- form helpers -----
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
  };

  // ----- duplicate detection -----
  const runDuplicateCheck = async (q: string) => {
    if (!q || q.length < 4) {
      setDupMatches([]);
      return;
    }
    try {
      const res = await fetch(`/api/onboard/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setDupMatches(data.users || []);
    } catch (e) {
      console.error('Duplicate check failed', e);
    }
  };

  // ----- BVN: Customer just enters it, no self-verification -----
  // The Loan Officer will verify BVN externally during their assessment
  const verifyBvn = async () => {
    setBvnError('');
    if (!/^\d{11}$/.test(form.bvn)) {
      setBvnError('BVN must be exactly 11 digits.');
      return;
    }
    // Just mark as entered — LO will verify externally
    setBvnVerified({ score: 0, data: { note: 'BVN entered by customer. Loan Officer will verify externally.' } });
  };

  // ----- CAC: Customer just enters RC/BN, Legal will verify -----
  const verifyCac = async () => {
    setCacError('');
    if (!form.rcBnNumber) {
      setCacError('Enter RC/BN number first.');
      return;
    }
    // Just mark as entered — Legal will verify externally
    setCacVerified({ entered: true, note: 'RC/BN entered by customer. Legal will verify externally.' });
  };

  // ----- validation -----
  const validateStep = (s: number): string[] => {
    const errs: string[] = [];
    if (s === 0) {
      const req = [
        'firstName', 'lastName', 'phone',
        'bvn', 'nin', 'dob',
        'state', 'town',
        'residentialAddress', 'nearestLandmark',
        'houseOwnershipStatus',
      ];
      if (channel === 'self_onboard') req.push('email', 'password');
      for (const k of req) {
        if (!(form as any)[k] || String((form as any)[k]).trim() === '') errs.push(k);
      }
      // v38: Password validation for self-onboard
      if (channel === 'self_onboard' && form.password && form.password.length < 8) {
        errs.push('password');
      }
      // BVN format
      if (form.bvn && !/^\d{11}$/.test(form.bvn)) errs.push('bvn');
      // NIN format
      if (form.nin && !/^\d{11}$/.test(form.nin)) errs.push('nin');
      // Age rule 21-70
      const age = calcAge(form.dob);
      if (form.dob && (age === null || age < 21 || age > 70)) errs.push('dob');
    }
    if (s === 1) {
      const req = ['businessName', 'sectorId', 'shopAddress', 'legalStructure'];
      for (const k of req) {
        if (!(form as any)[k] || String((form as any)[k]).trim() === '') errs.push(k);
      }
    }
    if (s === 2) {
      if (channel === 'desk_onboard' || channel === 'self_onboard') {
        if (!form.branchId) errs.push('branchId');
      }
      if (channel === 'bm_onboard') {
        if (!form.staffId) errs.push('staffId');
      }
      if (!form.agreed) errs.push('agreed');
    }
    return errs;
  };

  const stepErrors = useMemo(() => validateStep(step), [step, form, channel]);

  const isFieldInvalid = (key: string): boolean => {
    if (!touched[key] && step !== 2) {
      // also surface invalid fields relevant to current step
    }
    if (stepErrors.includes(key)) return true;
    return false;
  };

  const handleNext = () => {
    // mark all step fields touched
    const newTouched: Record<string, boolean> = { ...touched };
    if (step === 0) {
      ['firstName', 'lastName', 'phone', 'bvn', 'nin', 'dob', 'state', 'town',
       'residentialAddress', 'nearestLandmark', 'houseOwnershipStatus',
       ...(channel === 'self_onboard' ? ['email', 'password'] : []),
      ].forEach((k) => (newTouched[k] = true));
    }
    if (step === 1) {
      ['businessName', 'sectorId', 'shopAddress', 'legalStructure'].forEach(
        (k) => (newTouched[k] = true)
      );
    }
    if (step === 2) {
      [...(channel === 'desk_onboard' || channel === 'self_onboard' ? ['branchId'] : []),
       ...(channel === 'bm_onboard' ? ['staffId'] : []),
       'agreed',
      ].forEach((k) => (newTouched[k] = true));
    }
    setTouched(newTouched);
    if (validateStep(step).length > 0) return;
    setStep((s) => Math.min(2, s + 1));
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  // ----- submit -----
  const handleSubmit = async () => {
    // validate all steps
    const allErrors = [0, 1, 2].flatMap(validateStep);
    if (allErrors.length > 0) {
      setSubmitError('Please complete all required fields before submitting.');
      // jump to first step that has errors
      if (validateStep(0).length) setStep(0);
      else if (validateStep(1).length) setStep(1);
      else setStep(2);
      return;
    }

    // v39: Show CAC consent dialog before proceeding
    if (!consentAccepted) {
      setShowConsent(true);
      return;
    }

    await doSubmit();
  };

  const doSubmit = async () => {

    setSubmitting(true);
    setSubmitError('');
    try {
      const adminId = currentAdmin?.id || '';
      const res = await fetch(`/api/onboard?adminId=${adminId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          personal: {
            title: form.title,
            firstName: form.firstName,
            lastName: form.lastName,
            email: form.email || undefined,
            phone: form.phone,
            password: form.password || undefined, // v38: customer-chosen password
            altPhone: form.altPhone || undefined,
            bvn: form.bvn,
            nin: form.nin,
            dob: form.dob,
            gender: form.gender || undefined,
            maritalStatus: form.maritalStatus || undefined,
            state: form.state,
            lga: form.lga || undefined,
            residentialAddress: form.residentialAddress,
            town: form.town,
            nearestLandmark: form.nearestLandmark,
            houseOwnershipStatus: form.houseOwnershipStatus,
            yearsAtResidence: form.yearsAtResidence
              ? Number(form.yearsAtResidence)
              : undefined,
            religion: form.religion || undefined,
          },
          business: {
            businessName: form.businessName,
            sectorId: form.sectorId,
            shopAddress: form.shopAddress,
            businessDateEstablished: form.businessDateEstablished || undefined,
            legalStructure: form.legalStructure,
            rcBnNumber: form.rcBnNumber || undefined,
            numberOfEmployees: form.numberOfEmployees
              ? Number(form.numberOfEmployees)
              : undefined,
          },
          loan: {
            loanAmount: unformatNaira(form.loanAmount)
              ? Number(unformatNaira(form.loanAmount))
              : 0,
            loanDuration: form.loanDuration ? Number(form.loanDuration) : 0,
            planId: form.planId || undefined,
            loanPurpose: form.loanPurpose || undefined,
            hasExternalLoans: form.hasExternalLoans,
            isGuarantorsewhere: form.isGuarantorsewhere,
          },
          assignment: {
            branchId: form.branchId || undefined,
            staffId: form.staffId || (channel === 'field_onboard' ? adminId : undefined),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Submission failed');
      } else {
        setResult(data);
        // scroll to top so the success card is visible
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e: any) {
      setSubmitError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setTouched({});
    setStep(0);
    setDupMatches([]);
    setBvnVerified(null);
    setBvnError('');
    setCacVerified(null);
    setCacError('');
    setResult(null);
    setSubmitError('');
  };

  const copyAccount = async () => {
    if (!result?.user?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(result.user.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  // ----- channel switcher visibility -----
  const canSwitchChannel =
    currentAdmin &&
    ['super', 'frontdesk', 'bm'].includes(currentAdmin.role);

  // ----- success card -----
  if (result) {
    const branchName =
      branches.find((b) => b.id === result.user.branchId)?.name ||
      result.user.branch?.name ||
      'Auto-assigned';
    const assignedTo =
      currentAdmin && result.user.staffId === currentAdmin.id
        ? 'You (Field Officer)'
        : result.user.loanOfficer
          ? `${result.user.loanOfficer.firstName} ${result.user.loanOfficer.lastName}`
          : 'Pending assignment';

    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
        <div className="max-w-3xl mx-auto">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 text-white p-8 text-center">
              <CheckCircle2 className="h-14 w-14 mx-auto mb-3" />
              <h2 className="text-2xl font-bold mb-1">Customer Onboarded Successfully!</h2>
              <p className="text-emerald-100 text-sm">
                {result.user.firstName} {result.user.lastName} has been registered as a customer
                {result.loan && ' with a pending loan application'}.
              </p>
            </div>

            <CardContent className="p-6 space-y-5">
              {/* NUBAN card */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                  NUBAN Account Number
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-2xl font-bold tracking-wider text-slate-900 font-mono">
                    {result.user.accountNumber}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyAccount}
                    className="h-8"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-slate-600 mt-2">
                  Merchant ID: <span className="font-mono">{result.user.merchantId}</span>
                </p>
              </div>

              {/* Credentials card */}
              {channel === 'self_onboard' ? (
                <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Credentials Sent!
                      </p>
                      <p className="text-xs text-slate-600">
                        A temporary password and activation link has been emailed to{' '}
                        <span className="font-medium">{result.user.email}</span>. The customer must
                        verify their BVN via OTP on first login.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                result.temporaryPassword && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                      Temporary Password
                    </p>
                    <p className="text-base font-mono font-semibold text-slate-900">
                      {result.temporaryPassword}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      Share this securely with the customer. They must change it on first login.
                    </p>
                  </div>
                )
              )}

              {/* Summary grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryTile label="Customer" value={`${result.user.firstName} ${result.user.lastName}`} icon={UserIcon} />
                <SummaryTile label="Branch" value={branchName} icon={Building2} />
                <SummaryTile label="Assigned To" value={assignedTo} icon={UserIcon} />
              </div>

              {result.loan && (
                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-emerald-700" />
                    <p className="text-sm font-semibold text-slate-900">
                      Loan Application Created
                    </p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Reference <span className="font-mono">{result.loan.applicationRef}</span> ·
                    Amount ₦{Number(result.loan.amount).toLocaleString('en-NG')} ·
                    Tenor {result.loan.duration} months · Step: LO_ENTRY
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => setView('customer-detail', { userId: result.user.id })}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Eye className="h-4 w-4 mr-1.5" /> View Customer
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Register Another
                </Button>
                <Button variant="ghost" onClick={() => setView('dashboard')}>
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — main wizard
  // ---------------------------------------------------------------------------

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Customer Onboarding</h1>
            <p className="text-sm text-slate-500">
              Register a new customer with verified KYC and loan origination
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </div>

        {/* Channel switcher */}
        {canSwitchChannel && (
          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Onboarding Channel</h3>
                <p className="text-xs text-slate-500">
                  Choose how this customer is being registered.
                </p>
              </div>
              {currentAdmin && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  You: {currentAdmin.firstName} {currentAdmin.lastName} ({currentAdmin.role})
                  {currentAdmin.branch?.name ? ` · ${currentAdmin.branch.name}` : ''}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {Object.values(ONBOARDING_CHANNELS).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all',
                    channel === ch
                      ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                      : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900">
                      {ONBOARDING_CHANNEL_LABELS[ch]}
                    </span>
                    {channel === ch && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    {ch === 'self_onboard' && 'Self-service portal'}
                    {ch === 'desk_onboard' && 'Front desk in-branch'}
                    {ch === 'bm_onboard' && 'Branch Manager'}
                    {ch === 'field_onboard' && 'Field officer'}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-3 bg-slate-50 rounded-md p-2 border border-slate-100">
              {CHANNEL_DESCRIPTIONS[channel]}
            </p>
          </Card>
        )}

        {/* Step indicator */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            {STEP_LABELS.map((label, i) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all',
                      i < step && 'bg-emerald-600 text-white',
                      i === step && 'bg-emerald-600 text-white ring-4 ring-emerald-100',
                      i > step && 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {i < step ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="hidden sm:block min-w-0">
                    <p
                      className={cn(
                        'text-xs font-medium truncate',
                        i <= step ? 'text-slate-900' : 'text-slate-500'
                      )}
                    >
                      {label}
                    </p>
                  </div>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 mx-2 transition-all',
                      i < step ? 'bg-emerald-500' : 'bg-slate-200'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <Progress value={((step + 1) / 3) * 100} className="mt-3 h-1" />
        </Card>

        {/* Step content */}
        {step === 0 && (
          <StepPersonal
            form={form}
            setField={setField}
            channel={channel}
            isFieldInvalid={isFieldInvalid}
            runDuplicateCheck={runDuplicateCheck}
            dupMatches={dupMatches}
            onViewCustomer={(uid) => setView('customer-detail', { userId: uid })}
            bvnVerifying={bvnVerifying}
            bvnVerified={bvnVerified}
            bvnError={bvnError}
            verifyBvn={verifyBvn}
          />
        )}

        {step === 1 && (
          <StepBusiness
            form={form}
            setField={setField}
            sectors={sectors}
            plans={plans}
            isFieldInvalid={isFieldInvalid}
            cacVerifying={cacVerifying}
            cacVerified={cacVerified}
            cacError={cacError}
            verifyCac={verifyCac}
          />
        )}

        {step === 2 && (
          <StepAssignment
            form={form}
            setField={setField}
            channel={channel}
            currentAdmin={currentAdmin}
            branches={branches}
            branchManagers={branchManagers}
            loanOfficers={loanOfficers}
            isFieldInvalid={isFieldInvalid}
          />
        )}

        {/* Submit error */}
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 2 ? (
            <Button
              onClick={handleNext}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Submit Application
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: default channel for role
// ---------------------------------------------------------------------------

function defaultChannelForRole(role?: string): string {
  if (!role) return 'self_onboard';
  if (role === 'frontdesk') return 'desk_onboard';
  if (role === 'bm') return 'bm_onboard';
  if (role === 'loan') return 'field_onboard';
  return 'self_onboard';
}

// ---------------------------------------------------------------------------
// Summary tile
// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 bg-white">
      <div className="flex items-center gap-1.5 mb-1 text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900 truncate">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Personal
// ---------------------------------------------------------------------------

interface StepProps {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isFieldInvalid: (key: string) => boolean;
}

function StepPersonal({
  form,
  setField,
  channel,
  isFieldInvalid,
  runDuplicateCheck,
  dupMatches,
  onViewCustomer,
  bvnVerifying,
  bvnVerified,
  bvnError,
  verifyBvn,
}: StepProps & {
  channel: string;
  runDuplicateCheck: (q: string) => void;
  dupMatches: any[];
  onViewCustomer: (uid: string) => void;
  bvnVerifying: boolean;
  bvnVerified: { score: number; data: any } | null;
  bvnError: string;
  verifyBvn: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-emerald-600" />
          Bio Data & Residence
        </CardTitle>
        <CardDescription>
          Personal information about the customer. BVN will be verified externally.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Title + Name */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Title">
            <Select value={form.title} onValueChange={(v) => setField('title', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select title" />
              </SelectTrigger>
              <SelectContent>
                {TITLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="First Name" required invalid={isFieldInvalid('firstName')}>
            <Input
              value={form.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              placeholder="John"
            />
          </Field>
          <Field label="Last Name" required invalid={isFieldInvalid('lastName')}>
            <Input
              value={form.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
              placeholder="Doe"
            />
          </Field>
        </div>

        {/* Email + Phone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Email"
            required={channel === 'self_onboard'}
            invalid={isFieldInvalid('email')}
            hint={channel === 'self_onboard' ? 'Required for self-registration' : undefined}
          >
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              onBlur={(e) => runDuplicateCheck(e.target.value)}
              placeholder="john@example.com"
            />
          </Field>
          <Field label="Phone" required invalid={isFieldInvalid('phone')}>
            <Input
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              onBlur={(e) => runDuplicateCheck(e.target.value)}
              placeholder="+2348031234567"
            />
          </Field>
        </div>

        {/* v38: Password field — only for self_onboard */}
        {channel === 'self_onboard' && (
          <Field
            label="Create Password"
            required
            invalid={isFieldInvalid('password')}
            hint="Min 8 characters. You will use this to login to your account."
          >
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
            />
          </Field>
        )}

        {/* Duplicate alert */}
        {dupMatches.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700 mb-1">
                  Customer already exists — click to view
                </p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {dupMatches.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => onViewCustomer(u.id)}
                      className="block w-full text-left rounded-md border border-red-200 bg-white p-2 hover:bg-red-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {u.firstName} {u.lastName}
                        </span>
                        {u.kycStatus && (
                          <Badge className={cn('text-[10px]', KYC_STATUS_BADGES[u.kycStatus])}>
                            {KYC_STATUS_LABELS[u.kycStatus] || u.kycStatus}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {u.email || '—'} · {u.phone || '—'} ·{' '}
                        {u.accountNumber ? `Acct: ${u.accountNumber}` : 'No NUBAN'}
                        {u.bvn ? ` · BVN: …${u.bvn.slice(-4)}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alt phone + DOB */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Alt Phone">
            <Input
              value={form.altPhone}
              onChange={(e) => setField('altPhone', e.target.value)}
              placeholder="+2348031234568"
            />
          </Field>
          <Field
            label="Date of Birth"
            required
            invalid={isFieldInvalid('dob')}
            hint="Customer must be 21-70 years old"
          >
            <Input
              type="date"
              value={form.dob}
              min={dobMin.toISOString().slice(0, 10)}
              max={dobMax.toISOString().slice(0, 10)}
              onChange={(e) => setField('dob', e.target.value)}
            />
          </Field>
        </div>

        {/* BVN block */}
        <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="BVN" required invalid={isFieldInvalid('bvn')} hint="11 digits">
              <div className="flex gap-2">
                <Input
                  value={form.bvn}
                  onChange={(e) =>
                    setField('bvn', e.target.value.replace(/[^\d]/g, '').slice(0, 11))
                  }
                  placeholder="12345678901"
                  maxLength={11}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={verifyBvn}
                  disabled={bvnVerifying || form.bvn.length !== 11}
                  className="shrink-0"
                >
                  {bvnVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Confirm
                </Button>
              </div>
              {bvnError && <p className="text-xs text-red-600 mt-1">{bvnError}</p>}
              {bvnVerified && (
                <div className="mt-2 p-2 rounded-md bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-700">
                    ✅ BVN entered. Your Loan Officer will verify this externally during the assessment process.
                  </p>
                </div>
              )}
            </Field>
            <Field label="NIN" required invalid={isFieldInvalid('nin')} hint="11 digits">
              <Input
                value={form.nin}
                onChange={(e) =>
                  setField('nin', e.target.value.replace(/[^\d]/g, '').slice(0, 11))
                }
                placeholder="12345678901"
                maxLength={11}
              />
            </Field>
          </div>
          {bvnVerified && (
            <p className="text-xs text-slate-500 mt-2">
              Demographic fields for review. Review before continuing.
            </p>
          )}
        </div>

        {/* Gender + Marital */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Gender">
            <Select value={form.gender} onValueChange={(v) => setField('gender', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Marital Status">
            <Select value={form.maritalStatus} onValueChange={(v) => setField('maritalStatus', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select marital status" />
              </SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* State + LGA + Town */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="State" required invalid={isFieldInvalid('state')}>
            <Select value={form.state} onValueChange={(v) => setField('state', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                {NIGERIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="LGA">
            <Input
              value={form.lga}
              onChange={(e) => setField('lga', e.target.value)}
              placeholder="e.g. Ikeja"
            />
          </Field>
          <Field label="Town" required invalid={isFieldInvalid('town')}>
            <Input
              value={form.town}
              onChange={(e) => setField('town', e.target.value)}
              placeholder="e.g. Ojota"
            />
          </Field>
        </div>

        {/* Address + Landmark */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Residential Address" required invalid={isFieldInvalid('residentialAddress')}>
            <Textarea
              value={form.residentialAddress}
              onChange={(e) => setField('residentialAddress', e.target.value)}
              placeholder="House number, street name, area"
              rows={2}
            />
          </Field>
          <Field label="Nearest Landmark" required invalid={isFieldInvalid('nearestLandmark')}>
            <Input
              value={form.nearestLandmark}
              onChange={(e) => setField('nearestLandmark', e.target.value)}
              placeholder="e.g. Near Ojota motor park"
            />
          </Field>
        </div>

        {/* House ownership + Years + Religion */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="House Ownership" required invalid={isFieldInvalid('houseOwnershipStatus')}>
            <Select value={form.houseOwnershipStatus} onValueChange={(v) => setField('houseOwnershipStatus', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {HOUSE_OWNERSHIP.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Years at Residence">
            <Input
              type="number"
              min={0}
              max={80}
              value={form.yearsAtResidence}
              onChange={(e) => setField('yearsAtResidence', e.target.value)}
              placeholder="e.g. 5"
            />
          </Field>
          <Field label="Religion">
            <Select value={form.religion} onValueChange={(v) => setField('religion', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select religion" />
              </SelectTrigger>
              <SelectContent>
                {RELIGIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Business & Loan
// ---------------------------------------------------------------------------

function StepBusiness({
  form,
  setField,
  sectors,
  plans,
  isFieldInvalid,
  cacVerifying,
  cacVerified,
  cacError,
  verifyCac,
}: StepProps & {
  sectors: any[];
  plans: any[];
  cacVerifying: boolean;
  cacVerified: any;
  cacError: string;
  verifyCac: () => void;
}) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Business Information
          </CardTitle>
          <CardDescription>
            Trade or company information. CAC verification is optional but recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Business Name" required invalid={isFieldInvalid('businessName')}>
              <Input
                value={form.businessName}
                onChange={(e) => setField('businessName', e.target.value)}
                placeholder="e.g. John Doe Enterprises"
              />
            </Field>
            <Field label="Sector" required invalid={isFieldInvalid('sectorId')}>
              <Select value={form.sectorId} onValueChange={(v) => setField('sectorId', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sector" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {sectors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Shop Address" required invalid={isFieldInvalid('shopAddress')}>
            <Textarea
              value={form.shopAddress}
              onChange={(e) => setField('shopAddress', e.target.value)}
              placeholder="Shop number, market name, street"
              rows={2}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Date Established">
              <Input
                type="date"
                value={form.businessDateEstablished}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setField('businessDateEstablished', e.target.value)}
              />
            </Field>
            <Field label="Legal Structure" required invalid={isFieldInvalid('legalStructure')}>
              <Select value={form.legalStructure} onValueChange={(v) => setField('legalStructure', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select structure" />
                </SelectTrigger>
                <SelectContent>
                  {LEGAL_STRUCTURES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Number of Employees">
              <Input
                type="number"
                min={0}
                value={form.numberOfEmployees}
                onChange={(e) => setField('numberOfEmployees', e.target.value)}
                placeholder="e.g. 3"
              />
            </Field>
          </div>

          {/* RC/BN with verify */}
          <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
            <Field
              label="RC/BN Number"
              hint="Optional — required for registered companies"
            >
              <div className="flex gap-2">
                <Input
                  value={form.rcBnNumber}
                  onChange={(e) =>
                    setField('rcBnNumber', e.target.value.toUpperCase().replace(/[^RCBN0-9]/g, ''))
                  }
                  placeholder="RC123456 or BN123456"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={verifyCac}
                  disabled={cacVerifying || !form.rcBnNumber}
                  className="shrink-0"
                >
                  {cacVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-1" />
                  )}
                  Confirm
                </Button>
              </div>
              {cacError && <p className="text-xs text-red-600 mt-1">{cacError}</p>}
              {cacVerified && (
                <div className="mt-2 p-2 rounded-md bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-700">
                    ✅ RC/BN entered. The Legal department will verify this externally during the review process.
                  </p>
                </div>
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* Loan block */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Loan Request
          </CardTitle>
          <CardDescription>
            Optional — leave loan amount as 0 if the customer is not applying for credit yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Loan Amount (₦)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  ₦
                </span>
                <Input
                  inputMode="numeric"
                  className="pl-7"
                  value={formatNaira(form.loanAmount)}
                  onChange={(e) => setField('loanAmount', formatNaira(e.target.value))}
                  placeholder="0"
                />
              </div>
            </Field>
            <Field label="Loan Duration (months)">
              <Select
                value={form.loanDuration}
                onValueChange={(v) => setField('loanDuration', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} {m === 1 ? 'month' : 'months'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Loan Product">
            <Select value={form.planId} onValueChange={(v) => setField('planId', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select loan product" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.interest}% p.a. · {p.duration} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Loan Purpose">
            <Textarea
              value={form.loanPurpose}
              onChange={(e) => setField('loanPurpose', e.target.value)}
              placeholder="Describe what the loan will be used for"
              rows={3}
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Has External Loans</p>
                <p className="text-xs text-slate-500">Customer has active loans elsewhere</p>
              </div>
              <Switch
                checked={form.hasExternalLoans}
                onCheckedChange={(v) => setField('hasExternalLoans', v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Is Guarantor Elsewhere</p>
                <p className="text-xs text-slate-500">Customer is guaranteeing another loan</p>
              </div>
              <Switch
                checked={form.isGuarantorsewhere}
                onCheckedChange={(v) => setField('isGuarantorsewhere', v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Uploads & Assignment
// ---------------------------------------------------------------------------

function StepAssignment({
  form,
  setField,
  channel,
  currentAdmin,
  branches,
  branchManagers,
  loanOfficers,
  isFieldInvalid,
}: StepProps & {
  channel: string;
  currentAdmin: any;
  branches: any[];
  branchManagers: any[];
  loanOfficers: any[];
}) {
  return (
    <div className="space-y-5">
      {/* Assignment card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Assignment
          </CardTitle>
          <CardDescription>
            Determines which branch and Loan Officer will service this customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {channel === 'self_onboard' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-slate-700 mb-2">
                  Please select the branch nearest to you. This branch will be your servicing branch.
                </p>
              </div>
              <Field label="Select Your Branch" required invalid={isFieldInvalid('branchId')}>
                <Select value={form.branchId || 'none'} onValueChange={(v) => setField('branchId', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose nearest branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Select Branch —</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} ({b.code}){b.state ? ` — ${b.state}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {form.branchId && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-white px-2 py-1 border border-emerald-200">You</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-full bg-white px-2 py-1 border border-emerald-200">
                    {branches.find(b => b.id === form.branchId)?.name}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-full bg-white px-2 py-1 border border-emerald-200">BM</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-full bg-white px-2 py-1 border border-emerald-200">Loan Officer</span>
                </div>
              )}
            </div>
          )}

          {channel === 'desk_onboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Select Branch" required invalid={isFieldInvalid('branchId')}>
                  <Select value={form.branchId} onValueChange={(v) => setField('branchId', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.code}){b.state ? ` · ${b.state}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Select Branch Manager" hint="Optional — defaults to branch manager">
                  <Select value={form.bmId} onValueChange={(v) => setField('bmId', v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select BM" />
                    </SelectTrigger>
                    <SelectContent>
                      {branchManagers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.firstName} {m.lastName} ({m.username})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                  Assignment Flow
                </p>
                <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                  <span className="rounded-full bg-white px-2 py-1 border border-slate-200">
                    You (Frontdesk)
                  </span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-full bg-white px-2 py-1 border border-slate-200">
                    Branch Manager
                  </span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="rounded-full bg-white px-2 py-1 border border-slate-200">
                    Loan Officer
                  </span>
                </div>
              </div>
            </>
          )}

          {channel === 'bm_onboard' && (
            <>
              <Field label="Select Loan Officer" required invalid={isFieldInvalid('staffId')}>
                <Select value={form.staffId} onValueChange={(v) => setField('staffId', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select loan officer" />
                  </SelectTrigger>
                  <SelectContent>
                    {loanOfficers.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No loan officers in your branch
                      </SelectItem>
                    ) : (
                      loanOfficers.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.firstName} {o.lastName} ({o.username})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-900">Confirmation</p>
                </div>
                <p className="text-xs text-slate-700">
                  You ({currentAdmin?.firstName} {currentAdmin?.lastName}) are registering this
                  customer as the Branch Manager of{' '}
                  <span className="font-medium">{currentAdmin?.branch?.name || 'your branch'}</span>.
                  The selected Loan Officer will be responsible for origination and CAM intake.
                </p>
              </div>
            </>
          )}

          {channel === 'field_onboard' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-white p-2 border border-emerald-200">
                  <UserIcon className="h-4 w-4 text-emerald-700" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Direct assignment</p>
                  <p className="text-xs text-slate-700 mt-0.5">
                    Customer will be directly assigned to you.
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Badge className="bg-white text-slate-700 border border-emerald-200">
                      {currentAdmin?.firstName} {currentAdmin?.lastName} ({currentAdmin?.role})
                    </Badge>
                    {currentAdmin?.branch?.name && (
                      <Badge className="bg-white text-slate-700 border border-emerald-200">
                        {currentAdmin.branch.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploads card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-600" />
            Document Uploads
          </CardTitle>
          <CardDescription>
            Demo only — files are accepted but not stored. Production will upload to S3.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Passport Photo">
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center hover:border-emerald-400 transition-colors">
                <div className="h-24 w-20 mx-auto bg-slate-100 rounded-md flex items-center justify-center mb-2">
                  <IdCard className="h-6 w-6 text-slate-400" />
                </div>
                <Input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  onChange={(e) => setField('passportPhoto', e.target.files?.[0]?.name || '')}
                />
                <p className="text-[10px] text-slate-500 mt-1">150×180px preview</p>
              </div>
            </Field>
            <Field label="ID Card Photo">
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center hover:border-emerald-400 transition-colors">
                <div className="h-24 w-20 mx-auto bg-slate-100 rounded-md flex items-center justify-center mb-2">
                  <FileText className="h-6 w-6 text-slate-400" />
                </div>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="text-xs"
                  onChange={(e) => setField('idCardPhoto', e.target.files?.[0]?.name || '')}
                />
                <p className="text-[10px] text-slate-500 mt-1">Image or PDF</p>
              </div>
            </Field>
            <Field label="Additional Documents">
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center hover:border-emerald-400 transition-colors">
                <div className="h-24 w-20 mx-auto bg-slate-100 rounded-md flex items-center justify-center mb-2">
                  <FileText className="h-6 w-6 text-slate-400" />
                </div>
                <Input
                  type="file"
                  multiple
                  className="text-xs"
                  onChange={(e) =>
                    setField(
                      'additionalDocs',
                      Array.from(e.target.files || []).map((f) => f.name).join(', ')
                    )
                  }
                />
                <p className="text-[10px] text-slate-500 mt-1">Multiple files allowed</p>
              </div>
            </Field>
          </div>
          {(form.passportPhoto || form.idCardPhoto || form.additionalDocs) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1">Selected files:</p>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {form.passportPhoto && <li>• Passport: {form.passportPhoto}</li>}
                {form.idCardPhoto && <li>• ID Card: {form.idCardPhoto}</li>}
                {form.additionalDocs && <li>• Additional: {form.additionalDocs}</li>}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreement */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Checkbox
              id="agreement"
              checked={form.agreed}
              onCheckedChange={(v) => setField('agreed', v === true)}
              className={cn(
                'mt-0.5',
                isFieldInvalid('agreed') && 'border-red-500'
              )}
            />
            <div>
              <Label htmlFor="agreement" className="cursor-pointer">
                <span className="text-sm font-medium text-slate-900">
                  I confirm that the information provided is accurate
                </span>
              </Label>
              <p className="text-xs text-slate-500 mt-0.5">
                I attest that all KYC data captured is true to the best of my knowledge and
                that the customer has consented to verification by Watershed Finance Limited
                and BVN verification.
              </p>
              {isFieldInvalid('agreed') && (
                <p className="text-xs text-red-600 mt-1">
                  You must confirm the information is accurate before submitting.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* v39: CAC Search Consent Dialog */}
      {typeof showConsent !== 'undefined' && showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900">CAC Name Search Fee</h3>
            </div>
            <p className="text-sm text-slate-600">
              Your application will be reviewed by Customer Service for KYC verification. After
              KYC approval, a <strong>CAC Name Search</strong> will be conducted which attracts
              a fee of <strong>₦{cacFee.toLocaleString()}</strong>.
            </p>
            <p className="text-sm text-slate-600">
              By clicking <strong>Accept</strong>, you agree to pay this fee after your KYC is
              approved. You can pay via Paystack (card) or manual bank transfer.
            </p>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                If you click <strong>Reject</strong>, your application will be cancelled.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConsent(false);
                  setConsentAccepted(false);
                }}
              >
                Reject / Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setConsentAccepted(true);
                  setShowConsent(false);
                  void doSubmit();
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Accept & Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable Field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  hint,
  invalid,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(invalid && 'text-red-600')}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !invalid && <p className="text-[11px] text-slate-500">{hint}</p>}
      {invalid && <p className="text-[11px] text-red-600">Required field</p>}
    </div>
  );
}

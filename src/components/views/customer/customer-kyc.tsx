'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  KYC_STATUSES,
  ID_DOCUMENT_TYPES,
  BUSINESS_TYPES,
  NIGERIAN_STATES,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Upload, User, FileText,
  Camera, RotateCcw, ShieldCheck, Clock, XCircle, Home, Image as ImageIcon,
  Building2, IdCard, MapPin,
} from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SOURCE_OF_FUNDS = [
  { value: 'PERSONAL_SAVINGS', label: 'Personal Savings' },
  { value: 'FAMILY_SAVINGS', label: 'Family Savings' },
  { value: 'SALE_OF_ASSETS', label: 'Sale of Assets' },
  { value: 'BUSINESS_PROFITS', label: 'Business Profits' },
  { value: 'SALARY', label: 'Salary / Employment Income' },
  { value: 'INVESTMENT_RETURNS', label: 'Investment Returns' },
  { value: 'INHERITANCE', label: 'Inheritance' },
  { value: 'GIFT', label: 'Gift' },
  { value: 'PENSION', label: 'Pension / Retirement' },
  { value: 'RENTAL_INCOME', label: 'Rental Income' },
  { value: 'OTHER', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

type Step = 'personal' | 'physical' | 'selfie' | 'done';

interface KycState {
  kycStatus: string;
  step: Step;
  declineReason: string | null;
  business: any;
}

export function CustomerKycView() {
  const { currentUser, setView } = useAppStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [kyc, setKyc] = useState<KycState | null>(null);
  const [step, setStep] = useState<Step>('personal');
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Personal form state
  const [personal, setPersonal] = useState({
    bDay: '', bMonth: '', bYear: '',
    sourceOfFunds: '',
    docType: '',
    docNumber: '',
    line1: '', line2: '',
    city: '', state: '', country: 'Nigeria', postalCode: '',
  });

  // Step 2: Physical form state
  const [physical, setPhysical] = useState({
    businessType: '',
    docFront: '', docBack: '', proofOfAddress: '', docShopPhoto: '', docCac: '',
  });

  // Step 3: Selfie
  const [selfiePreview, setSelfiePreview] = useState<string>('');

  const load = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/customer/kyc?userId=${currentUser.id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load KYC status');
      setKyc({
        kycStatus: d.kycStatus,
        step: d.step,
        declineReason: d.declineReason,
        business: d.business,
      });
      // Pre-fill from saved business if any
      if (d.business) {
        const b = d.business;
        setPersonal((p) => ({
          ...p,
          bDay: b.bDay ? String(b.bDay) : '',
          bMonth: b.bMonth ? String(b.bMonth) : '',
          bYear: b.bYear ? String(b.bYear) : '',
          sourceOfFunds: b.sourceOfFunds || '',
          docType: b.docType || '',
          docNumber: b.docNumber || '',
          line1: b.line1 || '',
          line2: b.line2 || '',
          city: b.city || '',
          state: b.state || '',
          country: b.country || 'Nigeria',
          postalCode: b.postalCode || '',
        }));
        setPhysical((p) => ({
          ...p,
          businessType: b.businessType || '',
          docFront: b.docFront || '',
          docBack: b.docBack || '',
          proofOfAddress: b.proofOfAddress || '',
          docShopPhoto: b.docShopPhoto || '',
          docCac: b.docCac || '',
        }));
        if (b.selfie) setSelfiePreview(b.selfie);
      }
      // Determine starting step if user is mid-flow
      const status = d.kycStatus;
      if (status === KYC_STATUSES.APPROVED || status === KYC_STATUSES.PROCESSING) {
        // gate will render
      } else if (status === KYC_STATUSES.DECLINED || status === KYC_STATUSES.RESUBMIT) {
        setStep(d.step || 'personal');
      } else {
        setStep(d.step || 'personal');
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Submit handlers
  // ---------------------------------------------------------------------------

  const submitPersonal = async () => {
    if (!currentUser) return;
    if (!personal.bDay || !personal.bMonth || !personal.bYear) {
      toast({ title: 'Date of birth required', description: 'Please select your full date of birth.', variant: 'destructive' });
      return;
    }
    if (!personal.sourceOfFunds || !personal.docType || !personal.docNumber) {
      toast({ title: 'Missing fields', description: 'Source of funds, ID type and ID number are required.', variant: 'destructive' });
      return;
    }
    if (!personal.line1 || !personal.city || !personal.state || !personal.country || !personal.postalCode) {
      toast({ title: 'Address incomplete', description: 'Please complete your residential address.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/customer/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          step: 'personal',
          data: {
            b_day: Number(personal.bDay),
            b_month: Number(personal.bMonth),
            b_year: Number(personal.bYear),
            source_of_funds: personal.sourceOfFunds,
            doc_type: personal.docType,
            doc_number: personal.docNumber,
            line_1: personal.line1,
            line_2: personal.line2,
            city: personal.city,
            state: personal.state,
            country: personal.country,
            postal_code: personal.postalCode,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      toast({ title: 'Step 1 saved', description: 'Personal information recorded.' });
      setStep('physical');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitPhysical = async () => {
    if (!currentUser) return;
    if (!physical.businessType) {
      toast({ title: 'Business type required', description: 'Please select your business type.', variant: 'destructive' });
      return;
    }
    if (!physical.docFront || !physical.docBack || !physical.proofOfAddress || !physical.docShopPhoto) {
      toast({ title: 'Documents missing', description: 'Please upload all required documents.', variant: 'destructive' });
      return;
    }
    if (physical.businessType === 'registered' && !physical.docCac) {
      toast({ title: 'CAC document required', description: 'Registered companies must upload their CAC document.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/customer/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          step: 'physical',
          data: {
            business_type: physical.businessType,
            doc_front: physical.docFront,
            doc_back: physical.docBack,
            proof_of_address: physical.proofOfAddress,
            doc_shop_photo: physical.docShopPhoto,
            doc_cac: physical.docCac || '',
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      toast({ title: 'Step 2 saved', description: 'Business documents uploaded.' });
      setStep('selfie');
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitSelfie = async () => {
    if (!currentUser) return;
    if (!selfiePreview) {
      toast({ title: 'Selfie required', description: 'Please take or upload a selfie photo.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/customer/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          step: 'selfie',
          data: { selfie: selfiePreview },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to submit');
      toast({ title: 'KYC Submitted!', description: 'Your documents are under review.' });
      setStep('done');
      // refresh state
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // File upload helper (used for physical step docs)
  // ---------------------------------------------------------------------------
  const uploadFiles = async (files: Record<string, File>) => {
    const fd = new FormData();
    Object.entries(files).forEach(([k, f]) => fd.append(k, f));
    const res = await fetch('/api/customer/kyc/upload', { method: 'POST', body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Upload failed');
    return d.paths as Record<string, string>;
  };

  // ---------------------------------------------------------------------------
  // Loading & gate
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading KYC...
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-slate-700">Please sign in to continue.</p>
          <Button className="mt-3 bg-emerald-600 hover:bg-emerald-700" onClick={() => setView('customer-login')}>
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  const status = kyc?.kycStatus;

  // Gate: already approved
  if (status === KYC_STATUSES.APPROVED) {
    return (
      <GateCard
        icon={<CheckCircle2 className="h-12 w-12 text-emerald-600" />}
        title="KYC Verified ✓"
        description="Your identity has been verified. You have full access to all banking services including loan applications."
        badge={<Badge className="bg-emerald-100 text-emerald-700">Verified</Badge>}
        action={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setView('customer-dashboard')}>
            <Home className="h-4 w-4 mr-1" /> Go to Dashboard
          </Button>
        }
      />
    );
  }

  // Gate: under review
  if (status === KYC_STATUSES.PROCESSING && step !== 'done') {
    return (
      <GateCard
        icon={<Clock className="h-12 w-12 text-amber-500" />}
        title="KYC Under Review"
        description="Your KYC documents have been submitted and are under review by our compliance team. You'll be notified once a decision is reached (typically 24–48 hours)."
        badge={<Badge className="bg-amber-100 text-amber-700">Processing</Badge>}
        action={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setView('customer-dashboard')}>
            <Home className="h-4 w-4 mr-1" /> Back to Dashboard
          </Button>
        }
      />
    );
  }

  // Step done screen (post-submit confirmation)
  if (step === 'done' || (status === KYC_STATUSES.PROCESSING && step === 'done')) {
    return (
      <GateCard
        icon={<CheckCircle2 className="h-12 w-12 text-emerald-600" />}
        title="KYC Submitted!"
        description="Your documents are under review. You'll be notified once approved. This usually takes 24–48 hours."
        badge={<Badge className="bg-emerald-100 text-emerald-700">Submitted</Badge>}
        action={
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setView('customer-dashboard')}>
            <Home className="h-4 w-4 mr-1" /> Back to Dashboard
          </Button>
        }
      />
    );
  }

  // Progress %
  const progressPct = step === 'personal' ? 33 : step === 'physical' ? 66 : 100;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Complete Your KYC
            </h1>
            <p className="text-xs text-slate-500">
              Verify your identity to unlock loans, savings and investments.
            </p>
          </div>
        </div>

        {/* Resubmit / declined banner */}
        {(status === KYC_STATUSES.RESUBMIT || status === KYC_STATUSES.DECLINED) && kyc?.declineReason && (
          <Card className={cn(
            'border p-4',
            status === KYC_STATUSES.DECLINED ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
          )}>
            <div className="flex items-start gap-2">
              {status === KYC_STATUSES.DECLINED ? (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              )}
              <div>
                <p className={cn('text-sm font-semibold', status === KYC_STATUSES.DECLINED ? 'text-red-800' : 'text-amber-800')}>
                  {status === KYC_STATUSES.DECLINED ? 'KYC Declined' : 'Resubmission Required'}
                </p>
                <p className={cn('text-xs mt-0.5', status === KYC_STATUSES.DECLINED ? 'text-red-700' : 'text-amber-700')}>
                  {kyc.declineReason}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Please review and re-submit your information below.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Progress bar */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-700">
              Step {step === 'personal' ? 1 : step === 'physical' ? 2 : 3} of 3 —{' '}
              {step === 'personal' ? 'Personal Information' : step === 'physical' ? 'Physical Documents' : 'Selfie Verification'}
            </p>
            <span className="text-xs font-bold text-emerald-700">{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2 bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-emerald-600" />
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { n: 1, label: 'Personal', key: 'personal' },
              { n: 2, label: 'Physical', key: 'physical' },
              { n: 3, label: 'Selfie', key: 'selfie' },
            ].map((s) => {
              const active = step === s.key;
              const done =
                (s.key === 'personal' && (step === 'physical' || step === 'selfie')) ||
                (s.key === 'physical' && step === 'selfie');
              return (
                <div
                  key={s.key}
                  className={cn(
                    'rounded-md border p-2 text-center transition-colors',
                    active ? 'border-emerald-300 bg-emerald-50' : done ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-white'
                  )}
                >
                  <div className="flex items-center justify-center gap-1">
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                          active ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                        )}
                      >
                        {s.n}
                      </span>
                    )}
                    <span className={cn('text-xs font-semibold', active ? 'text-emerald-800' : 'text-slate-600')}>
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Step content */}
        {step === 'personal' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-emerald-600" /> Personal Information
              </CardTitle>
              <CardDescription>Tell us about yourself. All fields marked * are required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Date of birth */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Date of Birth *</Label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <Select value={personal.bMonth} onValueChange={(v) => setPersonal({ ...personal, bMonth: v })}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={personal.bDay} onValueChange={(v) => setPersonal({ ...personal, bDay: v })}>
                    <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {DAYS.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={personal.bYear} onValueChange={(v) => setPersonal({ ...personal, bYear: v })}>
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Source of funds */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Source of Funds *</Label>
                <Select value={personal.sourceOfFunds} onValueChange={(v) => setPersonal({ ...personal, sourceOfFunds: v })}>
                  <SelectTrigger className="w-full mt-1"><SelectValue placeholder="How do you generate your income?" /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OF_FUNDS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* ID document */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Identity Document Type *</Label>
                  <Select value={personal.docType} onValueChange={(v) => setPersonal({ ...personal, docType: v })}>
                    <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Select ID type" /></SelectTrigger>
                    <SelectContent>
                      {ID_DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">ID Document Number *</Label>
                  <Input
                    value={personal.docNumber}
                    onChange={(e) => setPersonal({ ...personal, docNumber: e.target.value })}
                    placeholder="e.g. 12345678901"
                    className="font-mono mt-1"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" /> Residential Address
                </p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-slate-600">Address Line 1 *</Label>
                    <Input
                      value={personal.line1}
                      onChange={(e) => setPersonal({ ...personal, line1: e.target.value })}
                      placeholder="House number, street name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">Address Line 2 (optional)</Label>
                    <Input
                      value={personal.line2}
                      onChange={(e) => setPersonal({ ...personal, line2: e.target.value })}
                      placeholder="Apartment, suite, landmark"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs text-slate-600">City *</Label>
                      <Input value={personal.city} onChange={(e) => setPersonal({ ...personal, city: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">State *</Label>
                      <Select value={personal.state} onValueChange={(v) => setPersonal({ ...personal, state: v })}>
                        <SelectTrigger className="w-full mt-1"><SelectValue placeholder="State" /></SelectTrigger>
                        <SelectContent className="max-h-72">
                          {NIGERIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Country *</Label>
                      <Input value={personal.country} onChange={(e) => setPersonal({ ...personal, country: e.target.value })} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-600">Postal Code *</Label>
                      <Input
                        value={personal.postalCode}
                        onChange={(e) => setPersonal({ ...personal, postalCode: e.target.value })}
                        className="mt-1 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setView('customer-dashboard')}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={submitPersonal}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Continue to Documents
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'physical' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-emerald-600" /> Physical Documents
              </CardTitle>
              <CardDescription>
                Upload clear photos / scans of your documents. Accepted: JPG, PNG, PDF. Max 10MB each.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Business type */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Business Type *</Label>
                <Select
                  value={physical.businessType}
                  onValueChange={(v) => setPhysical({ ...physical, businessType: v, docCac: v === 'individual' ? '' : physical.docCac })}
                >
                  <SelectTrigger className="w-full mt-1"><SelectValue placeholder="Select your business type" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Document uploads */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <UploadZone
                  label="ID Front *"
                  icon={IdCard}
                  value={physical.docFront}
                  onChange={async (file) => {
                    try {
                      const paths = await uploadFiles({ docFront: file });
                      setPhysical((p) => ({ ...p, docFront: paths.docFront }));
                      toast({ title: 'ID Front uploaded' });
                    } catch (e: any) {
                      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
                    }
                  }}
                  onClear={() => setPhysical({ ...physical, docFront: '' })}
                />
                <UploadZone
                  label="ID Back *"
                  icon={IdCard}
                  value={physical.docBack}
                  onChange={async (file) => {
                    try {
                      const paths = await uploadFiles({ docBack: file });
                      setPhysical((p) => ({ ...p, docBack: paths.docBack }));
                      toast({ title: 'ID Back uploaded' });
                    } catch (e: any) {
                      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
                    }
                  }}
                  onClear={() => setPhysical({ ...physical, docBack: '' })}
                />
                <UploadZone
                  label="Proof of Address (Utility Bill) *"
                  icon={FileText}
                  value={physical.proofOfAddress}
                  acceptPdf
                  onChange={async (file) => {
                    try {
                      const paths = await uploadFiles({ proofOfAddress: file });
                      setPhysical((p) => ({ ...p, proofOfAddress: paths.proofOfAddress }));
                      toast({ title: 'Proof of address uploaded' });
                    } catch (e: any) {
                      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
                    }
                  }}
                  onClear={() => setPhysical({ ...physical, proofOfAddress: '' })}
                />
                <UploadZone
                  label="Shop / Business Photo *"
                  icon={Building2}
                  value={physical.docShopPhoto}
                  onChange={async (file) => {
                    try {
                      const paths = await uploadFiles({ docShopPhoto: file });
                      setPhysical((p) => ({ ...p, docShopPhoto: paths.docShopPhoto }));
                      toast({ title: 'Shop photo uploaded' });
                    } catch (e: any) {
                      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
                    }
                  }}
                  onClear={() => setPhysical({ ...physical, docShopPhoto: '' })}
                />
                {physical.businessType === 'registered' && (
                  <UploadZone
                    label="CAC Document *"
                    icon={FileText}
                    value={physical.docCac}
                    acceptPdf
                    onChange={async (file) => {
                      try {
                        const paths = await uploadFiles({ docCac: file });
                        setPhysical((p) => ({ ...p, docCac: paths.docCac }));
                        toast({ title: 'CAC document uploaded' });
                      } catch (e: any) {
                        toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
                      }
                    }}
                    onClear={() => setPhysical({ ...physical, docCac: '' })}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setStep('personal')}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={submitting} onClick={submitPhysical}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Continue to Selfie
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'selfie' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4 text-emerald-600" /> Selfie Verification
              </CardTitle>
              <CardDescription>
                Take a clear selfie or upload a recent photo. Your face should be clearly visible.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selfiePreview ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <img
                      src={selfiePreview}
                      alt="Selfie preview"
                      className="h-64 w-64 rounded-full object-cover border-4 border-emerald-200 shadow-md"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                      <CheckCircle2 className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 text-center">
                    Looks good? Submit to complete your KYC. Or retake to capture a new photo.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => setSelfiePreview('')}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Retake
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Camera capture (mobile/desktop front camera) */}
                  <label
                    htmlFor="selfie-camera"
                    className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 p-8 transition-colors"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Camera className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-semibold text-emerald-800">Take a Selfie</p>
                    <p className="text-[11px] text-slate-500 text-center max-w-xs">
                      Uses your device camera. On desktop, you'll be prompted to choose a camera or photo.
                    </p>
                    <input
                      id="selfie-camera"
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="sr-only"
                      onChange={(e) => handleSelfieFile(e.target.files?.[0])}
                    />
                  </label>

                  {/* Or upload fallback */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[10px] text-slate-400 uppercase">or</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <label
                    htmlFor="selfie-upload"
                    className="flex flex-col items-center justify-center gap-2 cursor-pointer rounded-lg border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 p-5 transition-colors"
                  >
                    <ImageIcon className="h-6 w-6 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-700">Upload a photo</p>
                    <input
                      id="selfie-upload"
                      type="file"
                      accept="image/png,image/jpeg"
                      className="sr-only"
                      onChange={(e) => handleSelfieFile(e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <Button variant="outline" onClick={() => setStep('physical')}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={submitting || !selfiePreview}
                  onClick={submitSelfie}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Submit KYC
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Selfie file → base64
  // ---------------------------------------------------------------------------
  function handleSelfieFile(file?: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Please use an image under 8MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Convert JPEG → PNG-like data URL by canvas (keep simple — store as-is).
      // The API strips the data: prefix and stores bytes as PNG. JPEG bytes
      // saved with .png extension will still display correctly in <img>.
      setSelfiePreview(result);
      toast({ title: 'Selfie captured', description: 'You can submit now or retake.' });
    };
    reader.onerror = () => toast({ title: 'Could not read image', variant: 'destructive' });
    reader.readAsDataURL(file);
  }
}

// ---------------------------------------------------------------------------
// Gate card — for "approved", "under review", "done" screens
// ---------------------------------------------------------------------------
function GateCard({
  icon, title, description, badge, action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { setView } = useAppStore();
  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6 flex items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
          {badge}
        </div>
        <p className="text-sm text-slate-600 mb-6">{description}</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {action}
          <Button variant="outline" onClick={() => setView('customer-dashboard')}>
            <Home className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadZone — image/file upload with preview
// ---------------------------------------------------------------------------
function UploadZone({
  label, icon: Icon, value, onChange, onClear, acceptPdf,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (file: File) => void | Promise<void>;
  onClear: () => void;
  acceptPdf?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const accept = acceptPdf ? 'image/*,application/pdf' : 'image/*';
  const isPdf = value?.toLowerCase().endsWith('.pdf');

  return (
    <div className="rounded-md border border-slate-200 overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-slate-50">
        <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
          <Icon className="h-3 w-3 text-slate-400" /> {label}
        </p>
        {value && (
          <button
            onClick={onClear}
            className="text-[10px] text-red-600 hover:underline"
            type="button"
          >
            Remove
          </button>
        )}
      </div>
      <div className="aspect-[4/3] bg-slate-50 flex items-center justify-center relative">
        {value ? (
          isPdf ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1 text-slate-500 hover:text-emerald-700"
            >
              <FileText className="h-10 w-10" />
              <span className="text-[10px] underline">View PDF</span>
            </a>
          ) : (
            <img
              src={value}
              alt={label}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-emerald-700 p-4"
          >
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
            <span className="text-[11px] font-medium">{busy ? 'Uploading...' : 'Click to upload'}</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
              alert('File too large. Max 10MB.');
              return;
            }
            setBusy(true);
            try {
              await onChange(file);
            } finally {
              setBusy(false);
              if (inputRef.current) inputRef.current.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

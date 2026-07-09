'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { CustomerHeader } from './customer-loans';
import { authFetch } from '@/lib/auth-client';

export function CustomerApplyLoan() {
  const { currentUser, setView } = useAppStore();
  const [plans, setPlans] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    amount: '',
    duration: '12',
    planId: '',
    purpose: '',
    hasExternalLoans: false,
    isGuarantorsewhere: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    authFetch('/api/loan-plans').then(r => r.json()).then(d => setPlans(d.plans || d || [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!formData.amount || Number(formData.amount) < 10000) {
      setError('Minimum loan amount is ₦10,000');
      return;
    }
    if (!formData.purpose) {
      setError('Please describe the purpose of this loan');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await authFetch('/api/customer/apply-loan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: Number(formData.amount),
          duration: Number(formData.duration),
          planId: formData.planId,
          purpose: formData.purpose,
          hasExternalLoans: formData.hasExternalLoans,
          isGuarantorsewhere: formData.isGuarantorsewhere,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Application failed');
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="max-w-2xl mx-auto">
          <CustomerHeader title="Application Submitted" user={currentUser} />
          <Card className="p-8 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Loan Application Submitted! 🎉</h2>
            <p className="text-sm text-slate-600 mb-6">
              Your application has been received and assigned to a Loan Officer. You'll receive an update within 24-48 hours.
              Track the progress from your dashboard.
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setView('customer-dashboard')} className="bg-emerald-600 hover:bg-emerald-700">
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => { setSuccess(false); setFormData({ amount: '', duration: '12', planId: '', purpose: '', hasExternalLoans: false, isGuarantorsewhere: false }); }}>
                Apply for Another
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-2xl mx-auto">
        <CustomerHeader title="Apply for a Loan" user={currentUser} subtitle="Get funded in 48 hours" />

        {currentUser?.kycStatus !== 'APPROVED' && (
          <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">KYC Verification Required</p>
                <p className="text-xs text-amber-700">Your KYC must be approved before applying. Current status: {currentUser?.kycStatus || 'Pending'}</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6 space-y-4">
          <div>
            <Label className="text-sm font-medium">Select Loan Product</Label>
            <Select value={formData.planId} onValueChange={(v) => setFormData({ ...formData, planId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a loan product" /></SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.interest}% p.a. ({p.duration}mo)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Loan Amount (₦)</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="e.g. 500000"
                className="mt-1"
                min="10000"
              />
              <p className="text-[10px] text-slate-500 mt-1">Min: ₦20,000 · Max: ₦20,000,000</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Duration (months)</Label>
              <Select value={formData.duration} onValueChange={(v) => setFormData({ ...formData, duration: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 6, 9, 12, 18, 24].map(m => <SelectItem key={m} value={String(m)}>{m} months</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">Purpose of Loan *</Label>
            <Textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              placeholder="Describe what you need this loan for (e.g. working capital for inventory purchase, equipment, etc.)"
              rows={3}
              className="mt-1"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.hasExternalLoans} onChange={(e) => setFormData({ ...formData, hasExternalLoans: e.target.checked })} className="h-4 w-4 rounded text-emerald-600" />
              <span className="text-sm text-slate-700">I have existing loans with other lenders</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formData.isGuarantorsewhere} onChange={(e) => setFormData({ ...formData, isGuarantorsewhere: e.target.checked })} className="h-4 w-4 rounded text-emerald-600" />
              <span className="text-sm text-slate-700">I am currently a guarantor for someone else's loan</span>
            </label>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] text-slate-500 mb-3">
              By submitting, you authorize Watershed Finance to perform a credit check and verify the information provided.
              Your Loan Officer will contact you within 24 hours.
            </p>
            <Button
              onClick={handleSubmit}
              disabled={loading || currentUser?.kycStatus !== 'APPROVED'}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? 'Submitting...' : 'Submit Application'} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

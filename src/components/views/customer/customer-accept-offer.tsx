'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowRight, CheckCircle2, Shield, FileText, PenTool, Lock,
} from 'lucide-react';
import { CustomerHeader } from './customer-loans';
import { authFetch } from '@/lib/auth-client';

export function CustomerAcceptOffer() {
  const { currentUser, viewParams, setView } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [loan, setLoan] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'review' | 'sign' | 'done'>('review');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [signature, setSignature] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!loanId) return;
      try {
        const res = await authFetch(`/api/loans/${loanId}`);
        const d = await res.json();
        setLoan(d.loan);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [loanId]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  const handleSign = async () => {
    if (otp.length !== 6) {
      setError('Please enter the 6-digit OTP sent to your phone');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await authFetch('/api/customer/accept-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId,
          userId: currentUser.id,
          signature: {
            method: 'Secure OTP',
            otp,
            ip: 'client',
            userAgent: navigator.userAgent,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Acceptance failed');
      setSignature(data.signature);
      setStep('done');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const sendOtp = () => {
    // Mock: just move to sign step
    setStep('sign');
    alert(`Mock OTP sent to ${currentUser?.phone || 'your phone'}: Use 123456 for demo`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading offer...</div>;
  if (!loan) return <div className="min-h-screen flex items-center justify-center text-red-500">Loan not found</div>;

  const finalAmount = loan.finalAmount || loan.vettedAmount || loan.amount;
  const finalTenure = loan.finalTenure || loan.vettedDuration || loan.duration;
  const finalRate = loan.finalInterestRate || loan.percent || 24;
  const ccd = loan.finalCcdFeePercent || 10;
  const upfront = loan.finalUpfrontFeePercent || 1;

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="max-w-2xl mx-auto">
          <CustomerHeader title="Offer Accepted" user={currentUser} />
          <Card className="p-8 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Offer Accepted! 🎉</h2>
            <p className="text-sm text-slate-600 mb-6">
              Your loan agreement has been digitally signed. Your loan is now being scheduled for disbursement.
              Funds will be credited to your account within 48 hours.
            </p>
            <Card className="p-4 bg-emerald-50 border-emerald-200 mb-6 text-left">
              <p className="text-xs font-semibold text-emerald-900 mb-2">Digital Signature Record</p>
              <div className="space-y-1 text-[11px] text-emerald-800">
                <p><strong>Method:</strong> {signature?.method}</p>
                <p><strong>Signatory:</strong> {currentUser?.firstName} {currentUser?.lastName}</p>
                <p><strong>Timestamp:</strong> {signature ? new Date(signature.timestamp).toLocaleString() : ''}</p>
                <p><strong>OTP ID:</strong> {signature?.otpId}</p>
                <p><strong>Hash:</strong> <code className="text-[10px]">{signature?.hash}</code></p>
                <p className="text-[10px] mt-2 italic">Legally binding under the {signature?.legalCitation}</p>
              </div>
            </Card>
            <Button onClick={() => setView('customer-dashboard')} className="bg-emerald-600 hover:bg-emerald-700">
              Go to Dashboard
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto">
        <CustomerHeader title="Review & Sign Offer" user={currentUser} subtitle={loan.applicationRef} />

        {/* Offer Letter Preview */}
        <Card className="p-6 mb-4">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-slate-900">PROVISIONAL OFFER LETTER</h2>
            <p className="text-xs text-slate-500">Watershed Finance Limited</p>
          </div>

          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500">Borrower</p><p className="font-semibold">{currentUser?.firstName} {currentUser?.lastName}</p></div>
              <div><p className="text-xs text-slate-500">Trading As</p><p className="font-semibold">{loan.user?.business?.name || '—'}</p></div>
              <div><p className="text-xs text-slate-500">Date</p><p className="font-semibold">{new Date().toLocaleDateString()}</p></div>
              <div><p className="text-xs text-slate-500">Application Ref</p><p className="font-mono font-semibold">{loan.applicationRef}</p></div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase mb-2">Loan Terms</h3>
              <div className="grid grid-cols-2 gap-3">
                <TermRow label="Facility Type" value="Business Loan" />
                <TermRow label="Loan Amount" value={fmtNaira(finalAmount)} highlight />
                <TermRow label="Tenor" value={`${finalTenure} months`} />
                <TermRow label="Interest Rate" value={`${finalRate}% p.a.`} />
                <TermRow label="CCD (Credit Confirmation)" value={`${ccd}%`} />
                <TermRow label="Upfront Fee" value={`${upfront}%`} />
                <TermRow label="Repayment Method" value={loan.repaymentPlan || 'REDUCING'} />
                <TermRow label="Repayment Frequency" value="Monthly" />
                <TermRow label="Purpose" value={loan.reason || 'Business operations'} />
                <TermRow label="Repayment Source" value="Business Proceeds" />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase mb-2">Key Terms & Conditions</h3>
              <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside">
                <li>The Borrower shall repay the loan in equal monthly installments as per the repayment schedule.</li>
                <li>Late payment attracts a penalty of 0.03% per day on overdue amount after 2 days grace.</li>
                <li>The Borrower authorizes the Lender to report default to relevant authorities and auction pledged collateral on default.</li>
                <li>The Borrower shall maintain insurance on pledged assets for the loan duration.</li>
                <li>This offer is valid for 14 days from the date of issue.</li>
              </ol>
            </div>
          </div>
        </Card>

        {/* Action card */}
        {step === 'review' ? (
          <Card className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <Shield className="h-6 w-6 text-emerald-600 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ready to Accept?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  By accepting, you agree to the terms above. You'll be asked to verify with an OTP sent to your registered phone.
                  The signature is legally binding under the Evidence Act and Cybercrimes Act of Nigeria.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setView('customer-loans')} className="flex-1">Decline</Button>
              <Button onClick={sendOtp} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <PenTool className="h-4 w-4 mr-1" /> Accept & Sign with OTP
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex items-start gap-3 mb-4">
              <Lock className="h-6 w-6 text-emerald-600 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-bold text-slate-900">Verify with OTP</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter the 6-digit code sent to {currentUser?.phone || 'your phone'}.
                  (Demo: use <code className="bg-slate-100 px-1 rounded">123456</code>)
                </p>
              </div>
            </div>
            <div className="mb-4">
              <Label className="text-xs">OTP Code</Label>
              <Input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mt-1 text-center text-2xl font-mono tracking-widest"
              />
            </div>
            {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-3">{error}</div>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('review')} className="flex-1">Back</Button>
              <Button onClick={handleSign} disabled={submitting || otp.length !== 6} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                {submitting ? 'Signing...' : 'Sign & Accept'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4 mt-4 bg-slate-50">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileText className="h-4 w-4" />
            <p>This offer letter is generated from locked CAM snapshot. Terms are immutable once generated.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TermRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={highlight ? 'text-base font-bold text-emerald-700' : 'text-sm font-semibold text-slate-900'}>{value}</span>
    </div>
  );
}

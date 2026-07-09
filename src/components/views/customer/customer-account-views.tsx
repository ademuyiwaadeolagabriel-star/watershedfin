'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Calculator, Check, Clock, FileText } from 'lucide-react';
import { CustomerHeader } from './customer-loans';
import { fmtNaira } from '@/lib/loan-calc';
import { authFetch } from '@/lib/auth-client';

export function CustomerLoanProducts() {
  const { setView } = useAppStore();
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    authFetch('/api/loan-plans').then(r => r.json()).then(d => setPlans(d.plans || d || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <CustomerHeader title="Loan Products" user={null} subtitle="Browse our loan products and find the right one for you" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((p: any) => (
            <Card key={p.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{p.name}</h3>
                  <Badge variant="outline" className="text-[10px] mt-1">{p.type || 'Loan'}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald-600">{p.interest}%</p>
                  <p className="text-[10px] text-slate-500">p.a.</p>
                </div>
              </div>
              {p.description && <p className="text-xs text-slate-600 mb-3">{p.description}</p>}
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <div><p className="text-slate-500">Min Amount</p><p className="font-semibold">{fmtNaira(p.min || 0)}</p></div>
                <div><p className="text-slate-500">Max Amount</p><p className="font-semibold">{fmtNaira(p.max || 0)}</p></div>
                <div><p className="text-slate-500">Tenor</p><p className="font-semibold">{p.duration} months</p></div>
                <div><p className="text-slate-500">Min Credit Score</p><p className="font-semibold">{p.minCreditScore || 50}</p></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setView('customer-loan-calculator')} variant="outline" size="sm" className="flex-1">
                  <Calculator className="h-3.5 w-3.5 mr-1" /> Calculate
                </Button>
                <Button onClick={() => setView('customer-apply')} size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  Apply <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomerOffers() {
  const { currentUser, setView } = useAppStore();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`).then(r => r.json()).then(setData).catch(() => {});
  }, [currentUser]);

  const offer = data?.preQualifiedOffer;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <CustomerHeader title="Pre-Qualified Offers" user={null} subtitle="Special loan offers available to you" />
        {offer ? (
          <Card className="p-6 bg-gradient-to-r from-purple-600 to-purple-800 text-white border-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                <Check className="h-6 w-6 text-yellow-300" />
              </div>
              <div>
                <p className="text-purple-200 text-xs uppercase tracking-wider">Pre-Qualified</p>
                <p className="text-xl font-bold">{offer.type}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div><p className="text-purple-200 text-[10px] uppercase">Amount</p><p className="text-2xl font-bold">{fmtNaira(offer.amount)}</p></div>
              <div><p className="text-purple-200 text-[10px] uppercase">Rate</p><p className="text-2xl font-bold">{offer.rate}%</p></div>
              <div><p className="text-purple-200 text-[10px] uppercase">Tenor</p><p className="text-2xl font-bold">{offer.tenor}mo</p></div>
            </div>
            <p className="text-purple-200 text-xs mb-4">Valid until {new Date(offer.validUntil).toLocaleDateString('en-NG')}</p>
            <Button onClick={() => setView('customer-apply')} className="bg-white text-purple-700 hover:bg-purple-50">
              Apply Now <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <Clock className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-900 mb-1">No Pre-Qualified Offers Available</p>
            <p className="text-xs text-slate-500 mb-4">
              {data?.stats?.kycStatus !== 'APPROVED'
                ? 'Complete your KYC verification to become eligible for pre-qualified offers.'
                : 'Keep up with your loan repayments to unlock pre-qualified top-up offers in the future.'}
            </p>
            {data?.stats?.kycStatus !== 'APPROVED' ? (
              <Button onClick={() => setView('customer-profile')} variant="outline">Complete KYC</Button>
            ) : (
              <Button onClick={() => setView('customer-apply')} className="bg-emerald-600 hover:bg-emerald-700">Apply for a Loan</Button>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export function CustomerDocuments() {
  const { currentUser, viewParams, setView } = useAppStore();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`).then(r => r.json()).then(setData).catch(() => {});
  }, [currentUser]);

  const loans = data?.loans || [];
  const documents: any[] = [];
  loans.forEach((loan: any) => {
    if (loan.offerLetterGeneratedAt || loan.status === 'running' || loan.status === 'paid') {
      documents.push({
        type: 'Offer Letter',
        loanRef: loan.applicationRef,
        loanId: loan.id,
        date: loan.offerLetterGeneratedAt || loan.createdAt,
        status: 'Available',
        icon: FileText,
        color: 'emerald',
        action: () => setView('customer-accept-offer', { loanId: loan.id }),
      });
    }
    if (loan.status === 'running' || loan.status === 'paid') {
      documents.push({
        type: 'Repayment Schedule',
        loanRef: loan.applicationRef,
        loanId: loan.id,
        date: loan.disbursedAt || loan.createdAt,
        status: 'Available',
        icon: Clock,
        color: 'blue',
        action: () => setView('customer-loan-breakdown', { loanId: loan.id }),
      });
    }
    documents.push({
      type: 'Loan Statement',
      loanRef: loan.applicationRef,
      loanId: loan.id,
      date: new Date(),
      status: 'Generate',
      icon: FileText,
      color: 'purple',
      action: () => setView('customer-loan-breakdown', { loanId: loan.id }),
    });
  });

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <CustomerHeader title="Documents" user={null} subtitle="Your loan documents, statements, and certificates" />
        {documents.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No documents available yet</p>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="space-y-2">
              {documents.map((doc, idx) => {
                const Icon = doc.icon;
                return (
                  <button
                    key={idx}
                    onClick={doc.action}
                    className="w-full flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 text-left"
                  >
                    <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 bg-${doc.color}-100 text-${doc.color}-600`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{doc.type}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{doc.loanRef}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500">{new Date(doc.date).toLocaleDateString('en-NG')}</p>
                      <Badge variant="outline" className="text-[9px] mt-0.5">{doc.status}</Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CustomerBankAccounts() {
  const { currentUser } = useAppStore();
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customers/${currentUser.id}`)
      .then(r => r.json())
      .then(d => setBanks(d.user?.userBanks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <CustomerHeader title="Bank Accounts" user={null} subtitle="Your linked bank accounts for disbursements and repayments" />
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">Linked Accounts</h3>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">+ Add Bank Account</Button>
          </div>
          {loading ? (
            <p className="text-xs text-slate-400 py-6 text-center">Loading...</p>
          ) : banks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500 mb-2">No bank accounts linked yet</p>
              <p className="text-xs text-slate-400">Add a bank account to receive loan disbursements and make repayments</p>
            </div>
          ) : (
            <div className="space-y-2">
              {banks.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xs font-bold">
                    {b.bankName?.[0] || 'B'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{b.bankName}</p>
                    <p className="text-xs text-slate-500 font-mono">{b.accountNumber}</p>
                    {b.accountName && <p className="text-[10px] text-slate-400">{b.accountName}</p>}
                  </div>
                  {b.isDefault && <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">DEFAULT</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-700">
            💡 <strong>Note:</strong> Your default bank account is used for loan disbursements. You can add multiple accounts and switch defaults anytime.
          </p>
        </Card>
      </div>
    </div>
  );
}

export function CustomerSecurity() {
  const { currentUser } = useAppStore();
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <CustomerHeader title="Security Settings" user={null} subtitle="Manage your account security" />
        
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Password & PIN</h3>
          <div className="space-y-3">
            <button className="flex items-center justify-between w-full p-3 rounded-md border border-slate-200 hover:bg-slate-50 text-left">
              <div>
                <p className="text-sm font-medium text-slate-900">Change Password</p>
                <p className="text-[10px] text-slate-500">Last changed: Never</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <div className="p-3 rounded-md border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Transaction PIN</p>
                  <p className="text-[10px] text-slate-500">Required for payments and transfers</p>
                </div>
                <Badge className={currentUser?.pin ? 'bg-emerald-100 text-emerald-700 text-[9px]' : 'bg-amber-100 text-amber-700 text-[9px]'}>
                  {currentUser?.pin ? 'SET' : 'NOT SET'}
                </Badge>
              </div>
              {!currentUser?.pin && (
                <div className="mt-2">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 4-6 digit PIN"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={() => setShowPin(!showPin)}>{showPin ? 'Hide' : 'Show'}</Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={pin.length < 4}>Set PIN</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Two-Factor Authentication</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-md border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-900">SMS Authentication</p>
                <p className="text-[10px] text-slate-500">Receive OTP via SMS for login</p>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">ENABLED</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border border-slate-200">
              <div>
                <p className="text-sm font-medium text-slate-900">Google Authenticator</p>
                <p className="text-[10px] text-slate-500">Use an authenticator app for 2FA</p>
              </div>
              <Badge className="bg-slate-100 text-slate-600 text-[9px]">DISABLED</Badge>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Login Sessions</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-md">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">
                  🖥️
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-900">Current Session · Web Browser</p>
                  <p className="text-[10px] text-slate-500">Active now · {typeof window !== 'undefined' ? window.navigator.platform : ''}</p>
                </div>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">ACTIVE</Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full mt-3 text-red-600 border-red-200 hover:bg-red-50">
            Sign Out All Devices
          </Button>
        </Card>
      </div>
    </div>
  );
}

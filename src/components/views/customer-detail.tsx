'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  KYC_STATUS_BADGES,
  KYC_STATUS_LABELS,
  LOAN_STATUS_BADGES,
  LOAN_STATUS_LABELS,
  LOAN_STEP_LABELS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, User as UserIcon, Building2, Wallet, Mail, Phone, IdCard,
  MapPin, Home, Calendar, ShieldCheck, Loader2, AlertCircle,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';

export function CustomerDetailView() {
  const { viewParams, setView } = useAppStore();
  const userId = viewParams.userId as string;

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    (async () => {
      if (!userId) {
        setError('No customer ID provided.');
        setLoading(false);
        return;
      }
      try {
        const res = await authFetch(`/api/customers/${userId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to load customer');
        } else {
          setUser(data.user);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load customer');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="p-6 bg-slate-50 min-h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading customer…
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-6 bg-slate-50 min-h-full">
        <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card className="p-8 mt-4 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-900">
            {error || 'Customer not found'}
          </p>
        </Card>
      </div>
    );
  }

  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: string | Date | null) =>
    d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d: string | Date | null) =>
    d ? new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const loans: any[] = user.loans || [];
  const transactions: any[] = user.transactions || [];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setView('dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-bold text-slate-900 flex-1">Customer Profile</h1>
        {user.kycStatus && (
          <Badge className={cn('text-xs', KYC_STATUS_BADGES[user.kycStatus])}>
            KYC: {KYC_STATUS_LABELS[user.kycStatus] || user.kycStatus}
          </Badge>
        )}
      </div>

      {/* Customer header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            {/* Avatar */}
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white text-2xl font-bold">
              {initials || <UserIcon className="h-8 w-8" />}
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-lg font-bold text-slate-900">
                  {user.firstName} {user.lastName}
                </h2>
                {user.username && (
                  <span className="text-xs text-slate-500">@{user.username}</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                <InfoRow icon={IdCard} label="NUBAN" value={user.accountNumber || '—'} mono />
                <InfoRow icon={Mail} label="Email" value={user.email || '—'} />
                <InfoRow icon={Phone} label="Phone" value={user.phone || '—'} />
                <InfoRow icon={ShieldCheck} label="BVN" value={user.bvn ? `••••${user.bvn.slice(-4)}` : '—'} mono />
                <InfoRow icon={IdCard} label="NIN" value={user.nin ? `••••${user.nin.slice(-4)}` : '—'} mono />
                <InfoRow
                  icon={Calendar}
                  label="DOB"
                  value={user.dob ? fmtDate(user.dob) : '—'}
                />
                <InfoRow
                  icon={Building2}
                  label="Branch"
                  value={user.branch?.name || 'Unassigned'}
                />
                <InfoRow
                  icon={UserIcon}
                  label="Loan Officer"
                  value={
                    user.loanOfficer
                      ? `${user.loanOfficer.firstName} ${user.loanOfficer.lastName}`
                      : 'Unassigned'
                  }
                />
                <InfoRow
                  icon={Wallet}
                  label="Merchant ID"
                  value={user.merchantId || '—'}
                  mono
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Business info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-emerald-600" /> Business Information
            </CardTitle>
            <CardDescription>Trade / company profile linked to this customer</CardDescription>
          </CardHeader>
          <CardContent>
            {user.business ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={Building2} label="Business Name" value={user.business.name} />
                <InfoRow
                  icon={Wallet}
                  label="Legal Structure"
                  value={user.business.legalStructure || '—'}
                />
                <InfoRow
                  icon={ShieldCheck}
                  label="RC/BN Number"
                  value={user.business.rcBnNumber || '—'}
                  mono
                />
                <InfoRow
                  icon={Calendar}
                  label="Date Established"
                  value={user.business.dateEstablished ? fmtDate(user.business.dateEstablished) : '—'}
                />
                <InfoRow
                  icon={MapPin}
                  label="Shop Address"
                  value={user.business.shopAddress || '—'}
                  full
                />
                {user.business.yearsInOperation != null && (
                  <InfoRow
                    icon={Calendar}
                    label="Years in Operation"
                    value={user.business.yearsInOperation.toFixed(1)}
                  />
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No business profile linked.</p>
            )}
          </CardContent>
        </Card>

        {/* Residence */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-4 w-4 text-emerald-600" /> Residence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={MapPin} label="State" value={user.state || '—'} />
            <InfoRow icon={MapPin} label="LGA" value={user.lga || '—'} />
            <InfoRow icon={MapPin} label="Town" value={user.town || '—'} />
            <InfoRow
              icon={Home}
              label="Ownership"
              value={user.houseOwnership || '—'}
            />
            <InfoRow
              icon={Calendar}
              label="Years at Residence"
              value={user.yearsAtResidence != null ? String(user.yearsAtResidence) : '—'}
            />
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Address
              </p>
              <p className="text-sm text-slate-900">{user.address || '—'}</p>
              {user.nearestLandmark && (
                <p className="text-xs text-slate-500 mt-1">
                  Landmark: {user.nearestLandmark}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-emerald-600" /> Loan History
          </CardTitle>
          <CardDescription>
            {loans.length} loan application{loans.length === 1 ? '' : 's'} on file
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No loans yet</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setView('onboarding')}
              >
                Create Loan Application
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="px-2 py-2 font-semibold">Reference</th>
                    <th className="px-2 py-2 font-semibold">Amount</th>
                    <th className="px-2 py-2 font-semibold">Tenor</th>
                    <th className="px-2 py-2 font-semibold">Product</th>
                    <th className="px-2 py-2 font-semibold">Step</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setView('loan-detail', { loanId: loan.id })}
                    >
                      <td className="px-2 py-2 font-mono text-xs font-medium text-emerald-700">
                        {loan.applicationRef || '—'}
                      </td>
                      <td className="px-2 py-2 font-semibold text-slate-900">
                        {fmtNaira(loan.amount)}
                      </td>
                      <td className="px-2 py-2 text-slate-700">{loan.duration} mo</td>
                      <td className="px-2 py-2 text-slate-700">
                        {loan.plan?.name || '—'}
                      </td>
                      <td className="px-2 py-2">
                        <span className="text-xs text-slate-600">
                          {LOAN_STEP_LABELS[loan.currentStep] || loan.currentStep}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            LOAN_STATUS_BADGES[loan.status]
                          )}
                        >
                          {LOAN_STATUS_LABELS[loan.status] || loan.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">
                        {fmtDate(loan.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-emerald-600" /> Recent Transactions
          </CardTitle>
          <CardDescription>
            {transactions.length} transaction{transactions.length === 1 ? '' : 's'} on file
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-6 text-center">
              No transactions yet
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="px-2 py-2 font-semibold">Date</th>
                    <th className="px-2 py-2 font-semibold">Type</th>
                    <th className="px-2 py-2 font-semibold">Amount</th>
                    <th className="px-2 py-2 font-semibold">Reference</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-2 py-2 text-xs text-slate-500">
                        {fmtDateTime(t.createdAt)}
                      </td>
                      <td className="px-2 py-2 text-slate-700 capitalize">{t.type}</td>
                      <td className="px-2 py-2 font-semibold text-slate-900">
                        {fmtNaira(t.amount)}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-600">
                        {t.reference || '—'}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            t.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700'
                              : t.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          )}
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => setView('dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Button>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setView('onboarding')}
        >
          <UserIcon className="h-4 w-4 mr-1" /> New Customer
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoRow
// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  full,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-2', full && 'sm:col-span-2')}>
      <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
          {label}
        </p>
        <p
          className={cn(
            'text-sm text-slate-900 break-words',
            mono && 'font-mono'
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

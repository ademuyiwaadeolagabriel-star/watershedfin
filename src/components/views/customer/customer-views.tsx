'use client';

import { useAppStore } from '@/lib/store';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PiggyBank, TrendingUp, Plus, ArrowRight, Receipt, Gift, LifeBuoy, User, CheckCircle2, Bell, Mail, MessageSquare, Smartphone, Save, Loader2 } from 'lucide-react';
import { CustomerHeader } from './customer-loans';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

/* ------------------------------------------------------------------ */
/* Notification Preferences — used inside CustomerProfile              */
/* ------------------------------------------------------------------ */

type ChannelToggles = { email: boolean; sms: boolean; push: boolean };

type NotificationPreferences = {
  loan: ChannelToggles;
  payment: ChannelToggles;
  kyc: ChannelToggles;
  marketing: { email: boolean; sms: boolean; push: boolean };
  ticket: ChannelToggles;
  system: ChannelToggles;
};

const DEFAULT_PREFS: NotificationPreferences = {
  loan: { email: true, sms: true, push: true },
  payment: { email: true, sms: true, push: true },
  kyc: { email: true, sms: false, push: true },
  marketing: { email: true, sms: false, push: false },
  ticket: { email: true, sms: false, push: true },
  system: { email: true, sms: false, push: true },
};

const CATEGORY_META: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  channels: ('email' | 'sms' | 'push')[];
}[] = [
  { key: 'loan', label: 'Loan Updates', description: 'Approvals, rejections, disbursements, offer letters', channels: ['email', 'sms', 'push'] },
  { key: 'payment', label: 'Payment Reminders', description: 'Due dates, receipts, late-payment alerts', channels: ['email', 'sms', 'push'] },
  { key: 'kyc', label: 'KYC Updates', description: 'Verification status, BVN/CAC outcomes', channels: ['email', 'sms', 'push'] },
  { key: 'ticket', label: 'Support Tickets', description: 'Replies to your support requests', channels: ['email', 'sms', 'push'] },
  { key: 'system', label: 'System & Security', description: 'Login alerts, password changes, security notices', channels: ['email', 'sms', 'push'] },
  { key: 'marketing', label: 'Marketing & Offers', description: 'Promotions, new products, referral rewards', channels: ['email'] },
];

const CHANNEL_META: { key: 'email' | 'sms' | 'push'; label: string; icon: typeof Mail }[] = [
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'push', label: 'Push', icon: Smartphone },
];

function NotificationPreferencesCard({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/customer/notification-preferences?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.preferences) {
          setPrefs({ ...DEFAULT_PREFS, ...data.preferences });
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (category: keyof NotificationPreferences, channel: 'email' | 'sms' | 'push') => {
    setPrefs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: !prev[category][channel] },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch('/api/customer/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, preferences: prefs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save preferences');
      }
      toast({
        title: 'Preferences saved',
        description: 'Your notification preferences have been updated.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not save',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Notification Preferences</h3>
        </div>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={save}
          disabled={saving || loading}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Save changes
        </Button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Choose how you&apos;d like to be notified for each category. We&apos;ll always show in-app
        notifications regardless of these settings.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Loading preferences…
        </div>
      ) : (
        <div className="space-y-2">
          {CATEGORY_META.map((cat) => {
            const toggles = prefs[cat.key];
            return (
              <div
                key={cat.key}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 rounded-md border border-slate-200 hover:border-slate-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{cat.label}</p>
                  <p className="text-[11px] text-slate-500">{cat.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  {CHANNEL_META.map((ch) => {
                    const enabled = cat.channels.includes(ch.key);
                    const Icon = ch.icon;
                    const checked = (toggles as any)[ch.key] === true;
                    return (
                      <div key={ch.key} className="flex items-center gap-1.5">
                        <Label
                          htmlFor={`pref-${cat.key}-${ch.key}`}
                          className={cn(
                            'flex items-center gap-1 text-[11px] font-medium cursor-pointer',
                            enabled ? 'text-slate-700' : 'text-slate-300'
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          <span className="hidden sm:inline">{ch.label}</span>
                        </Label>
                        <Switch
                          id={`pref-${cat.key}-${ch.key}`}
                          checked={checked}
                          disabled={!enabled}
                          onCheckedChange={() => toggle(cat.key, ch.key)}
                          aria-label={`${ch.label} notifications for ${cat.label}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function CustomerSavings() {
  const { currentUser, setView } = useAppStore();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`).then(r => r.json()).then(setData).catch(() => {});
  }, [currentUser]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  const savings = data?.savings || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <CustomerHeader title="My Savings" user={currentUser} subtitle="Earn up to 12% p.a. on your savings" />
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border-0">
            <PiggyBank className="h-6 w-6 mb-2" />
            <p className="text-2xl font-bold">{fmtNaira(data?.stats?.totalSavingsBalance || 0)}</p>
            <p className="text-xs text-emerald-100">Total Savings Balance</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Active Plans</p>
            <p className="text-2xl font-bold text-slate-900">{savings.filter((s: any) => s.status === 'active').length}</p>
            <p className="text-[10px] text-slate-500">Across all savings types</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Interest Earned (YTD)</p>
            <p className="text-2xl font-bold text-emerald-600">{fmtNaira(0)}</p>
            <p className="text-[10px] text-slate-500">Accrued this year</p>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Savings Plans</h3>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1" /> Start Saving</Button>
          </div>
          {savings.length === 0 ? (
            <div className="text-center py-12">
              <PiggyBank className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">No savings plans yet</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700">Start Your First Savings Plan</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savings.map((s: any) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold capitalize text-slate-900">{s.planType} Savings</p>
                      <p className="text-[10px] text-slate-500 font-mono">{s.refId}</p>
                    </div>
                    <Badge className={s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                      {s.status}
                    </Badge>
                  </div>
                  <p className="text-xl font-bold text-slate-900">{fmtNaira(s.amount)}</p>
                  {s.interestRate && <p className="text-xs text-emerald-600">{s.interestRate}% p.a.</p>}
                </Card>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">Savings Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { name: 'Regular Savings', desc: 'Earn 8% p.a.', icon: PiggyBank },
              { name: 'Emergency Fund', desc: 'Earn 6% p.a. — instant access', icon: LifeBuoy },
              { name: 'Savings Circle', desc: 'Group savings with friends', icon: User },
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button key={opt.name} className="text-left p-4 rounded-md border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all">
                  <Icon className="h-6 w-6 text-emerald-600 mb-2" />
                  <p className="text-sm font-bold text-slate-900">{opt.name}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function CustomerInvestments() {
  const { currentUser } = useAppStore();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`).then(r => r.json()).then(setData).catch(() => {});
  }, [currentUser]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const investments = data?.investments || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <CustomerHeader title="My Investments" user={currentUser} subtitle="Treasury & fixed deposit investments" />
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4 bg-gradient-to-br from-purple-600 to-purple-800 text-white border-0">
            <TrendingUp className="h-6 w-6 mb-2" />
            <p className="text-2xl font-bold">{fmtNaira(data?.stats?.totalInvestmentValue || 0)}</p>
            <p className="text-xs text-purple-100">Portfolio Value</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Active Investments</p>
            <p className="text-2xl font-bold text-slate-900">{investments.filter((i: any) => i.status === 'active').length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500 mb-1">Accrued Interest</p>
            <p className="text-2xl font-bold text-emerald-600">{fmtNaira(investments.reduce((s: number, i: any) => s + (i.accruedInterest || 0), 0))}</p>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">Investment Portfolio</h3>
          {investments.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">No investments yet</p>
              <Button className="bg-purple-600 hover:bg-purple-700">Browse Investment Products</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {investments.map((inv: any) => (
                <div key={inv.id} className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">{inv.subscriptionCode}</p>
                    <p className="text-xs text-slate-500">{inv.product?.name || 'Fixed Deposit'} · {inv.tenorDays} days</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900">{fmtNaira(inv.principal)}</p>
                    <p className="text-xs text-emerald-600">+{fmtNaira(inv.accruedInterest)}</p>
                  </div>
                  <Badge className={inv.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}>{inv.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function CustomerTransactions() {
  const { currentUser } = useAppStore();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`).then(r => r.json()).then(setData).catch(() => {});
  }, [currentUser]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: Date | string) => d ? new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const transactions = data?.transactions || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <CustomerHeader title="Transaction History" user={currentUser} />
      <div className="max-w-5xl mx-auto space-y-4">
        <Card className="p-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">All Transactions</h3>
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No transactions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] uppercase text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((t: any) => {
                    const isCredit = ['deposit', 'loan_disbursement', 'interest'].includes(t.type);
                    return (
                      <tr key={t.id}>
                        <td className="px-3 py-2 text-xs">{fmtDate(t.createdAt)}</td>
                        <td className="px-3 py-2 text-xs capitalize">{t.type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-500">{t.reference || '—'}</td>
                        <td className={cn('px-3 py-2 text-right font-bold text-sm', isCredit ? 'text-emerald-600' : 'text-red-600')}>
                          {isCredit ? '+' : '-'}{fmtNaira(t.amount)}
                        </td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-[9px]">{t.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function CustomerProfile() {
  const { currentUser } = useAppStore();
  const u = currentUser;
  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <CustomerHeader title="My Profile" user={u} />
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white text-xl font-bold">
              {u?.firstName?.[0]}{u?.lastName?.[0]}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{u?.firstName} {u?.lastName}</h2>
              <p className="text-xs text-slate-500">{u?.email}</p>
              <Badge className={u?.kycStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 mt-1' : 'bg-amber-100 text-amber-700 mt-1'}>
                KYC: {u?.kycStatus || 'Pending'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-slate-500">Phone</p><p className="font-medium">{u?.phone || '—'}</p></div>
            <div><p className="text-xs text-slate-500">BVN</p><p className="font-mono font-medium">{u?.bvn || '—'}</p></div>
            <div><p className="text-xs text-slate-500">NIN</p><p className="font-mono font-medium">{u?.nin || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Account Number</p><p className="font-mono font-medium">{u?.accountNumber || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Branch</p><p className="font-medium">{u?.branch?.name || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Loan Officer</p><p className="font-medium">—</p></div>
            <div><p className="text-xs text-slate-500">Gender</p><p className="font-medium">{u?.gender || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Marital Status</p><p className="font-medium">{u?.maritalStatus || '—'}</p></div>
            <div className="col-span-2"><p className="text-xs text-slate-500">Address</p><p className="font-medium">{u?.address || '—'}</p></div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Business Information</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-slate-500">Business Name</p><p className="font-medium">{u?.business?.name || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Sector</p><p className="font-medium">{u?.business?.sector || '—'}</p></div>
            <div><p className="text-xs text-slate-500">Legal Structure</p><p className="font-medium">{u?.business?.legalStructure || '—'}</p></div>
            <div><p className="text-xs text-slate-500">RC/BN Number</p><p className="font-mono font-medium">{u?.business?.rcBnNumber || '—'}</p></div>
            <div className="col-span-2"><p className="text-xs text-slate-500">Business Address</p><p className="font-medium">{u?.business?.shopAddress || '—'}</p></div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Security & Settings</h3>
          <div className="space-y-2">
            <button className="flex items-center justify-between w-full p-3 rounded-md hover:bg-slate-50 text-left">
              <span className="text-sm">Change Password</span><ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <button className="flex items-center justify-between w-full p-3 rounded-md hover:bg-slate-50 text-left">
              <span className="text-sm">Transaction PIN</span><ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
            <button className="flex items-center justify-between w-full p-3 rounded-md hover:bg-slate-50 text-left">
              <span className="text-sm">Two-Factor Authentication</span><ArrowRight className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        </Card>

        {u?.id && <NotificationPreferencesCard userId={u.id} />}
      </div>
    </div>
  );
}

export function CustomerSupportStub() {
  // Deprecated stub — the real CustomerSupport view now lives in
  // '@/components/views/customer/customer-support'. This export is kept only
  // to avoid breaking any imports from older code; it should not be used.
  return null;
}

export function CustomerReferral() {
  const { currentUser } = useAppStore();
  const [copied, setCopied] = useState(false);
  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${currentUser?.merchantId || 'WATERSHED'}`;

  const copy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <CustomerHeader title="Referral Program" user={currentUser} />
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="p-6 bg-gradient-to-br from-purple-600 to-purple-800 text-white border-0">
          <Gift className="h-10 w-10 mb-3" />
          <h3 className="text-lg font-bold mb-1">Earn Investment Waivers</h3>
          <p className="text-sm text-purple-100 mb-4">Invite friends and earn fee waivers on your investments. For every friend who opens an account, you both get rewards!</p>
          <div className="bg-white/10 rounded-md p-3 backdrop-blur">
            <p className="text-xs text-purple-200 mb-1">Your Referral Link</p>
            <div className="flex gap-2">
              <input readOnly value={referralLink} className="flex-1 bg-white/20 rounded px-3 py-2 text-sm font-mono text-white outline-none" />
              <button onClick={copy} className="bg-white text-purple-700 px-4 py-2 rounded text-sm font-semibold">
                {copied ? <CheckCircle2 className="h-4 w-4" /> : 'Copy'}
              </button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{currentUser?.refWaivers || 0}</p>
            <p className="text-xs text-slate-500">Total Waivers</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">0</p>
            <p className="text-xs text-slate-500">Used</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{currentUser?.refWaivers || 0}</p>
            <p className="text-xs text-slate-500">Available</p>
          </Card>
        </div>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">How It Works</h3>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2"><span className="font-bold text-emerald-600">1.</span> Share your referral link with friends</li>
            <li className="flex gap-2"><span className="font-bold text-emerald-600">2.</span> They open an account with Watershed Finance</li>
            <li className="flex gap-2"><span className="font-bold text-emerald-600">3.</span> You both earn investment fee waivers</li>
            <li className="flex gap-2"><span className="font-bold text-emerald-600">4.</span> Use waivers on any future investment</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}

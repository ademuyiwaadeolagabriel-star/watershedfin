'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  TrendingUp, Coins, Wallet, Award, Search, FileText, RefreshCw, Plus,
} from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  matured: 'bg-amber-100 text-amber-700',
  liquidated: 'bg-slate-200 text-slate-700',
  rolled_over: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

export function TreasuryDashboard() {
  const { setView } = useAppStore();
  const [stats, setStats] = useState<any>(null);
  const [investments, setInvestments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [d, i] = await Promise.all([
        authFetch('/api/treasury/dashboard').then((r) => r.json()),
        authFetch('/api/treasury/investments?status=active').then((r) => r.json()),
      ]);
      setStats(d);
      setInvestments(i.investments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = investments.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.subscriptionCode?.toLowerCase().includes(q) ||
      `${inv.user?.firstName || ''} ${inv.user?.lastName || ''}`.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treasury Dashboard</h1>
          <p className="text-sm text-slate-500">Investment portfolio overview & performance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button onClick={() => setView('treasury-book')} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-1.5" /> Book Deal
          </Button>
        </div>
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard
          icon={Wallet}
          label="Active Principal Invested"
          value={fmtNaira(stats?.totalInvested || 0)}
          sub={`${stats?.activeCount || 0} active investments`}
          tint="emerald"
        />
        <HeroCard
          icon={TrendingUp}
          label="Interest Earned (Accrued)"
          value={fmtNaira(stats?.totalEarned || 0)}
          sub="Cumulative across portfolio"
          tint="amber"
        />
        <HeroCard
          icon={Award}
          label="Projected Maturity Value"
          value={fmtNaira(stats?.projectedValue || 0)}
          sub={`${stats?.maturedCount || 0} matured · ${stats?.assetCount || 0} bank assets`}
          tint="slate"
        />
      </div>

      {/* Portfolio table */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-slate-900">Active Portfolio</h3>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or investor..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subscription</TableHead>
                <TableHead>Investor</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Accrued</TableHead>
                <TableHead>Maturity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading portfolio…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">No active investments. Book a deal to get started.</TableCell></TableRow>
              ) : filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs font-medium">{inv.subscriptionCode}</TableCell>
                  <TableCell className="font-medium">
                    {inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : '—'}
                  </TableCell>
                  <TableCell className="text-right">{fmtNaira(inv.principal)}</TableCell>
                  <TableCell className="text-right">{inv.interestRate}%</TableCell>
                  <TableCell className="text-right text-emerald-700 font-medium">{fmtNaira(inv.accruedInterest)}</TableCell>
                  <TableCell>{fmtDate(inv.maturityDate)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGES[inv.status] || 'bg-slate-100 text-slate-700'}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setView('treasury-redemptions', { id: inv.id })}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickLink label="Investors" onClick={() => setView('treasury-investors')} />
        <QuickLink label="Products" onClick={() => setView('treasury-products')} />
        <QuickLink label="Redemptions" onClick={() => setView('treasury-redemptions')} />
        <QuickLink label="Bank Assets" onClick={() => setView('treasury-assets')} />
      </div>
    </div>
  );
}

function HeroCard({ icon: Icon, label, value, sub, tint }: any) {
  const tints: Record<string, string> = {
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
    slate: 'bg-slate-800',
  };
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full ${tints[tint]} opacity-10 -mr-8 -mt-8`} />
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={`p-2 rounded-lg ${tints[tint]} text-white`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{sub}</p>
    </Card>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} className="justify-start">
      <Coins className="h-4 w-4 mr-2" /> {label}
    </Button>
  );
}

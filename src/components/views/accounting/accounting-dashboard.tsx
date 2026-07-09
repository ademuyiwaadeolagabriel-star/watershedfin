'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Wallet, TrendingUp, TrendingDown, Banknote, ArrowRightLeft, Receipt,
  CreditCard, RefreshCw, ArrowRight,
} from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

export function AccountingDashboard() {
  const { setView } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/accounting/dashboard').then((r) => r.json());
      setData(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounting Dashboard</h1>
          <p className="text-sm text-slate-500">General ledger overview · financial position & operations</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KpiCard icon={Wallet} label="Total Assets" value={fmtNaira(data?.totalAssets || 0)} tint="slate" />
        <KpiCard icon={TrendingUp} label="Revenue (YTD)" value={fmtNaira(data?.totalRevenue || 0)} tint="emerald" />
        <KpiCard icon={TrendingDown} label="Expenses (YTD)" value={fmtNaira(data?.totalExpenses || 0)} tint="rose" />
        <KpiCard
          icon={Banknote}
          label="Net Income"
          value={fmtNaira(data?.netIncome || 0)}
          tint={(data?.netIncome || 0) >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AR summary */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" />
              <h3 className="font-semibold">Accounts Receivable</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView('accounting-ar')}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Outstanding" value={fmtNaira(data?.arSummary?.outstanding || 0)} />
            <Row label="Overdue" value={fmtNaira(data?.arSummary?.overdue || 0)} valueClass="text-rose-600" />
            <Row label="Open Invoices" value={data?.arSummary?.invoiceCount || 0} />
            <div className="pt-2 border-t">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Collection Rate</span>
                <Badge className="bg-emerald-100 text-emerald-700">{(data?.arSummary?.collectionRate || 0).toFixed(1)}%</Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* AP summary */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold">Accounts Payable</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView('accounting-ap')}>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Total Payable" value={fmtNaira(data?.apSummary?.payable || 0)} />
            <Row label="Overdue" value={fmtNaira(data?.apSummary?.overdue || 0)} valueClass="text-rose-600" />
            <Row label="Active Vendors" value={data?.apSummary?.vendorCount || 0} />
          </div>
        </Card>

        {/* Cash position */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRightLeft className="h-5 w-5 text-slate-700" />
            <h3 className="font-semibold">Cash Position</h3>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Cash on Hand" value={fmtNaira(data?.cashPosition?.cashOnHand || 0)} />
            <Row label="Bank Balance" value={fmtNaira(data?.cashPosition?.bankBalance || 0)} />
            <Row label="Tills Balance" value={fmtNaira(data?.cashPosition?.tillsBalance || 0)} />
            <div className="pt-2 border-t">
              <Row label="Total Liquidity" value={fmtNaira(data?.cashPosition?.total || 0)} labelClass="font-semibold" valueClass="font-bold text-emerald-700" />
            </div>
          </div>
        </Card>
      </div>

      {/* Recent journal entries */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent Journal Entries</h3>
          <Button size="sm" variant="outline" onClick={() => setView('accounting-journal')}>
            New Entry <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Posted By</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.recentJournals?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">No journal entries yet</TableCell></TableRow>
              ) : data.recentJournals.map((j: any) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.reference}</TableCell>
                  <TableCell className="text-xs">{fmtDate(j.date)}</TableCell>
                  <TableCell className="text-sm">{j.description}</TableCell>
                  <TableCell className="text-right">{fmtNaira(j.totalDebit)}</TableCell>
                  <TableCell className="text-xs">{j.createdBy || '—'}</TableCell>
                  <TableCell>
                    {j.isReversed
                      ? <Badge className="bg-rose-100 text-rose-700">Reversed</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700">Posted</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tint }: any) {
  const tints: Record<string, string> = {
    emerald: 'bg-emerald-600',
    rose: 'bg-rose-600',
    slate: 'bg-slate-800',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <div className={`p-1.5 rounded ${tints[tint]} text-white`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-lg lg:text-xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

function Row({ label, value, valueClass = '', labelClass = '' }: any) {
  return (
    <div className="flex justify-between">
      <span className={`text-slate-600 ${labelClass}`}>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

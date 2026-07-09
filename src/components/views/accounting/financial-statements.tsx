'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileDown, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const today = new Date().toISOString().slice(0, 10);
const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

export function FinancialStatements() {
  const [tab, setTab] = useState('balance_sheet');
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: tab });
      if (tab === 'balance_sheet' || tab === 'trial_balance') params.set('asOf', asOf);
      if (tab === 'profit_loss' || tab === 'cash_flow') {
        params.set('from', from);
        params.set('to', to);
      }
      const r = await authFetch(`/api/accounting/statements?${params.toString()}`).then((r) => r.json());
      setData(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab]);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financial Statements</h1>
          <p className="text-sm text-slate-500">Balance Sheet · P&L · Trial Balance · Cash Flow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><FileDown className="h-4 w-4 mr-1.5" /> PDF</Button>
          <Button variant="outline"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel</Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="balance_sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="profit_loss">P&L</TabsTrigger>
          <TabsTrigger value="trial_balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="cash_flow">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="balance_sheet">
          <DateRow label="As of" date={asOf} setDate={setAsOf} onRun={load} />
          <Card className="p-4 mt-3">
            <BalanceSheetView data={data} loading={loading} />
          </Card>
        </TabsContent>
        <TabsContent value="profit_loss">
          <DateRangeRow from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={load} />
          <Card className="p-4 mt-3">
            <ProfitLossView data={data} loading={loading} />
          </Card>
        </TabsContent>
        <TabsContent value="trial_balance">
          <DateRow label="As of" date={asOf} setDate={setAsOf} onRun={load} />
          <Card className="p-4 mt-3">
            <TrialBalanceView data={data} loading={loading} />
          </Card>
        </TabsContent>
        <TabsContent value="cash_flow">
          <DateRangeRow from={from} to={to} setFrom={setFrom} setTo={setTo} onRun={load} />
          <Card className="p-4 mt-3">
            <CashFlowView data={data} loading={loading} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DateRow({ label, date, setDate, onRun }: any) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label className="text-xs">{label}</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>
      <Button onClick={onRun} className="bg-emerald-600 hover:bg-emerald-700">Run</Button>
    </div>
  );
}
function DateRangeRow({ from, to, setFrom, setTo, onRun }: any) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <Label className="text-xs">From</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
      </div>
      <div>
        <Label className="text-xs">To</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>
      <Button onClick={onRun} className="bg-emerald-600 hover:bg-emerald-700">Run</Button>
    </div>
  );
}

function BalanceSheetView({ data, loading }: any) {
  if (loading) return <p className="text-center text-slate-400 py-8">Loading…</p>;
  if (!data) return null;
  const section = (title: string, rows: any[]) => (
    <div>
      <p className="font-semibold text-slate-900 mb-2 pb-1 border-b">{title}</p>
      <Table>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell className="text-slate-400 text-sm">No accounts</TableCell></TableRow>
          ) : rows.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono text-xs text-slate-500">{a.code}</TableCell>
              <TableCell>{a.name}</TableCell>
              <TableCell className="text-right">{fmtNaira(a.balance)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-slate-50 font-semibold">
            <TableCell colSpan={2}>Total {title}</TableCell>
            <TableCell className="text-right">{fmtNaira(rows.reduce((s: number, a: any) => s + a.balance, 0))}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
  return (
    <div className="space-y-4">
      {section('Assets', data.groups?.asset || [])}
      {section('Liabilities', data.groups?.liability || [])}
      {section('Equity', data.groups?.equity || [])}
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 text-white">
        <span className="font-semibold">Balance Check: Assets = L + E</span>
        <Badge className={data.balanced ? 'bg-emerald-500' : 'bg-rose-500'}>
          {data.balanced ? 'Balanced' : 'Out of balance'}
        </Badge>
      </div>
    </div>
  );
}

function ProfitLossView({ data, loading }: any) {
  if (loading) return <p className="text-center text-slate-400 py-8">Loading…</p>;
  if (!data) return null;
  const rows = (items: any[], positive: boolean) => (
    <Table>
      <TableBody>
        {items.length === 0 ? (
          <TableRow><TableCell className="text-slate-400 text-sm">No accounts</TableCell></TableRow>
        ) : items.map((r: any) => (
          <TableRow key={r.code}>
            <TableCell className="font-mono text-xs text-slate-500">{r.code}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right">{fmtNaira(r.amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-slate-50 font-semibold">
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className={`text-right ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
            {fmtNaira(items.reduce((s: number, r: any) => s + r.amount, 0))}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-slate-900 mb-2 pb-1 border-b">Revenue</p>
        {rows(data.revenue || [], true)}
      </div>
      <div>
        <p className="font-semibold text-slate-900 mb-2 pb-1 border-b">Expenses</p>
        {rows(data.expenses || [], false)}
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 text-white">
        <span className="font-semibold">Net Income</span>
        <span className="text-xl font-bold">{fmtNaira(data.netIncome || 0)}</span>
      </div>
    </div>
  );
}

function TrialBalanceView({ data, loading }: any) {
  if (loading) return <p className="text-center text-slate-400 py-8">Loading…</p>;
  if (!data) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data.rows || []).map((r: any) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.code}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-xs"><Badge variant="outline">{r.type}</Badge></TableCell>
            <TableCell className="text-right">{r.debit ? fmtNaira(r.debit) : ''}</TableCell>
            <TableCell className="text-right">{r.credit ? fmtNaira(r.credit) : ''}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-slate-900 text-white font-semibold">
          <TableCell colSpan={3}>Totals</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalDebit || 0)}</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalCredit || 0)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function CashFlowView({ data, loading }: any) {
  if (loading) return <p className="text-center text-slate-400 py-8">Loading…</p>;
  if (!data) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Opening</TableHead>
          <TableHead className="text-right">Inflow</TableHead>
          <TableHead className="text-right">Outflow</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Closing</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(data.rows || []).map((r: any) => (
          <TableRow key={r.code}>
            <TableCell className="font-mono text-xs">{r.code}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right text-xs">{fmtNaira(r.opening)}</TableCell>
            <TableCell className="text-right text-emerald-700">{fmtNaira(r.inflow)}</TableCell>
            <TableCell className="text-right text-rose-700">{fmtNaira(r.outflow)}</TableCell>
            <TableCell className="text-right font-medium">{fmtNaira(r.net)}</TableCell>
            <TableCell className="text-right font-semibold">{fmtNaira(r.closing)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-slate-900 text-white font-semibold">
          <TableCell colSpan={3}>Net Cash Movement</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalInflow || 0)}</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalOutflow || 0)}</TableCell>
          <TableCell className="text-right" colSpan={2}>{fmtNaira(data.netCash || 0)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

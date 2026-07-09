'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { FileDown, FileSpreadsheet, RefreshCw, BarChart3 } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const REPORT_TYPES = [
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'profit_loss', label: 'Profit & Loss' },
  { value: 'trial_balance', label: 'Trial Balance' },
  { value: 'cash_flow', label: 'Cash Flow Statement' },
  { value: 'ar_aging', label: 'AR Aging' },
  { value: 'ap_aging', label: 'AP Aging' },
];

const today = new Date().toISOString().slice(0, 10);
const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

export function ReportingHub() {
  const { currentAdmin } = useAppStore() as any;
  const [reportType, setReportType] = useState('balance_sheet');
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [branchScope, setBranchScope] = useState('all');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const isSuper = currentAdmin?.role === 'super';

  const load = async () => {
    setLoading(true);
    try {
      if (['balance_sheet', 'profit_loss', 'trial_balance', 'cash_flow'].includes(reportType)) {
        const params = new URLSearchParams({ type: reportType });
        if (reportType === 'balance_sheet' || reportType === 'trial_balance') params.set('asOf', asOf);
        if (reportType === 'profit_loss' || reportType === 'cash_flow') { params.set('from', from); params.set('to', to); }
        const r = await authFetch(`/api/accounting/statements?${params.toString()}`).then((r) => r.json());
        setData(r);
      } else if (reportType === 'ar_aging') {
        const r = await authFetch('/api/accounting/invoices').then((r) => r.json());
        setData({ invoices: (r.invoices || []).filter((i: any) => i.status !== 'paid' && i.status !== 'void') });
      } else if (reportType === 'ap_aging') {
        const r = await authFetch('/api/accounting/bills').then((r) => r.json());
        setData({ bills: (r.bills || []).filter((b: any) => b.status !== 'paid') });
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [reportType]);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reporting Hub</h1>
        <p className="text-sm text-slate-500">Generate financial & operational reports across the bank</p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(reportType === 'balance_sheet' || reportType === 'trial_balance') && (
            <div>
              <Label className="text-xs">As of</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
          )}
          {(reportType === 'profit_loss' || reportType === 'cash_flow') && (
            <>
              <div>
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {isSuper && (
            <div>
              <Label className="text-xs">Branch Scope (Super)</Label>
              <Select value={branchScope} onValueChange={setBranchScope}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="hq">Head Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={load} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Run
            </Button>
          </div>
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button variant="outline" size="sm"><FileDown className="h-4 w-4 mr-1.5" /> Export PDF</Button>
          <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> Export Excel</Button>
        </div>
      </Card>

      {/* Results */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-slate-600" />
          <h3 className="font-semibold">{REPORT_TYPES.find((r) => r.value === reportType)?.label}</h3>
        </div>
        <div className="max-h-[34rem] overflow-y-auto">
          {loading ? (
            <p className="text-center text-slate-400 py-8">Loading report…</p>
          ) : reportType === 'balance_sheet' ? (
            <BalanceTable data={data} />
          ) : reportType === 'profit_loss' ? (
            <PLTable data={data} />
          ) : reportType === 'trial_balance' ? (
            <TBTable data={data} />
          ) : reportType === 'cash_flow' ? (
            <CFTable data={data} />
          ) : reportType === 'ar_aging' ? (
            <AgingTable rows={(data?.invoices || []).map((i: any) => ({ id: i.id, ref: i.invoiceNumber, party: i.user ? `${i.user.firstName} ${i.user.lastName}` : 'Walk-in', due: i.dueDate, balance: i.totalAmount - i.totalPaid, status: i.status }))} type="Invoice" />
          ) : reportType === 'ap_aging' ? (
            <AgingTable rows={(data?.bills || []).map((b: any) => ({ id: b.id, ref: b.billNumber, party: b.vendor?.name || '—', due: b.dueDate, balance: b.totalAmount - b.totalPaid, status: b.status }))} type="Bill" />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function BalanceTable({ data }: any) {
  if (!data) return null;
  const render = (title: string, rows: any[]) => (
    <div className="mb-4">
      <p className="font-semibold text-slate-900 mb-1 pb-1 border-b">{title}</p>
      <Table>
        <TableBody>
          {rows.map((a: any) => (
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
  return <div>{render('Assets', data.groups?.asset || [])}{render('Liabilities', data.groups?.liability || [])}{render('Equity', data.groups?.equity || [])}</div>;
}

function PLTable({ data }: any) {
  if (!data) return null;
  return (
    <Table>
      <TableBody>
        {(data.revenue || []).map((r: any) => (
          <TableRow key={r.code}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-right text-emerald-700">{fmtNaira(r.amount)}</TableCell></TableRow>
        ))}
        <TableRow className="bg-slate-50 font-semibold"><TableCell colSpan={2}>Total Revenue</TableCell><TableCell className="text-right">{fmtNaira(data.totalRevenue || 0)}</TableCell></TableRow>
        {(data.expenses || []).map((r: any) => (
          <TableRow key={r.code}><TableCell className="font-mono text-xs">{r.code}</TableCell><TableCell>{r.name}</TableCell><TableCell className="text-right text-rose-700">{fmtNaira(r.amount)}</TableCell></TableRow>
        ))}
        <TableRow className="bg-slate-50 font-semibold"><TableCell colSpan={2}>Total Expenses</TableCell><TableCell className="text-right">{fmtNaira(data.totalExpenses || 0)}</TableCell></TableRow>
        <TableRow className="bg-slate-900 text-white font-bold"><TableCell colSpan={2}>Net Income</TableCell><TableCell className="text-right">{fmtNaira(data.netIncome || 0)}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

function TBTable({ data }: any) {
  if (!data) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {(data.rows || []).map((r: any) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.code}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right">{r.debit ? fmtNaira(r.debit) : ''}</TableCell>
            <TableCell className="text-right">{r.credit ? fmtNaira(r.credit) : ''}</TableCell>
          </TableRow>
        ))}
        <TableRow className="bg-slate-900 text-white font-semibold">
          <TableCell colSpan={2}>Totals</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalDebit || 0)}</TableCell>
          <TableCell className="text-right">{fmtNaira(data.totalCredit || 0)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function CFTable({ data }: any) {
  if (!data) return null;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Account</TableHead><TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Inflow</TableHead><TableHead className="text-right">Outflow</TableHead><TableHead className="text-right">Closing</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {(data.rows || []).map((r: any) => (
          <TableRow key={r.code}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right text-xs">{fmtNaira(r.opening)}</TableCell>
            <TableCell className="text-right text-emerald-700">{fmtNaira(r.inflow)}</TableCell>
            <TableCell className="text-right text-rose-700">{fmtNaira(r.outflow)}</TableCell>
            <TableCell className="text-right font-semibold">{fmtNaira(r.closing)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AgingTable({ rows, type }: any) {
  const bucket = (due: string) => {
    const days = Math.floor((Date.now() - new Date(due).getTime()) / 86400000);
    if (days < 0) return 'Current';
    if (days <= 30) return '1–30';
    if (days <= 60) return '31–60';
    if (days <= 90) return '61–90';
    return '90+';
  };
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>{type} #</TableHead><TableHead>Party</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Aging</TableHead><TableHead>Status</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">No records</TableCell></TableRow>
        ) : rows.map((r: any) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">{r.ref}</TableCell>
            <TableCell>{r.party}</TableCell>
            <TableCell className="text-xs">{fmtDate(r.due)}</TableCell>
            <TableCell className="text-right font-medium">{fmtNaira(r.balance)}</TableCell>
            <TableCell><Badge variant="outline">{bucket(r.due)}</Badge></TableCell>
            <TableCell><Badge className="bg-slate-100 text-slate-700">{r.status}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

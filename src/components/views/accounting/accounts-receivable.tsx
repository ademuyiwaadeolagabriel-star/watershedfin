'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Banknote, TrendingUp } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
};

function agingBucket(dueDate: string, status: string): string {
  if (status === 'paid') return 'paid';
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (days < 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const AGING_LABELS: Record<string, string> = {
  current: 'Current',
  '1-30': '1–30 days',
  '31-60': '31–60 days',
  '61-90': '61–90 days',
  '90+': '90+ days',
  paid: 'Paid',
};

export function AccountsReceivable() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('transfer');
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/accounting/invoices').then((r) => r.json());
      setInvoices(r.invoices || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const recordPayment = async () => {
    if (!payOpen || !payAmount) return;
    setWorking(true);
    try {
      const r = await authFetch(`/api/accounting/invoices/${payOpen.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, paymentMethod: payMethod }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setPayOpen(null);
      setPayAmount(0);
      load();
    } catch (e: any) { alert(e.message); } finally { setWorking(false); }
  };

  const open = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void');
  const totalOutstanding = open.reduce((s, i) => s + (i.totalAmount - i.totalPaid), 0);
  const totalOverdue = open.filter((i) => new Date(i.dueDate) < new Date()).reduce((s, i) => s + (i.totalAmount - i.totalPaid), 0);
  const totalCollected = invoices.reduce((s, i) => s + i.totalPaid, 0);

  const aging: Record<string, number> = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const inv of open) {
    const b = agingBucket(inv.dueDate, inv.status);
    if (aging[b] !== undefined) aging[b] += inv.totalAmount - inv.totalPaid;
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounts Receivable</h1>
        <p className="text-sm text-slate-500">Outstanding invoices · aging analysis · collections</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Outstanding</p><p className="text-lg font-bold text-amber-700">{fmtNaira(totalOutstanding)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Overdue</p><p className="text-lg font-bold text-rose-700">{fmtNaira(totalOverdue)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Collected</p><p className="text-lg font-bold text-emerald-700">{fmtNaira(totalCollected)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Open Invoices</p><p className="text-lg font-bold">{open.length}</p></Card>
      </div>

      {/* Aging report */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-slate-600" />
          <h3 className="font-semibold">Aging Report</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(aging).map(([k, v]) => (
            <div key={k} className={`p-3 rounded-lg border ${k === '90+' ? 'border-rose-200 bg-rose-50' : k === 'current' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs text-slate-500">{AGING_LABELS[k]}</p>
              <p className={`text-base font-bold ${k === '90+' ? 'text-rose-700' : k === 'current' ? 'text-emerald-700' : 'text-slate-900'}`}>{fmtNaira(v)}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Invoice table */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Open Invoices</h3>
        <div className="max-h-[34rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : open.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">No open invoices 🎉</TableCell></TableRow>
              ) : open.map((inv) => {
                const bucket = agingBucket(inv.dueDate, inv.status);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                    <TableCell className="text-sm">{inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : (inv.description || 'Walk-in')}</TableCell>
                    <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-right">{fmtNaira(inv.totalAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtNaira(inv.totalAmount - inv.totalPaid)}</TableCell>
                    <TableCell><Badge variant="outline">{AGING_LABELS[bucket]}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_BADGES[inv.status]}>{inv.status}</Badge></TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => { setPayOpen(inv); setPayAmount(inv.totalAmount - inv.totalPaid); }}>
                        <Banknote className="h-3.5 w-3.5 mr-1" /> Collect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{payOpen?.invoiceNumber} · Balance: {fmtNaira(payOpen ? payOpen.totalAmount - payOpen.totalPaid : 0)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (₦)</Label><Input type="number" value={payAmount || ''} onChange={(e) => setPayAmount(Number(e.target.value))} /></div>
            <div>
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={recordPayment} disabled={working} className="bg-emerald-600 hover:bg-emerald-700">
              {working ? 'Recording…' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import { Plus, Trash2, FileText, Banknote } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';

const STATUS_BADGES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-rose-100 text-rose-700',
  written_off: 'bg-slate-200 text-slate-600',
  void: 'bg-slate-200 text-slate-500',
};

export function InvoiceManagement() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [form, setForm] = useState({
    userId: '', date: new Date().toISOString().slice(0, 10),
    dueDate: '', taxRate: 7.5, notes: '',
  });
  const [lines, setLines] = useState([{ description: '', amount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('transfer');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/accounting/invoices').then((r) => r.json());
      setInvoices(r.invoices || []);
    } finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    fetch('/api/treasury/investors?mode=search&q=a').then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(() => {});
  }, []);

  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const tax = (subtotal * (Number(form.taxRate) || 0)) / 100;
  const total = subtotal + tax;

  const submit = async () => {
    if (!form.dueDate) return alert('Due date required');
    if (lines.every((l) => !l.amount)) return alert('Add at least one line item');
    setSaving(true);
    try {
      const r = await fetch('/api/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lineItems: lines }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      setForm({ userId: '', date: new Date().toISOString().slice(0, 10), dueDate: '', taxRate: 7.5, notes: '' });
      setLines([{ description: '', amount: 0 }]);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const recordPayment = async () => {
    if (!payOpen || !payAmount) return;
    setPaying(true);
    try {
      const r = await fetch(`/api/accounting/invoices/${payOpen.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: payAmount, paymentMethod: payMethod }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setPayOpen(null);
      setPayAmount(0);
      load();
    } catch (e: any) { alert(e.message); } finally { setPaying(false); }
  };

  const totalOutstanding = invoices.reduce((s, i) => s + (i.totalAmount - i.totalPaid), 0);
  const totalPaid = invoices.reduce((s, i) => s + i.totalPaid, 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue' || (i.status !== 'paid' && new Date(i.dueDate) < new Date())).length;

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoice Management</h1>
          <p className="text-sm text-slate-500">Accounts Receivable · create invoices & record payments</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Invoice
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Invoiced</p><p className="text-lg font-bold">{fmtNaira(invoices.reduce((s, i) => s + i.totalAmount, 0))}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Outstanding</p><p className="text-lg font-bold text-amber-700">{fmtNaira(totalOutstanding)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Collected</p><p className="text-lg font-bold text-emerald-700">{fmtNaira(totalPaid)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Overdue</p><p className="text-lg font-bold text-rose-700">{overdueCount}</p></Card>
      </div>

      <Card className="p-4">
        <div className="max-h-[34rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : invoices.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8"><FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />No invoices yet</TableCell></TableRow>
              ) : invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-sm">{inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : (inv.description || 'Walk-in')}</TableCell>
                  <TableCell className="text-xs">{fmtDate(inv.date)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                  <TableCell className="text-right">{fmtNaira(inv.totalAmount)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{fmtNaira(inv.totalPaid)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtNaira(inv.totalAmount - inv.totalPaid)}</TableCell>
                  <TableCell><Badge className={STATUS_BADGES[inv.status] || 'bg-slate-100'}>{inv.status}</Badge></TableCell>
                  <TableCell>
                    {inv.status !== 'paid' && inv.status !== 'void' && (
                      <Button size="sm" variant="outline" onClick={() => { setPayOpen(inv); setPayAmount(inv.totalAmount - inv.totalPaid); }}>
                        <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* New invoice dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>Create an invoice with line items.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Customer (optional)</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Walk-in customer" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <Label>Tax Rate (%)</Label>
              <Input type="number" step="0.1" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} />
            </div>
          </div>
          <div className="border rounded-lg">
            <div className="p-2 bg-slate-50 text-xs font-semibold flex justify-between">
              <span>Line Items</span>
              <Button size="sm" variant="ghost" onClick={() => setLines([...lines, { description: '', amount: 0 }])}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 p-2 border-t">
                <Input placeholder="Description" value={l.description} onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="flex-1" />
                <Input type="number" placeholder="Amount" value={l.amount || ''} onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, amount: Number(e.target.value) } : x))} className="w-32" />
                {lines.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            ))}
            <div className="p-2 border-t bg-slate-50 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span>{fmtNaira(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Tax ({form.taxRate}%)</span><span>{fmtNaira(tax)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span className="text-emerald-700">{fmtNaira(total)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Creating…' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{payOpen?.invoiceNumber} · Balance: {fmtNaira(payOpen ? payOpen.totalAmount - payOpen.totalPaid : 0)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" value={payAmount || ''} onChange={(e) => setPayAmount(Number(e.target.value))} />
            </div>
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
            <Button onClick={recordPayment} disabled={paying} className="bg-emerald-600 hover:bg-emerald-700">
              {paying ? 'Recording…' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

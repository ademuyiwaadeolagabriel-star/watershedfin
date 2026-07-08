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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Check, X, Receipt } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';

const CATEGORIES = ['Office', 'Travel', 'Utilities', 'Maintenance', 'Professional', 'Entertainment', 'Other'];

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
};

export function ExpenseManagement() {
  const { currentAdmin } = useAppStore() as any;
  const [expenses, setExpenses] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '', amount: 0, expenseAccountId: '',
    paymentAccountId: '', category: 'Office', receiptNumber: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [e, a] = await Promise.all([
        fetch('/api/accounting/expenses').then((r) => r.json()),
        fetch('/api/accounting/coa').then((r) => r.json()),
      ]);
      setExpenses(e.expenses || []);
      setAccounts((a.accounts || []).filter((x: any) => x.type === 'expense' || x.type === 'asset'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.description || !form.amount || !form.expenseAccountId) return alert('Fill required fields');
    setSaving(true);
    try {
      const r = await fetch('/api/accounting/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), createdById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      setForm({ date: new Date().toISOString().slice(0, 10), description: '', amount: 0, expenseAccountId: '', paymentAccountId: '', category: 'Office', receiptNumber: '', notes: '' });
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const act = async (id: string, action: 'approve' | 'reject') => {
    try {
      const r = await fetch(`/api/accounting/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, approvedById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      load();
    } catch (e: any) { alert(e.message); }
  };

  const now = new Date();
  const thisMonth = expenses.filter((e) => new Date(e.date).getMonth() === now.getMonth() && new Date(e.date).getFullYear() === now.getFullYear());
  const pending = expenses.filter((e) => e.status === 'pending');
  const approved = expenses.filter((e) => e.status === 'approved' || e.status === 'paid');
  const ytd = expenses.filter((e) => new Date(e.date).getFullYear() === now.getFullYear());

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Expense Management</h1>
          <p className="text-sm text-slate-500">Submit, approve & pay operational expenses</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Expense
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">This Month</p><p className="text-lg font-bold">{fmtNaira(thisMonth.reduce((s, e) => s + e.amount, 0))}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Pending</p><p className="text-lg font-bold text-amber-700">{pending.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Approved/Paid</p><p className="text-lg font-bold text-emerald-700">{approved.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">YTD Total</p><p className="text-lg font-bold">{fmtNaira(ytd.reduce((s, e) => s + e.amount, 0))}</p></Card>
      </div>

      <Card className="p-4">
        <div className="max-h-[34rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : expenses.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8"><Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />No expenses yet</TableCell></TableRow>
              ) : expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{fmtDate(e.date)}</TableCell>
                  <TableCell className="text-sm">{e.description}</TableCell>
                  <TableCell><Badge variant="outline">{e.category || '—'}</Badge></TableCell>
                  <TableCell className="text-xs">{e.expenseAccount?.code} · {e.expenseAccount?.name}</TableCell>
                  <TableCell className="text-right font-medium">{fmtNaira(e.amount)}</TableCell>
                  <TableCell><Badge className={STATUS_BADGES[e.status]}>{e.status}</Badge></TableCell>
                  <TableCell>
                    {e.status === 'pending' && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="text-emerald-700" onClick={() => act(e.id, 'approve')}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-rose-600" onClick={() => act(e.id, 'reject')}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Receipt #</Label>
              <Input value={form.receiptNumber} onChange={(e) => setForm({ ...form, receiptNumber: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Expense Account</Label>
              <Select value={form.expenseAccountId} onValueChange={(v) => setForm({ ...form, expenseAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select expense account" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.type === 'expense').map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Payment Account (optional)</Label>
              <Select value={form.paymentAccountId} onValueChange={(v) => setForm({ ...form, paymentAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Cash/Bank account" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.type === 'asset' && (a.subType === 'cash' || a.subType === 'bank')).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Submit Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

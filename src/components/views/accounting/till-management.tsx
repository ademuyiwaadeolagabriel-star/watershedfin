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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, RefreshCw } from 'lucide-react';
import { fmtNaira, fmtDateTime } from '@/lib/format';

const empty = { name: '', code: '', location: '', glAccountId: '', balanceLimit: 0, openingBalance: 0, assignedUserId: '', status: 'active' };

export function TillManagement() {
  const [tills, setTills] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([
        fetch('/api/accounting/tills').then((r) => r.json()),
        fetch('/api/accounting/coa').then((r) => r.json()),
      ]);
      setTills(t.tills || []);
      setAccounts((a.accounts || []).filter((x: any) => x.type === 'asset'));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name, code: t.code, location: t.location || '',
      glAccountId: t.glAccountId, balanceLimit: t.balanceLimit || 0,
      openingBalance: t.openingBalance || 0, assignedUserId: t.assignedUserId || '',
      status: t.status, currentBalance: t.currentBalance,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name || !form.code || !form.glAccountId) return alert('Name, code, GL account required');
    setSaving(true);
    try {
      const url = editing ? `/api/accounting/tills/${editing.id}` : '/api/accounting/tills';
      const method = editing ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const reconcile = (t: any) => alert(`Reconcile till ${t.code} — current balance ${fmtNaira(t.currentBalance)}. Open till-transaction ledger to match.`);

  const totalBalance = tills.reduce((s, t) => s + t.currentBalance, 0);
  const activeCount = tills.filter((t) => t.status === 'active').length;

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Till Management</h1>
          <p className="text-sm text-slate-500">Cash drawers · GL linkage · limits & assignments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1.5" /> New Till</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Tills</p><p className="text-lg font-bold">{tills.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Active</p><p className="text-lg font-bold text-emerald-700">{activeCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Balance</p><p className="text-lg font-bold">{fmtNaira(totalBalance)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Inactive</p><p className="text-lg font-bold text-slate-500">{tills.length - activeCount}</p></Card>
      </div>

      <Card className="p-4">
        <div className="max-h-[34rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>GL Account</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : tills.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">No tills configured</TableCell></TableRow>
              ) : tills.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-xs">{t.location || '—'}</TableCell>
                  <TableCell className="text-xs">{t.glAccount?.code} · {t.glAccount?.name}</TableCell>
                  <TableCell className="text-right text-xs">{fmtNaira(t.openingBalance)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtNaira(t.currentBalance)}</TableCell>
                  <TableCell className="text-right text-xs">{t.balanceLimit ? fmtNaira(t.balanceLimit) : '—'}</TableCell>
                  <TableCell className="text-xs">{t.lastActivity ? fmtDateTime(t.lastActivity) : '—'}</TableCell>
                  <TableCell><Badge className={t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{t.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => reconcile(t)}>Reconcile</Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Till' : 'New Till'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!editing} />
            </div>
            <div>
              <Label>Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} />
            </div>
            <div className="col-span-2">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>GL Account</Label>
              <Select value={form.glAccountId} onValueChange={(v) => setForm({ ...form, glAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Opening Balance (₦)</Label>
              <Input type="number" value={form.openingBalance || ''} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} disabled={!!editing} />
            </div>
            <div>
              <Label>Balance Limit (₦)</Label>
              <Input type="number" value={form.balanceLimit || ''} onChange={(e) => setForm({ ...form, balanceLimit: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned User ID (optional)</Label>
              <Input value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })} placeholder="Admin ID" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Save Till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

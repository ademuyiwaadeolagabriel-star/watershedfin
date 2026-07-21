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
import { Plus, Trash2, Save, Undo2, CheckCircle2, XCircle } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

interface LineItem { accountId: string; debit: number; credit: number; }

export function JournalEntryManager() {
  const { currentAdmin } = useAppStore() as any;
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, e] = await Promise.all([
        authFetch('/api/accounting/coa').then((r) => r.json()),
        authFetch('/api/accounting/journal?take=20').then((r) => r.json()),
      ]);
      setAccounts(a.accounts || []);
      setEntries(e.entries || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0);
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const addRow = () => setItems([...items, { accountId: '', debit: 0, credit: 0 }]);
  const removeRow = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!description) return alert('Description required');
    if (items.length < 2) return alert('At least 2 line items required');
    if (!balanced) return alert('Entry is unbalanced');
    setSaving(true);
    try {
      const r = await authFetch('/api/accounting/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, description, reference: reference || undefined,
          items: items.filter((i) => i.accountId),
          createdById: currentAdmin?.id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setDescription(''); setReference('');
      setItems([{ accountId: '', debit: 0, credit: 0 }, { accountId: '', debit: 0, credit: 0 }]);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const reverse = async (id: string) => {
    const reason = prompt('Reversal reason:');
    if (!reason) return;
    try {
      const r = await authFetch(`/api/accounting/journal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, createdById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Journal Entries</h1>
        <p className="text-sm text-slate-500">Post double-entry transactions · all debits must equal credits</p>
      </div>

      {/* Entry form */}
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Monthly rent payment" />
          </div>
          <div className="md:col-span-3">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Auto-generated if blank" />
          </div>
        </div>

        {/* Line items */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">Account</TableHead>
                <TableHead className="text-right">Debit (₦)</TableHead>
                <TableHead className="text-right">Credit (₦)</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Select value={it.accountId} onValueChange={(v) => updateItem(idx, 'accountId', v)}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={it.debit || ''} onChange={(e) => updateItem(idx, 'debit', Number(e.target.value))} className="text-right" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={it.credit || ''} onChange={(e) => updateItem(idx, 'credit', Number(e.target.value))} className="text-right" />
                  </TableCell>
                  <TableCell>
                    {items.length > 2 && (
                      <Button size="sm" variant="ghost" onClick={() => removeRow(idx)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <Button variant="outline" onClick={addRow} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Line
          </Button>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-slate-500">Debit: </span>
              <span className="font-semibold">{fmtNaira(totalDebit)}</span>
              <span className="text-slate-500 ml-3">Credit: </span>
              <span className="font-semibold">{fmtNaira(totalCredit)}</span>
            </div>
            <Badge className={balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>
              {balanced ? <><CheckCircle2 className="h-3 w-3 mr-1" /> Balanced</> : <><XCircle className="h-3 w-3 mr-1" /> Unbalanced</>}
            </Badge>
            <Button onClick={submit} disabled={saving || !balanced} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Posting…' : 'Post Entry'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Recent entries */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Recent Entries</h3>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">Loading…</TableCell></TableRow>
              ) : entries.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">No journal entries yet</TableCell></TableRow>
              ) : entries.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-mono text-xs">{j.reference}</TableCell>
                  <TableCell className="text-xs">{fmtDate(j.date)}</TableCell>
                  <TableCell className="text-sm">{j.description}</TableCell>
                  <TableCell className="text-right">{fmtNaira(j.items.reduce((s: number, i: any) => s + i.debit, 0))}</TableCell>
                  <TableCell>
                    {j.isReversed
                      ? <Badge className="bg-rose-100 text-rose-700">Reversed</Badge>
                      : <Badge className="bg-emerald-100 text-emerald-700">Posted</Badge>}
                  </TableCell>
                  <TableCell>
                    {!j.isReversed && (
                      <Button size="sm" variant="ghost" onClick={() => reverse(j.id)}>
                        <Undo2 className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
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

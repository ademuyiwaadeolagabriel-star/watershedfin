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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, Plus, Trash2, Save } from 'lucide-react';
import { fmtNaira } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const SUB_TYPES: Record<string, string[]> = {
  asset: ['cash', 'bank', 'current_asset', 'fixed_asset', 'accounts_receivable', 'other_asset'],
  liability: ['current_liability', 'long_term_liability', 'accounts_payable', 'tax_payable'],
  equity: ['capital', 'retained_earnings', 'reserves'],
  revenue: ['interest_income', 'fee_income', 'operating_income', 'other_income'],
  expense: ['interest_expense', 'salary_expense', 'operating_expense', 'admin_expense'],
};

const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-emerald-100 text-emerald-700',
  liability: 'bg-rose-100 text-rose-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-blue-100 text-blue-700',
  expense: 'bg-amber-100 text-amber-700',
};

export function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    code: '', name: '', type: 'asset', subType: '', openingBalance: 0, parentId: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/accounting/coa').then((r) => r.json());
      setAccounts(r.accounts || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.code || !form.name) return alert('Code and name required');
    setSaving(true);
    try {
      const r = await authFetch('/api/accounting/coa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setForm({ code: '', name: '', type: 'asset', subType: '', openingBalance: 0, parentId: '' });
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (a: any) => {
    if (!confirm(`Delete account ${a.code}?`)) return;
    try {
      const r = await authFetch(`/api/accounting/coa/${a.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      load();
    } catch (e: any) { alert(e.message); }
  };

  const filtered = accounts.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q);
  });

  const totalsByType = TYPES.map((t) => ({
    ...t,
    total: accounts.filter((a) => a.type === t.value).reduce((s, a) => s + a.balance, 0),
    count: accounts.filter((a) => a.type === t.value).length,
  }));

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Chart of Accounts</h1>
        <p className="text-sm text-slate-500">Double-entry general ledger · account master & balances</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="p-5 space-y-3 lg:col-span-1">
          <h3 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-600" /> New Account</h3>
          <div>
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 1010" />
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cash on Hand" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, subType: '' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sub-Type</Label>
            <Select value={form.subType} onValueChange={(v) => setForm({ ...form, subType: v })}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {(SUB_TYPES[form.type] || []).map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opening Balance (₦)</Label>
            <Input type="number" value={form.openingBalance || ''} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Parent Account (optional)</Label>
            <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
            <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Saving…' : 'Create Account'}
          </Button>
        </Card>

        {/* Accounts list */}
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Accounts ({accounts.length})</h3>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or name..." className="pl-9" />
            </div>
          </div>

          {/* Totals strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3 text-xs">
            {totalsByType.map((t) => (
              <div key={t.value} className="p-2 rounded bg-slate-50 border">
                <p className="text-slate-500">{t.label}</p>
                <p className="font-semibold text-slate-900">{fmtNaira(t.total)}</p>
                <p className="text-slate-400">{t.count} acct{t.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sub-Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">No accounts found</TableCell></TableRow>
                ) : filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs font-medium">{a.code}</TableCell>
                    <TableCell className="font-medium">{a.name}{a.isSystem && <span className="ml-1 text-xs text-slate-400">(system)</span>}</TableCell>
                    <TableCell><Badge className={TYPE_COLORS[a.type]}>{a.type}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-500">{a.subType?.replace('_', ' ') || '—'}</TableCell>
                    <TableCell className={`text-right font-medium ${a.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{fmtNaira(a.balance)}</TableCell>
                    <TableCell>
                      {!a.isSystem && a._count?.journalItems === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
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
    </div>
  );
}

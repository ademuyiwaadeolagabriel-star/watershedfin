'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

export function BankReconciliation() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/accounting/bank-reconciliation?accountId=${accountId === 'all' ? '' : accountId}`).then((r) => r.json());
      setAccounts(r.accounts || []);
      setTransactions(r.transactions || []);
      setSelected(new Set());
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [accountId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reconcile = async () => {
    if (selected.size === 0) return alert('Select transactions to reconcile');
    setWorking(true);
    try {
      const r = await authFetch('/api/accounting/bank-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: Array.from(selected) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      alert(`Reconciled ${d.reconciled} transaction(s)`);
      load();
    } catch (e: any) { alert(e.message); } finally { setWorking(false); }
  };

  const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
  const diff = totalDebit - totalCredit;

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Reconciliation</h1>
          <p className="text-sm text-slate-500">Match bank statement transactions against ledger entries</p>
        </div>
        <div className="flex gap-2">
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All bank accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bank Accounts</SelectItem>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Statement Debits</p>
          <p className="text-xl font-bold text-slate-900">{fmtNaira(totalDebit)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Statement Credits</p>
          <p className="text-xl font-bold text-slate-900">{fmtNaira(totalCredit)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 uppercase">Difference</p>
          <p className={`text-xl font-bold ${Math.abs(diff) < 1 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtNaira(diff)}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Unreconciled Transactions ({transactions.length})</h3>
          <Button onClick={reconcile} disabled={working || selected.size === 0} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Reconcile Selected ({selected.size})
          </Button>
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : transactions.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">All transactions reconciled 🎉</TableCell></TableRow>
              ) : transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                  <TableCell className="text-xs">{t.account?.code} · {t.account?.name}</TableCell>
                  <TableCell className="text-sm">{t.description || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{t.reference || '—'}</TableCell>
                  <TableCell className="text-right">{t.debit ? fmtNaira(t.debit) : ''}</TableCell>
                  <TableCell className="text-right">{t.credit ? fmtNaira(t.credit) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

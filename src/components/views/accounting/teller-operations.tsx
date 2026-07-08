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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, Banknote, Plus,
} from 'lucide-react';
import { fmtNaira, fmtDateTime } from '@/lib/format';

export function TellerOperations() {
  const { currentAdmin } = useAppStore() as any;
  const [tills, setTills] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'deposit' | 'withdrawal' | 'transfer' | 'drop'>(null);
  const [form, setForm] = useState({ tillId: '', amount: 0, description: '', customerId: '' });
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/accounting/tills').then((r) => r.json());
      setTills(r.tills || []);
      // recent transactions: gather from all tills — fetch each till's txns is heavy; instead use journal? 
      // We'll display till balances + a placeholder recent list from the first till.
      if (r.tills?.length) {
        // Show last activities via till.lastActivity
      }
      setTransactions([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeTill = tills.find((t) => t.assignedUserId === currentAdmin?.id) || tills[0];
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const submit = async () => {
    if (!form.tillId || !form.amount) return alert('Select till & enter amount');
    setWorking(true);
    try {
      const endpoint = modal === 'withdrawal' ? 'withdrawal' : 'deposit';
      const r = await fetch(`/api/accounting/teller/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount), createdById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setModal(null);
      setForm({ tillId: '', amount: 0, description: '', customerId: '' });
      load();
    } catch (e: any) { alert(e.message); } finally { setWorking(false); }
  };

  const openModal = (type: typeof modal) => {
    setForm({ tillId: activeTill?.id || '', amount: 0, description: '', customerId: '' });
    setModal(type);
  };

  const totalBalance = tills.reduce((s, t) => s + t.currentBalance, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Teller Operations</h1>
        <p className="text-sm text-slate-500">Frontline cash transactions · deposits, withdrawals, transfers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-emerald-600" /><p className="text-xs text-slate-500">Till Balance</p></div>
          <p className="text-lg font-bold">{fmtNaira(activeTill?.currentBalance || 0)}</p>
          <p className="text-xs text-slate-400">{activeTill?.name || 'No till assigned'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowDownCircle className="h-4 w-4 text-emerald-600" /><p className="text-xs text-slate-500">Total Tills</p></div>
          <p className="text-lg font-bold">{fmtNaira(totalBalance)}</p>
          <p className="text-xs text-slate-400">{tills.length} active</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Banknote className="h-4 w-4 text-slate-600" /><p className="text-xs text-slate-500">My Till Limit</p></div>
          <p className="text-lg font-bold">{activeTill?.balanceLimit ? fmtNaira(activeTill.balanceLimit) : 'Unlimited'}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowUpCircle className="h-4 w-4 text-rose-600" /><p className="text-xs text-slate-500">Last Activity</p></div>
          <p className="text-sm font-medium">{activeTill?.lastActivity ? fmtDateTime(activeTill.lastActivity) : '—'}</p>
        </Card>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActionButton icon={ArrowDownCircle} label="Deposit" tint="emerald" onClick={() => openModal('deposit')} />
        <ActionButton icon={ArrowUpCircle} label="Withdrawal" tint="rose" onClick={() => openModal('withdrawal')} />
        <ActionButton icon={ArrowRightLeft} label="Transfer" tint="amber" onClick={() => openModal('transfer')} />
        <ActionButton icon={Plus} label="Cash Drop" tint="slate" onClick={() => openModal('drop')} />
      </div>

      {/* Tills list */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Tills</h3>
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>GL Account</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">Loading…</TableCell></TableRow>
              ) : tills.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">No tills configured</TableCell></TableRow>
              ) : tills.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-xs">{t.glAccount?.code} · {t.glAccount?.name}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtNaira(t.currentBalance)}</TableCell>
                  <TableCell className="text-right">{t.balanceLimit ? fmtNaira(t.balanceLimit) : '—'}</TableCell>
                  <TableCell><Badge className={t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{t.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Action modal */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {modal === 'drop' ? 'Cash Drop' : modal} Transaction
            </DialogTitle>
            <DialogDescription>
              {modal === 'withdrawal' ? 'Pay out cash from the till.' : modal === 'drop' ? 'Add cash to the till (cash drop).' : 'Record a cash transaction.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Till</Label>
              <Select value={form.tillId} onValueChange={(v) => setForm({ ...form, tillId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tills.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.code} · {t.name} ({fmtNaira(t.currentBalance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (₦)</Label>
              <Input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Customer ID (optional)</Label>
              <Input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} placeholder="Customer reference" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Narration" />
            </div>
            {modal === 'transfer' && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                Note: Transfers are recorded as deposits in the destination till. Use withdrawals on the source till separately.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(null)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={working}
              className={`bg-emerald-600 hover:bg-emerald-700 ${modal === 'withdrawal' ? '!bg-rose-600 hover:!bg-rose-700' : ''}`}
            >
              {working ? 'Processing…' : `Confirm ${modal === 'drop' ? 'Cash Drop' : modal}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionButton({ icon: Icon, label, tint, onClick }: any) {
  const tints: Record<string, string> = {
    emerald: 'border-emerald-200 hover:bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 hover:bg-rose-50 text-rose-700',
    amber: 'border-amber-200 hover:bg-amber-50 text-amber-700',
    slate: 'border-slate-200 hover:bg-slate-100 text-slate-700',
  };
  return (
    <Button variant="outline" className={`h-20 flex-col gap-1 ${tints[tint]}`} onClick={onClick}>
      <Icon className="h-6 w-6" />
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}

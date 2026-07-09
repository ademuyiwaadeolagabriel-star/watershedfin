'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { RefreshCw, Banknote, Repeat, HandCoins, Search } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'matured', label: 'Matured (Due)' },
  { value: 'liquidated', label: 'Paid Out' },
  { value: 'rolled_over', label: 'Rolled Over' },
];

export function RedemptionManager() {
  const { viewParams } = useAppStore();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<{ inv: any; type: 'liquidate' | 'payout' | 'rollover' } | null>(null);
  const [working, setWorking] = useState(false);
  const [rolloverTenor, setRolloverTenor] = useState(90);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/treasury/investments?status=${status === 'all' ? 'all' : status}`).then((r) => r.json());
      setItems(r.investments || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [status]);

  // If navigated with viewParams.id, fetch that investment detail
  useEffect(() => {
    if (viewParams.id) {
      setStatus('all');
    }
  }, [viewParams.id]);

  const filtered = items.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return inv.subscriptionCode?.toLowerCase().includes(q) ||
      `${inv.user?.firstName || ''} ${inv.user?.lastName || ''}`.toLowerCase().includes(q);
  });

  const doAction = async () => {
    if (!action) return;
    setWorking(true);
    try {
      const body: any = { action: action.type === 'liquidate' || action.type === 'payout' ? 'redeem' : 'rollover' };
      if (action.type === 'rollover') body.tenorDays = rolloverTenor;
      const r = await authFetch(`/api/treasury/investments/${action.inv.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      alert(action.type === 'rollover' ? `Rolled over to ${d.investment?.subscriptionCode}` : `Payout processed: ${fmtNaira(d.payout?.net || 0)}`);
      setAction(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setWorking(false); }
  };

  const computePayout = (inv: any) => {
    const penalty = inv.status === 'active' ? (inv.accruedInterest * (inv.product?.earlyLiquidationPenalty || 0)) / 100 : 0;
    return {
      principal: inv.principal,
      accrued: inv.accruedInterest,
      penalty,
      wht: inv.whtDeducted,
      net: inv.principal + inv.accruedInterest - penalty - inv.whtDeducted,
    };
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Redemption Manager</h1>
          <p className="text-sm text-slate-500">Process liquidations, payouts & rollovers</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full md:w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search subscription or investor..." className="pl-9" />
          </div>
        </div>

        <div className="max-h-[34rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subscription</TableHead>
                <TableHead>Investor</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Accrued</TableHead>
                <TableHead>Maturity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No investments found</TableCell></TableRow>
              ) : filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.subscriptionCode}</TableCell>
                  <TableCell className="font-medium">{inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : '—'}</TableCell>
                  <TableCell className="text-right">{fmtNaira(inv.principal)}</TableCell>
                  <TableCell className="text-right text-emerald-700">{fmtNaira(inv.accruedInterest)}</TableCell>
                  <TableCell className="text-xs">{fmtDate(inv.maturityDate)}</TableCell>
                  <TableCell>
                    <Badge className={
                      inv.status === 'matured' ? 'bg-amber-100 text-amber-700' :
                      inv.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      inv.status === 'liquidated' ? 'bg-slate-200 text-slate-700' :
                      'bg-purple-100 text-purple-700'
                    }>{inv.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {inv.status === 'active' || inv.status === 'matured' ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setAction({ inv, type: 'liquidate' })}>
                          <HandCoins className="h-3.5 w-3.5 mr-1" /> Liquidate
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAction({ inv, type: 'payout' })}>
                          <Banknote className="h-3.5 w-3.5 mr-1" /> Payout
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setAction({ inv, type: 'rollover' })}>
                          <Repeat className="h-3.5 w-3.5 mr-1" /> Rollover
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No actions</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Confirm modal */}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action?.type === 'liquidate' && 'Confirm Liquidation'}
              {action?.type === 'payout' && 'Confirm Payout'}
              {action?.type === 'rollover' && 'Confirm Rollover'}
            </DialogTitle>
            <DialogDescription>
              {action?.inv?.subscriptionCode} · {action?.inv?.user ? `${action.inv.user.firstName} ${action.inv.user.lastName}` : ''}
            </DialogDescription>
          </DialogHeader>
          {action && (() => {
            const p = computePayout(action.inv);
            return action.type === 'rollover' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">A new investment will be created rolling over principal + accrued interest.</p>
                <div>
                  <label className="text-sm font-medium">New Tenor (days)</label>
                  <Input type="number" value={rolloverTenor} onChange={(e) => setRolloverTenor(Number(e.target.value))} />
                </div>
                <div className="p-3 rounded-lg bg-slate-50 text-sm space-y-1">
                  <div className="flex justify-between"><span>New Principal:</span><span className="font-medium">{fmtNaira(action.inv.principal + action.inv.accruedInterest)}</span></div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Principal</span><span className="font-medium">{fmtNaira(p.principal)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">+ Accrued Interest</span><span className="font-medium text-emerald-700">{fmtNaira(p.accrued)}</span></div>
                {p.penalty > 0 && (
                  <div className="flex justify-between"><span className="text-slate-600">- Early Liquidation Penalty</span><span className="font-medium text-red-600">-{fmtNaira(p.penalty)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-600">- WHT</span><span className="font-medium text-red-600">-{fmtNaira(p.wht)}</span></div>
                <div className="border-t pt-2 flex justify-between text-base">
                  <span className="font-semibold">Net Payout</span>
                  <span className="font-bold text-emerald-700">{fmtNaira(p.net)}</span>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button onClick={doAction} disabled={working} className="bg-emerald-600 hover:bg-emerald-700">
              {working ? 'Processing…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

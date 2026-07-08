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
import { Plus, Landmark } from 'lucide-react';
import { fmtNaira, fmtDate, addDays } from '@/lib/format';

const ASSET_CLASSES = [
  { value: 't_bill', label: 'Treasury Bill' },
  { value: 'bond', label: 'Government Bond' },
  { value: 'placement', label: 'Placement / Deposit' },
  { value: 'cash', label: 'Cash Equivalent' },
];

const empty = {
  assetName: '', assetClass: 't_bill', faceValue: 0, purchasePrice: 0,
  tenorDays: 91, yieldRate: 0, custodian: '', purchaseDate: new Date().toISOString().slice(0, 10),
};

export function BankAssetManager() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/treasury/assets').then((r) => r.json());
      setAssets(r.assets || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Auto-calc yield preview
  const previewYield = (() => {
    const fv = Number(form.faceValue) || 0;
    const pp = Number(form.purchasePrice) || 0;
    const t = Number(form.tenorDays) || 0;
    if (pp > 0 && t > 0) return ((fv - pp) / pp) * (365 / t) * 100;
    return 0;
  })();

  const submit = async () => {
    if (!form.assetName || !form.faceValue || !form.purchasePrice) return alert('Fill required fields');
    setSaving(true);
    try {
      const r = await fetch('/api/treasury/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      setForm(empty);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const totalValue = assets.filter((a) => a.status === 'active').reduce((s, a) => s + a.purchasePrice + a.accruedIncome, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Asset Manager</h1>
          <p className="text-sm text-slate-500">Treasury bills, bonds, placements · Total active value: <span className="font-semibold text-emerald-700">{fmtNaira(totalValue)}</span></p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> Book Asset
        </Button>
      </div>

      <Card className="p-4">
        <div className="max-h-[36rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Face Value</TableHead>
                <TableHead className="text-right">Purchase Price</TableHead>
                <TableHead className="text-right">Yield</TableHead>
                <TableHead className="text-right">Accrued</TableHead>
                <TableHead>Maturity</TableHead>
                <TableHead>Custodian</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : assets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-400 py-8">
                    <Landmark className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No bank assets booked yet.
                  </TableCell>
                </TableRow>
              ) : assets.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.assetName}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{a.assetClass.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-right">{fmtNaira(a.faceValue)}</TableCell>
                  <TableCell className="text-right">{fmtNaira(a.purchasePrice)}</TableCell>
                  <TableCell className="text-right font-medium">{a.yieldRate.toFixed(2)}%</TableCell>
                  <TableCell className="text-right text-emerald-700">{fmtNaira(a.accruedIncome)}</TableCell>
                  <TableCell className="text-xs">{a.maturityDate ? fmtDate(a.maturityDate) : '—'}</TableCell>
                  <TableCell className="text-xs">{a.custodian || '—'}</TableCell>
                  <TableCell><Badge className={a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Book Treasury Asset</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Asset Name</Label>
              <Input value={form.assetName} onChange={(e) => setForm({ ...form, assetName: e.target.value })} placeholder="e.g. FGN 91-Day T-Bill" />
            </div>
            <div>
              <Label>Asset Class</Label>
              <Select value={form.assetClass} onValueChange={(v) => setForm({ ...form, assetClass: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CLASSES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custodian</Label>
              <Input value={form.custodian} onChange={(e) => setForm({ ...form, custodian: e.target.value })} placeholder="e.g. CBN / Stanbic" />
            </div>
            <div>
              <Label>Face Value (₦)</Label>
              <Input type="number" value={form.faceValue || ''} onChange={(e) => setForm({ ...form, faceValue: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Purchase Price (₦)</Label>
              <Input type="number" value={form.purchasePrice || ''} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Tenor (days)</Label>
              <Input type="number" value={form.tenorDays || ''} onChange={(e) => setForm({ ...form, tenorDays: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
            </div>
            <div className="col-span-2 p-2 rounded bg-slate-50 text-sm flex justify-between items-center">
              <span className="text-slate-600">Auto-calculated Yield (leave rate empty to use)</span>
              <span className="font-semibold text-emerald-700">{previewYield.toFixed(2)}% p.a.</span>
            </div>
            <div className="col-span-2">
              <Label>Yield Rate Override (% p.a.) — leave 0 to auto-calc</Label>
              <Input type="number" step="0.01" value={form.yieldRate || ''} onChange={(e) => setForm({ ...form, yieldRate: Number(e.target.value) })} />
            </div>
            <div className="col-span-2 text-xs text-slate-500">
              Maturity: {fmtDate(addDays(form.purchaseDate, Number(form.tenorDays) || 0))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Book Asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

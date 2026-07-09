'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Package } from 'lucide-react';
import { fmtNaira } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

const empty = {
  name: '', description: '', minAmount: 0, maxAmount: 0,
  interestRatePa: 0, minTenorDays: 30, maxTenorDays: 365,
  whtRate: 10, earlyLiquidationPenalty: 20, isActive: true,
};

export function ProductManager() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch('/api/treasury/products').then((r) => r.json());
      setProducts(r.products || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ ...p, maxAmount: p.maxAmount || 0 }); setOpen(true); };

  const save = async () => {
    if (!form.name) return alert('Name required');
    setSaving(true);
    try {
      const url = editing ? `/api/treasury/products/${editing.id}` : '/api/treasury/products';
      const method = editing ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const remove = async (p: any) => {
    if (!confirm(`Delete product "${p.name}"?`)) return;
    try {
      const r = await authFetch(`/api/treasury/products/${p.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treasury Products</h1>
          <p className="text-sm text-slate-500">Manage investment product offerings, rates & limits</p>
        </div>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Product
        </Button>
      </div>

      <Card className="p-4">
        <div className="max-h-[36rem] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rate p.a.</TableHead>
                <TableHead className="text-right">Min / Max</TableHead>
                <TableHead className="text-right">Tenor (days)</TableHead>
                <TableHead className="text-right">WHT</TableHead>
                <TableHead className="text-right">Penalty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    No products yet. Create one to start booking deals.
                  </TableCell>
                </TableRow>
              ) : products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{p.description}</p>
                  </TableCell>
                  <TableCell className="text-right font-medium">{p.interestRatePa}%</TableCell>
                  <TableCell className="text-right text-xs">
                    {fmtNaira(p.minAmount)}<br />{p.maxAmount ? fmtNaira(p.maxAmount) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-xs">{p.minTenorDays} – {p.maxTenorDays}</TableCell>
                  <TableCell className="text-right">{p.whtRate}%</TableCell>
                  <TableCell className="text-right">{p.earlyLiquidationPenalty}%</TableCell>
                  <TableCell>
                    <Badge className={p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Treasury Product'}</DialogTitle>
            <DialogDescription>Configure the terms for this investment offering.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="col-span-2">
              <Label>Product Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 90-Day Fixed Deposit" />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Interest Rate (% p.a.)</Label>
              <Input type="number" step="0.1" value={form.interestRatePa} onChange={(e) => setForm({ ...form, interestRatePa: Number(e.target.value) })} />
            </div>
            <div>
              <Label>WHT Rate (%)</Label>
              <Input type="number" step="0.1" value={form.whtRate} onChange={(e) => setForm({ ...form, whtRate: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Min Amount (₦)</Label>
              <Input type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Max Amount (₦)</Label>
              <Input type="number" value={form.maxAmount} onChange={(e) => setForm({ ...form, maxAmount: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Min Tenor (days)</Label>
              <Input type="number" value={form.minTenorDays} onChange={(e) => setForm({ ...form, minTenorDays: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Max Tenor (days)</Label>
              <Input type="number" value={form.maxTenorDays} onChange={(e) => setForm({ ...form, maxTenorDays: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Early Liquidation Penalty (%)</Label>
              <Input type="number" step="0.1" value={form.earlyLiquidationPenalty} onChange={(e) => setForm({ ...form, earlyLiquidationPenalty: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label className="text-sm">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Save Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

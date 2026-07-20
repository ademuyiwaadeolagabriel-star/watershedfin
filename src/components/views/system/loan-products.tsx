'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Package, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';

const empty = {
  name: '', slug: '', description: '', duration: 12, interest: 0,
  min: '', max: '', type: 'loan', status: 1, minCreditScore: 50, maxDebtServiceRatio: 33,
};

export function LoanProductsView() {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(empty);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/loan-products');
      const d = await res.json();
      setProducts(d.products || []);
    } catch (e) {
      console.error('Loan products load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name || !form.slug) return;
    const payload = {
      ...form,
      min: form.min === '' ? null : Number(form.min),
      max: form.max === '' ? null : Number(form.max),
      duration: Number(form.duration),
      interest: Number(form.interest),
    };
    try {
      if (editingId) {
        await authFetch(`/api/loan-products/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await authFetch('/api/loan-products', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setOpen(false);
      setForm(empty);
      setEditingId(null);
      load();
    } catch (e) {
      console.error('Save product error', e);
    }
  };

  const edit = (p: any) => {
    setForm({
      name: p.name, slug: p.slug, description: p.description || '',
      duration: p.duration, interest: p.interest,
      min: p.min ?? '', max: p.max ?? '',
      type: p.type || 'loan', status: p.status,
      minCreditScore: p.minCreditScore, maxDebtServiceRatio: p.maxDebtServiceRatio,
    });
    setEditingId(p.id);
    setOpen(true);
  };

  const remove = async (p: any) => {
    if (!confirm(`Delete product "${p.name}"?`)) return;
    await authFetch(`/api/loan-products/${p.id}`, { method: 'DELETE' });
    load();
  };

  const fmtNaira = (n: number | null) => n != null ? '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 }) : '—';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600" /> Loan Products
            </h2>
            <p className="text-xs text-slate-500">Configure loan plans, tenors, interest rates, and CAM thresholds.</p>
          </div>
          <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> New Product
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Slug</th>
                <th className="px-3 py-2 font-semibold">Duration</th>
                <th className="px-3 py-2 font-semibold">Interest</th>
                <th className="px-3 py-2 font-semibold">Min / Max</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">Loading products...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center">
                  <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No loan products configured.</p>
                </td></tr>
              ) : products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{p.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{p.slug}</td>
                  <td className="px-3 py-2 text-xs">{p.duration} mo</td>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-900">{p.interest}%</td>
                  <td className="px-3 py-2 text-[10px] text-slate-600">{fmtNaira(p.min)} – {fmtNaira(p.max)}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{p.type || '—'}</Badge></td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                      p.status === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    )}>{p.status === 1 ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => edit(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" title="Delete" onClick={() => remove(p)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Loan Product' : 'Create Loan Product'}</DialogTitle>
            <DialogDescription>Configure tenor, pricing, and CAM thresholds.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Slug *</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} className="font-mono" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Duration (months)</Label>
              <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
            </div>
            <div>
              <Label>Interest (% p.a.)</Label>
              <Input type="number" step="0.1" value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
            </div>
            <div>
              <Label>Min Amount (₦)</Label>
              <Input type="number" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Max Amount (₦)</Label>
              <Input type="number" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} placeholder="∞" />
            </div>
            <div>
              <Label>Type</Label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="loan">Loan</option>
                <option value="bnpl">BNPL</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value={1}>Active</option>
                <option value={0}>Inactive</option>
              </select>
            </div>
            <div>
              <Label>Min Credit Score</Label>
              <Input type="number" value={form.minCreditScore} onChange={(e) => setForm({ ...form, minCreditScore: e.target.value })} />
            </div>
            <div>
              <Label>Max DSR (%)</Label>
              <Input type="number" value={form.maxDebtServiceRatio} onChange={(e) => setForm({ ...form, maxDebtServiceRatio: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

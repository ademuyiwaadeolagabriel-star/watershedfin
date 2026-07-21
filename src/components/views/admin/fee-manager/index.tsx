'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DollarSign, Plus, RefreshCw, Edit3, Trash2, AlertTriangle, Loader2, CheckCircle2,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Fee {
  id: string;
  key: string;
  value: string;
  type: string;
  label: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export function FeeManagerView() {
  const { toast } = useToast();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<Fee | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ key: '', label: '', amount: 0, active: true });

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/fees');
      if (res.ok) {
        const d = await res.json();
        setFees(d.fees || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingFee(null);
    setForm({ key: '', label: '', amount: 0, active: true });
    setDialogOpen(true);
  };

  const openEdit = (f: Fee) => {
    setEditingFee(f);
    setForm({ key: f.key, label: f.label, amount: Number(f.value) || 0, active: f.active });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.key || !form.label) {
      toast({ title: 'Validation error', description: 'Key and Label are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const url = editingFee ? `/api/admin/fees/${editingFee.id}` : '/api/admin/fees';
      const method = editingFee ? 'PATCH' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: form.key.trim().toLowerCase().replace(/\s+/g, '_'),
          label: form.label,
          amount: Number(form.amount),
          active: form.active,
        }),
      });
      if (res.ok) {
        toast({ title: editingFee ? 'Fee updated' : 'Fee created', description: `${form.label} = ₦${form.amount.toLocaleString()}` });
        setDialogOpen(false);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Save failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (f: Fee) => {
    try {
      await authFetch(`/api/admin/fees/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !f.active }),
      });
      await load();
    } catch (e) { console.error(e); }
  };

  const remove = async (f: Fee) => {
    if (!confirm(`Deactivate fee "${f.label}"? It will no longer be charged to new customers.`)) return;
    try {
      await authFetch(`/api/admin/fees/${f.id}`, { method: 'DELETE' });
      toast({ title: 'Fee deactivated', description: f.label });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" /> Fee Manager
            </h2>
            <p className="text-xs text-slate-500">
              Dynamic fees for CAC search, onboarding, account maintenance, etc. Changes take effect immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Fee
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Fees</p>
          <p className="text-2xl font-bold text-slate-900">{fees.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Active</p>
          <p className="text-2xl font-bold text-emerald-700">{fees.filter(f => f.active).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Inactive</p>
          <p className="text-2xl font-bold text-slate-500">{fees.filter(f => !f.active).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">CAC Search Fee</p>
          <p className="text-2xl font-bold text-amber-700">
            ₦{Number(fees.find(f => f.key === 'fee_cac_search')?.value || 0).toLocaleString()}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Fees</CardTitle>
          <CardDescription>Edit amounts, toggle active status, or deactivate fees.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Loading fees…</p>
            </div>
          ) : fees.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No fees configured yet.</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Fee" to create your first fee (e.g. fee_cac_search).</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="text-right">Amount (₦)</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((f) => (
                  <TableRow key={f.id} className={cn(!f.active && 'opacity-50')}>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell><code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{f.key}</code></TableCell>
                    <TableCell className="text-right font-mono font-semibold">₦{Number(f.value).toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={f.active} onCheckedChange={() => toggleActive(f)} />
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(f.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(f)} className="text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFee ? 'Edit Fee' : 'Create Fee'}</DialogTitle>
            <DialogDescription>
              {editingFee ? `Editing ${editingFee.label}` : 'Add a new dynamic fee. Changes take effect immediately.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Fee Key (snake_case)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="e.g. fee_cac_search"
                className="mt-1 font-mono text-xs"
                disabled={!!editingFee}
              />
            </div>
            <div>
              <Label className="text-xs">Display Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. CAC Name Search Fee"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Amount (₦)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                placeholder="e.g. 5000"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <Label className="text-xs">Active (charge to new customers)</Label>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              {editingFee ? 'Save Changes' : 'Create Fee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

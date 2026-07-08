'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Layers, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const empty = { name: '', riskScore: 0.5, riskScoreInt: 3, benchmarkedMargin: 18 };

function riskColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-100 text-emerald-700';
  if (score >= 0.5) return 'bg-amber-100 text-amber-700';
  if (score >= 0.3) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function riskLabel(score: number): string {
  if (score >= 0.7) return 'Low Risk';
  if (score >= 0.5) return 'Moderate';
  if (score >= 0.3) return 'Elevated';
  return 'High Risk';
}

export function SectorsView() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(empty);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sectors');
      const d = await res.json();
      setSectors(d.sectors || []);
    } catch (e) {
      console.error('Sectors load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name) return;
    try {
      if (editingId) {
        await fetch(`/api/sectors/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            riskScore: Number(form.riskScore),
            riskScoreInt: Number(form.riskScoreInt),
            benchmarkedMargin: Number(form.benchmarkedMargin),
          }),
        });
      } else {
        await fetch('/api/sectors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            riskScore: Number(form.riskScore),
            riskScoreInt: Number(form.riskScoreInt),
            benchmarkedMargin: Number(form.benchmarkedMargin),
          }),
        });
      }
      setOpen(false);
      setForm(empty);
      setEditingId(null);
      load();
    } catch (e) {
      console.error('Save sector error', e);
    }
  };

  const edit = (s: any) => {
    setForm({
      name: s.name,
      riskScore: s.riskScore,
      riskScoreInt: s.riskScoreInt || 3,
      benchmarkedMargin: s.benchmarkedMargin || 0,
    });
    setEditingId(s.id);
    setOpen(true);
  };

  const remove = async (s: any) => {
    if (!confirm(`Delete sector "${s.name}"?`)) return;
    await fetch(`/api/sectors/${s.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" /> Business Sectors
            </h2>
            <p className="text-xs text-slate-500">Industry sectors with risk score (0-1, higher=safer) and benchmarked margin.</p>
          </div>
          <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> New Sector
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Sector Name</th>
                <th className="px-3 py-2 font-semibold">Risk Score</th>
                <th className="px-3 py-2 font-semibold">Risk Tier (1-5)</th>
                <th className="px-3 py-2 font-semibold">Benchmarked Margin</th>
                <th className="px-3 py-2 font-semibold">Risk Profile</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Loading sectors...</td></tr>
              ) : sectors.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center">
                  <Layers className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No sectors configured.</p>
                </td></tr>
              ) : sectors.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs font-semibold text-slate-900">{s.name}</td>
                  <td className="px-3 py-2 text-xs font-mono text-slate-700">{s.riskScore?.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">{s.riskScoreInt || '—'}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-900">{s.benchmarkedMargin?.toFixed(2) || '—'}%</td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-semibold', riskColor(s.riskScore))}>
                      {riskLabel(s.riskScore)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => edit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" title="Delete" onClick={() => remove(s)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sector' : 'New Sector'}</DialogTitle>
            <DialogDescription>Higher risk score (0-1) means safer sector for lending.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Sector Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Food & Beverage" />
            </div>
            <div>
              <Label>Risk Score (0-1): {Number(form.riskScore).toFixed(2)}</Label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={form.riskScore}
                onChange={(e) => setForm({ ...form, riskScore: Number(e.target.value) })}
                className="w-full accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>High risk (0)</span><span>Safe (1)</span>
              </div>
            </div>
            <div>
              <Label>Risk Tier (1-5)</Label>
              <Input type="number" min={1} max={5} value={form.riskScoreInt} onChange={(e) => setForm({ ...form, riskScoreInt: e.target.value })} />
            </div>
            <div>
              <Label>Benchmarked Margin (%)</Label>
              <Input type="number" step="0.1" value={form.benchmarkedMargin} onChange={(e) => setForm({ ...form, benchmarkedMargin: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
              {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

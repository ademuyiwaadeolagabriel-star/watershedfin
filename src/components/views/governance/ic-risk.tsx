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
import {
  ShieldAlert, Plus, TrendingUp, AlertTriangle, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const RATING_COLORS: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const RATING_TEXT: Record<string, string> = {
  low: 'text-emerald-700 bg-emerald-100',
  medium: 'text-amber-700 bg-amber-100',
  high: 'text-orange-700 bg-orange-100',
  critical: 'text-red-700 bg-red-100',
};

const CATEGORIES = ['credit', 'operational', 'fraud', 'compliance', 'strategic', 'liquidity', 'market', 'technology', 'reputational'];

// Compute matrix cell color from score (likelihood × impact, 1-5 each)
function cellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact;
  if (score >= 20) return 'bg-red-500 text-white';
  if (score >= 15) return 'bg-orange-500 text-white';
  if (score >= 8) return 'bg-amber-400 text-slate-900';
  return 'bg-emerald-500 text-white';
}

export function IcRiskView() {
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRating, setFilterRating] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // form
  const [form, setForm] = useState({
    title: '', description: '', category: 'operational', type: '',
    inherentLikelihood: 3, inherentImpact: 3,
    residualLikelihood: 2, residualImpact: 2,
    riskResponse: 'mitigate', treatmentPlan: '', status: 'identified',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterRating !== 'all') params.set('rating', filterRating);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await authFetch(`/api/ic/risk?${params.toString()}`);
      const d = await res.json();
      setRisks(d.risks || []);
    } catch (e) {
      console.error('Risk load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterCategory, filterRating, filterStatus]);

  const submit = async () => {
    if (!form.title) return;
    try {
      await authFetch('/api/ic/risk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setCreateOpen(false);
      setForm({
        title: '', description: '', category: 'operational', type: '',
        inherentLikelihood: 3, inherentImpact: 3,
        residualLikelihood: 2, residualImpact: 2,
        riskResponse: 'mitigate', treatmentPlan: '', status: 'identified',
      });
      load();
    } catch (e) {
      console.error('Create risk error', e);
    }
  };

  // Build matrix counts
  const matrix: number[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const r of risks) {
    const l = r.inherentLikelihood || 1;
    const i = r.inherentImpact || 1;
    if (l >= 1 && l <= 5 && i >= 1 && i <= 5) matrix[l - 1][i - 1]++;
  }

  const summary = {
    total: risks.length,
    critical: risks.filter((r) => r.inherentRiskRating === 'critical').length,
    high: risks.filter((r) => r.inherentRiskRating === 'high').length,
    open: risks.filter((r) => r.status !== 'closed').length,
  };

  const inherentPreviewScore = form.inherentLikelihood * form.inherentImpact;
  const inherentPreviewRating =
    inherentPreviewScore >= 20 ? 'critical' :
    inherentPreviewScore >= 15 ? 'high' :
    inherentPreviewScore >= 8 ? 'medium' : 'low';
  const inherentPreview = { score: inherentPreviewScore, rating: inherentPreviewRating };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-emerald-600" /> Enterprise Risk Register
            </h2>
            <p className="text-xs text-slate-500">5×5 inherent risk matrix. Scores auto-calculated from likelihood × impact.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Register Risk
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Total Risks</p><p className="text-xl font-bold text-slate-900">{summary.total}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Critical</p><p className="text-xl font-bold text-red-700">{summary.critical}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">High</p><p className="text-xl font-bold text-orange-700">{summary.high}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Open</p><p className="text-xl font-bold text-amber-700">{summary.open}</p></Card>
      </div>

      {/* Risk matrix heatmap */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-600" /> 5×5 Inherent Risk Matrix
        </h3>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            {/* Header row: impact labels */}
            <div className="flex items-end">
              <div className="w-20" />
              <div className="flex-1 text-center text-[10px] uppercase tracking-wider text-slate-500 font-semibold pb-1">Impact →</div>
            </div>
            <div className="flex">
              <div className="w-20 flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold rotate-[-90deg] whitespace-nowrap">Likelihood ↓</span>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-1">
                  <div />
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="text-center text-[10px] text-slate-500 font-semibold py-1">{i}</div>
                  ))}
                  {[5, 4, 3, 2, 1].map((l) => (
                    <div key={l} className="contents">
                      <div className="flex items-center justify-end pr-2 text-[10px] text-slate-500 font-semibold">{l}</div>
                      {[1, 2, 3, 4, 5].map((i) => {
                        const count = matrix[l - 1][i - 1];
                        return (
                          <div
                            key={i}
                            className={cn(
                              'aspect-square min-h-[50px] rounded-md flex flex-col items-center justify-center text-xs font-bold',
                              cellColor(l, i)
                            )}
                            title={`Likelihood ${l} × Impact ${i} = ${l * i}`}
                          >
                            <span className="text-base">{count || ''}</span>
                            <span className="text-[9px] opacity-75">{l * i}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> Low (1-7)</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-400" /> Medium (8-14)</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-500" /> High (15-19)</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> Critical (20+)</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterRating} onChange={(e) => setFilterRating(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Ratings</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Statuses</option>
            <option value="identified">Identified</option>
            <option value="assessing">Assessing</option>
            <option value="treating">Treating</option>
            <option value="monitored">Monitored</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold text-center">L</th>
                <th className="px-3 py-2 font-semibold text-center">I</th>
                <th className="px-3 py-2 font-semibold text-center">Inherent</th>
                <th className="px-3 py-2 font-semibold text-center">Residual</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Next Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">Loading risks...</td></tr>
              ) : risks.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center">
                  <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No risks registered.</p>
                </td></tr>
              ) : risks.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{r.riskCode || '—'}</td>
                  <td className="px-3 py-2">
                    <p className="text-xs font-semibold text-slate-900">{r.title}</p>
                    {r.description && <p className="text-[10px] text-slate-500 truncate max-w-xs">{r.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{r.category || '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">{r.inherentLikelihood || '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">{r.inherentImpact || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex flex-col items-center">
                      <span className="text-sm font-bold text-slate-900">{r.inherentScore || '—'}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize', RATING_TEXT[r.inherentRiskRating])}>
                        {r.inherentRiskRating}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.residualScore ? (
                      <div className="inline-flex flex-col items-center">
                        <span className="text-sm font-bold text-slate-900">{r.residualScore}</span>
                        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize', RATING_TEXT[r.residualRiskRating])}>
                          {r.residualRiskRating}
                        </span>
                      </div>
                    ) : <span className="text-slate-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 capitalize">{r.status}</span>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-600">
                    {r.nextReviewDate ? new Date(r.nextReviewDate).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create risk modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register New Risk</DialogTitle>
            <DialogDescription>
              Inherent score = Likelihood × Impact. Rating thresholds: ≥20 critical, ≥15 high, ≥8 medium, else low.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="md:col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Loan portfolio concentration in oil & gas" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. concentration, credit, cyber" />
            </div>
            <div>
              <Label>Inherent Likelihood (1-5): {form.inherentLikelihood}</Label>
              <input type="range" min={1} max={5} value={form.inherentLikelihood} onChange={(e) => setForm({ ...form, inherentLikelihood: Number(e.target.value) })} className="w-full accent-emerald-600" />
            </div>
            <div>
              <Label>Inherent Impact (1-5): {form.inherentImpact}</Label>
              <input type="range" min={1} max={5} value={form.inherentImpact} onChange={(e) => setForm({ ...form, inherentImpact: Number(e.target.value) })} className="w-full accent-emerald-600" />
            </div>
            <div className="md:col-span-2 rounded bg-slate-50 p-2 text-xs flex items-center justify-between">
              <span className="text-slate-600">Calculated inherent score</span>
              <span className="font-bold text-slate-900">{inherentPreview.score}</span>
              <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold capitalize', RATING_TEXT[inherentPreview.rating])}>
                {inherentPreview.rating}
              </span>
            </div>
            <div>
              <Label>Residual Likelihood (1-5): {form.residualLikelihood}</Label>
              <input type="range" min={1} max={5} value={form.residualLikelihood} onChange={(e) => setForm({ ...form, residualLikelihood: Number(e.target.value) })} className="w-full accent-emerald-600" />
            </div>
            <div>
              <Label>Residual Impact (1-5): {form.residualImpact}</Label>
              <input type="range" min={1} max={5} value={form.residualImpact} onChange={(e) => setForm({ ...form, residualImpact: Number(e.target.value) })} className="w-full accent-emerald-600" />
            </div>
            <div>
              <Label>Risk Response</Label>
              <select value={form.riskResponse} onChange={(e) => setForm({ ...form, riskResponse: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="avoid">Avoid</option>
                <option value="mitigate">Mitigate</option>
                <option value="transfer">Transfer</option>
                <option value="accept">Accept</option>
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="identified">Identified</option>
                <option value="assessing">Assessing</option>
                <option value="treating">Treating</option>
                <option value="monitored">Monitored</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>Treatment Plan</Label>
              <Textarea rows={2} value={form.treatmentPlan} onChange={(e) => setForm({ ...form, treatmentPlan: e.target.value })} placeholder="Describe mitigation actions..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
              <TrendingUp className="h-4 w-4" /> Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, RefreshCw, Save, Edit3, Target, TrendingUp, Wallet, Loader2, Trophy,
  Calendar, CalendarDays, CalendarRange,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface BranchTarget {
  branch: any;
  target: { disbursementTarget: number; loanCountTarget: number; month: string; periodType: string };
  actual: { totalDisbursed: number; loanCount: number; submittedLoans: number };
  progress: { disbursementPct: number; loanCountPct: number };
  quarterly?: {
    target: { disbursementTarget: number; loanCountTarget: number; quarter: string };
    actual: { totalDisbursed: number; loanCount: number; submittedLoans: number };
    progress: { disbursementPct: number; loanCountPct: number };
  };
  annual?: {
    target: { disbursementTarget: number; loanCountTarget: number; year: string };
    actual: { totalDisbursed: number; loanCount: number; submittedLoans: number };
    progress: { disbursementPct: number; loanCountPct: number };
  };
  loBreakdown: Array<{
    staffId: string; name: string;
    disbursementTarget: number; loanCountTarget: number;
    actualDisbursed: number; actualLoans: number; progress: number;
  }>;
}

type PeriodType = 'monthly' | 'quarterly' | 'annual';

export function BranchTargetView() {
  const { currentAdmin } = useAppStore();
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [data, setData] = useState<BranchTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPeriod, setEditingPeriod] = useState<PeriodType | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ disbursementTarget: 0, loanCountTarget: 0, periodKey: '' });

  const canSetAnyBranch = ['super', 'md', 'hoc'].includes(currentAdmin?.role || '');
  const isBM = currentAdmin?.role === 'bm';

  const loadBranches = async () => {
    try {
      const res = await authFetch('/api/branches');
      if (res.ok) {
        const d = await res.json();
        const list = d.branches || [];
        setBranches(list);
        if (isBM && currentAdmin?.branchId) {
          setSelectedBranchId(currentAdmin.branchId);
        } else if (list.length > 0 && !selectedBranchId) {
          setSelectedBranchId(list[0].id);
        }
      }
    } catch (e) { console.error(e); }
  };

  const loadTarget = async () => {
    if (!selectedBranchId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/branches/${selectedBranchId}/target`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setForm({
          disbursementTarget: d.target?.disbursementTarget || 0,
          loanCountTarget: d.target?.loanCountTarget || 0,
          periodKey: d.target?.month || new Date().toISOString().slice(0, 7),
        });
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { if (selectedBranchId) loadTarget(); }, [selectedBranchId]);

  const startEdit = (period: PeriodType) => {
    setEditingPeriod(period);
    if (period === 'monthly') {
      setForm({
        disbursementTarget: data?.target?.disbursementTarget || 0,
        loanCountTarget: data?.target?.loanCountTarget || 0,
        periodKey: data?.target?.month || new Date().toISOString().slice(0, 7),
      });
    } else if (period === 'quarterly') {
      const q = `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
      setForm({
        disbursementTarget: data?.quarterly?.target?.disbursementTarget || 0,
        loanCountTarget: data?.quarterly?.target?.loanCountTarget || 0,
        periodKey: data?.quarterly?.target?.quarter || q,
      });
    } else {
      setForm({
        disbursementTarget: data?.annual?.target?.disbursementTarget || 0,
        loanCountTarget: data?.annual?.target?.loanCountTarget || 0,
        periodKey: data?.annual?.target?.year || String(new Date().getFullYear()),
      });
    }
  };

  const save = async () => {
    if (!editingPeriod) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/branches/${selectedBranchId}/target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disbursementTarget: Number(form.disbursementTarget),
          loanCountTarget: Number(form.loanCountTarget),
          periodType: editingPeriod,
          periodKey: form.periodKey,
        }),
      });
      if (res.ok) {
        setEditingPeriod(null);
        await loadTarget();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save');
      }
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  // Helper to generate quarter options
  const quarterOptions = () => {
    const year = new Date().getFullYear();
    const opts: string[] = [];
    for (let y = year; y >= year - 1; y--) {
      for (let q = 1; q <= 4; q++) {
        opts.push(`${y}-Q${q}`);
      }
    }
    return opts;
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" /> Branch Target Manager
            </h2>
            <p className="text-xs text-slate-500">
              {canSetAnyBranch
                ? 'Set monthly, quarterly, and annual disbursement and loan-count targets. The BM then distributes targets to individual LOs.'
                : isBM
                ? 'Set targets for your branch across monthly, quarterly, and annual periods. Assign individual targets to your Loan Officers via Staff → Staff Detail.'
                : 'View branch targets (read-only).'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadTarget} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      {/* Branch selector — hidden for BM (they only see their own) */}
      {!isBM && branches.length > 0 && (
        <Card className="p-4">
          <Label className="text-xs">Select Branch</Label>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select a branch" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      {!selectedBranchId ? (
        <Card className="p-8 text-center text-slate-400">Select a branch to view its target.</Card>
      ) : loading ? (
        <Card className="p-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Loading branch target…</p>
        </Card>
      ) : data ? (
        <>
          {/* Branch name header */}
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">{data.branch.name} ({data.branch.code})</h3>
                <p className="text-xs text-slate-500">Multi-period target dashboard</p>
              </div>
            </div>
          </Card>

          {/* v41: Tabs for Monthly / Quarterly / Annual */}
          <Tabs defaultValue="monthly" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="monthly" className="text-xs">
                <Calendar className="h-3.5 w-3.5 mr-1" /> Monthly
              </TabsTrigger>
              <TabsTrigger value="quarterly" className="text-xs">
                <CalendarRange className="h-3.5 w-3.5 mr-1" /> Quarterly
              </TabsTrigger>
              <TabsTrigger value="annual" className="text-xs">
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> Annual
              </TabsTrigger>
            </TabsList>

            {/* ── MONTHLY ─────────────────────────────────────────────── */}
            <TabsContent value="monthly" className="space-y-4">
              <TargetCard
                title="Monthly Target"
                periodLabel={data.target.month}
                disbursementTarget={data.target.disbursementTarget}
                loanCountTarget={data.target.loanCountTarget}
                actualDisbursed={data.actual.totalDisbursed}
                actualLoanCount={data.actual.loanCount}
                submittedLoans={data.actual.submittedLoans}
                disbursementPct={data.progress.disbursementPct}
                loanCountPct={data.progress.loanCountPct}
                canEdit={canSetAnyBranch || isBM}
                editing={editingPeriod === 'monthly'}
                form={form}
                setForm={setForm}
                periodType="monthly"
                onEdit={() => startEdit('monthly')}
                onCancel={() => setEditingPeriod(null)}
                onSave={save}
                saving={saving}
              />
            </TabsContent>

            {/* ── QUARTERLY ───────────────────────────────────────────── */}
            <TabsContent value="quarterly" className="space-y-4">
              {data.quarterly && (
                <TargetCard
                  title="Quarterly Target"
                  periodLabel={data.quarterly.target.quarter}
                  disbursementTarget={data.quarterly.target.disbursementTarget}
                  loanCountTarget={data.quarterly.target.loanCountTarget}
                  actualDisbursed={data.quarterly.actual.totalDisbursed}
                  actualLoanCount={data.quarterly.actual.loanCount}
                  submittedLoans={data.quarterly.actual.submittedLoans}
                  disbursementPct={data.quarterly.progress.disbursementPct}
                  loanCountPct={data.quarterly.progress.loanCountPct}
                  canEdit={canSetAnyBranch || isBM}
                  editing={editingPeriod === 'quarterly'}
                  form={form}
                  setForm={setForm}
                  periodType="quarterly"
                  quarterOptions={quarterOptions()}
                  onEdit={() => startEdit('quarterly')}
                  onCancel={() => setEditingPeriod(null)}
                  onSave={save}
                  saving={saving}
                />
              )}
            </TabsContent>

            {/* ── ANNUAL ──────────────────────────────────────────────── */}
            <TabsContent value="annual" className="space-y-4">
              {data.annual && (
                <TargetCard
                  title="Annual Target"
                  periodLabel={data.annual.target.year}
                  disbursementTarget={data.annual.target.disbursementTarget}
                  loanCountTarget={data.annual.target.loanCountTarget}
                  actualDisbursed={data.annual.actual.totalDisbursed}
                  actualLoanCount={data.annual.actual.loanCount}
                  submittedLoans={data.annual.actual.submittedLoans}
                  disbursementPct={data.annual.progress.disbursementPct}
                  loanCountPct={data.annual.progress.loanCountPct}
                  canEdit={canSetAnyBranch || isBM}
                  editing={editingPeriod === 'annual'}
                  form={form}
                  setForm={setForm}
                  periodType="annual"
                  yearOptions={[String(new Date().getFullYear()), String(new Date().getFullYear() - 1), String(new Date().getFullYear() + 1)]}
                  onEdit={() => startEdit('annual')}
                  onCancel={() => setEditingPeriod(null)}
                  onSave={save}
                  saving={saving}
                />
              )}
            </TabsContent>
          </Tabs>

          {/* LO breakdown — always monthly (BM uses this to assign individual targets) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-600" /> Loan Officer Breakdown (Monthly)
              </CardTitle>
              <CardDescription>
                {isBM
                  ? 'Click an LO\'s name to set or edit their individual target. The sum of LO targets should ideally equal the branch target.'
                  : 'Per-LO performance for this branch this month.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.loBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No loan officers in this branch.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan Officer</TableHead>
                      <TableHead className="text-right">Monthly Target</TableHead>
                      <TableHead className="text-right">Actual Disbursed</TableHead>
                      <TableHead className="text-right">Loans</TableHead>
                      <TableHead className="text-right">Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.loBreakdown.map((lo) => (
                      <TableRow key={lo.staffId}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => useAppStore.getState().setView('staff-detail', { staffId: lo.staffId })}
                      >
                        <TableCell className="font-medium">{lo.name}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ₦{(lo.disbursementTarget || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          ₦{(lo.actualDisbursed || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">{lo.actualLoans}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-20"><Progress value={Math.min(lo.progress, 100)} className="h-1.5" /></div>
                            <span className={cn('text-xs font-semibold w-10 text-right',
                              lo.progress >= 100 ? 'text-emerald-600' : 'text-slate-600')}>
                              {lo.progress}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Helper card for BM */}
          {isBM && (
            <Card className="p-4 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-3">
                <Target className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900">How BM target distribution works</p>
                  <p className="text-xs text-amber-700 mt-1">
                    1. Super Admin / MD / HOC sets YOUR branch target across monthly, quarterly, and annual periods.<br/>
                    2. You (BM) click each Loan Officer above to set their individual target.<br/>
                    3. The sum of all LO targets should ideally equal your branch target.<br/>
                    4. You can also set a target for yourself (as BM) via Staff → your profile.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// v41: Reusable Target Card — renders a single period's target + actuals
// ---------------------------------------------------------------------------

function TargetCard({
  title, periodLabel, disbursementTarget, loanCountTarget,
  actualDisbursed, actualLoanCount, submittedLoans,
  disbursementPct, loanCountPct,
  canEdit, editing, form, setForm, periodType,
  quarterOptions, yearOptions,
  onEdit, onCancel, onSave, saving,
}: {
  title: string;
  periodLabel: string;
  disbursementTarget: number;
  loanCountTarget: number;
  actualDisbursed: number;
  actualLoanCount: number;
  submittedLoans: number;
  disbursementPct: number;
  loanCountPct: number;
  canEdit: boolean;
  editing: boolean;
  form: { disbursementTarget: number; loanCountTarget: number; periodKey: string };
  setForm: (f: any) => void;
  periodType: PeriodType;
  quarterOptions?: string[];
  yearOptions?: string[];
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-600" />
              {title}
            </CardTitle>
            <CardDescription>
              {periodType === 'monthly' && 'Set by Super Admin / MD / HOC / BM'}
              {periodType === 'quarterly' && 'Quarterly target — set by Super Admin / MD / HOC / BM'}
              {periodType === 'annual' && 'Annual target — set by Super Admin / MD / HOC / BM'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
            {canEdit && !editing && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Edit3 className="h-3.5 w-3.5 mr-1" /> {disbursementTarget ? 'Edit' : 'Set'} Target
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-3 rounded-md border border-slate-200 p-4 bg-slate-50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Disbursement Target (₦)</Label>
                <Input type="number" value={form.disbursementTarget}
                  onChange={(e) => setForm({ ...form, disbursementTarget: Number(e.target.value) })}
                  className="mt-1" placeholder="e.g. 50000000" />
              </div>
              <div>
                <Label className="text-xs">Loan Count Target</Label>
                <Input type="number" value={form.loanCountTarget}
                  onChange={(e) => setForm({ ...form, loanCountTarget: Number(e.target.value) })}
                  className="mt-1" placeholder="e.g. 50" />
              </div>
              <div>
                <Label className="text-xs">
                  {periodType === 'monthly' && 'Target Month'}
                  {periodType === 'quarterly' && 'Target Quarter'}
                  {periodType === 'annual' && 'Target Year'}
                </Label>
                {periodType === 'monthly' && (
                  <Input type="month" value={form.periodKey}
                    onChange={(e) => setForm({ ...form, periodKey: e.target.value })}
                    className="mt-1" />
                )}
                {periodType === 'quarterly' && (
                  <Select value={form.periodKey} onValueChange={(v) => setForm({ ...form, periodKey: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(quarterOptions || []).map((q) => (
                        <SelectItem key={q} value={q}>{q}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {periodType === 'annual' && (
                  <Select value={form.periodKey} onValueChange={(v) => setForm({ ...form, periodKey: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(yearOptions || []).map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Target
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Disbursement Target</p>
                <Badge variant="outline" className="text-[10px]">{periodLabel}</Badge>
              </div>
              <p className="text-xl font-bold text-slate-900 mb-1">
                ₦{(disbursementTarget || 0).toLocaleString()}
              </p>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Actual: ₦{(actualDisbursed || 0).toLocaleString()}</span>
                <span className={cn('font-semibold', disbursementPct >= 100 ? 'text-emerald-600' : 'text-slate-700')}>
                  {disbursementPct}%
                </span>
              </div>
              <Progress value={Math.min(disbursementPct, 100)} className="h-2" />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Loan Count Target</p>
                <Badge variant="outline" className="text-[10px]">Submitted: {submittedLoans}</Badge>
              </div>
              <p className="text-xl font-bold text-slate-900 mb-1">{loanCountTarget || 0} loans</p>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Disbursed: {actualLoanCount}</span>
                <span className={cn('font-semibold', loanCountPct >= 100 ? 'text-emerald-600' : 'text-slate-700')}>
                  {loanCountPct}%
                </span>
              </div>
              <Progress value={Math.min(loanCountPct, 100)} className="h-2" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

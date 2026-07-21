'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PieChart, RefreshCw, TrendingUp, Wallet, CheckCircle2, AlertTriangle,
  Loader2, ArrowLeft, Trophy, Target,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function StaffPerformanceView() {
  const { setView } = useAppStore();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('loan');
  const [branchId, setBranchId] = useState<string>('all');
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [branches, setBranches] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ role, month });
      if (branchId !== 'all') params.set('branchId', branchId);
      const res = await authFetch(`/api/staff/performance?${params.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setStaff(d.staff || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    try {
      const res = await authFetch('/api/branches');
      if (res.ok) {
        const d = await res.json();
        setBranches(d.branches || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    load();
  }, [role, branchId, month]);

  // Compute aggregates
  const totals = staff.reduce((acc, s) => ({
    disbursed: acc.disbursed + (s.totalDisbursed || 0),
    target: acc.target + (s.disbursementTarget || 0),
    loans: acc.loans + (s.totalLoans || 0),
    approved: acc.approved + (s.approved || 0),
    declined: acc.declined + (s.declined || 0),
  }), { disbursed: 0, target: 0, loans: 0, approved: 0, declined: 0 });

  const overallPct = totals.target > 0 ? Math.round((totals.disbursed / totals.target) * 100) : 0;
  const overallApproval = totals.loans > 0 ? Math.round((totals.approved / totals.loans) * 100) : 0;

  // Sort by disbursement amount descending
  const sortedStaff = [...staff].sort((a, b) => (b.totalDisbursed || 0) - (a.totalDisbursed || 0));

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="h-5 w-5 text-emerald-600" /> Staff Performance Dashboard
            </h2>
            <p className="text-xs text-slate-500">
              Monthly disbursement vs target, approval rate, and processing speed for all loan officers and branch managers.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setView('staff')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Staff
          </Button>
        </div>
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="loan">Loan Officers (LO)</SelectItem>
                <SelectItem value="bm">Branch Managers (BM)</SelectItem>
                <SelectItem value="hoc">Head of Credit (HOC)</SelectItem>
                <SelectItem value="cro">Chief Risk Officer (CRO)</SelectItem>
                <SelectItem value="analyst">Analysts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Branch</label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Month</label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      {/* Aggregate KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Disbursed</p>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">₦{totals.disbursed.toLocaleString()}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            vs ₦{totals.target.toLocaleString()} target ({overallPct}%)
          </p>
          <Progress value={Math.min(overallPct, 100)} className="h-1.5 mt-2" />
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Loans</p>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{totals.loans}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {totals.approved} approved · {totals.declined} declined
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Approval Rate</p>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{overallApproval}%</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {totals.loans > 0 ? `${totals.approved} of ${totals.loans}` : 'No loans this month'}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Active Staff</p>
            <Trophy className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-xl font-bold text-slate-900">{staff.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {staff.filter(s => (s.totalLoans || 0) > 0).length} with activity
          </p>
        </Card>
      </div>

      {/* Leaderboard table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-600" /> Performance Leaderboard
          </CardTitle>
          <CardDescription>
            Ranked by total disbursed amount this month. Click a name to set or view individual targets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Loading performance data…</p>
            </div>
          ) : sortedStaff.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No staff found for the selected filters.</p>
              <p className="text-xs text-slate-400 mt-1">Try changing the role or branch filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Loans</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Approval %</TableHead>
                    <TableHead className="text-right">Disbursed</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead className="text-right">Avg Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStaff.map((s, idx) => {
                    const pct = s.targetProgress || 0;
                    return (
                      <TableRow
                        key={s.staffId}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => useAppStore.getState().setView('staff-detail', { staffId: s.staffId })}
                      >
                        <TableCell className="text-center">
                          {idx === 0 && <Trophy className="h-4 w-4 text-amber-500 mx-auto" />}
                          {idx === 1 && <Trophy className="h-4 w-4 text-slate-400 mx-auto" />}
                          {idx === 2 && <Trophy className="h-4 w-4 text-amber-700 mx-auto" />}
                          {idx > 2 && <span className="text-xs text-slate-400">{idx + 1}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">{s.name}</div>
                          <div className="text-[10px] text-slate-400 uppercase">{s.role}</div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{s.branch}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{s.totalLoans}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-700">{s.approved}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              s.approvalRate >= 80 ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                              : s.approvalRate >= 50 ? 'border-amber-200 text-amber-700 bg-amber-50'
                              : 'border-red-200 text-red-700 bg-red-50'
                            )}
                          >
                            {s.approvalRate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono font-semibold text-slate-900">
                          ₦{(s.totalDisbursed || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {s.disbursementTarget ? `₦${s.disbursementTarget.toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-20">
                              <Progress value={Math.min(pct, 100)} className="h-1.5" />
                            </div>
                            <span className={cn(
                              'text-xs font-semibold w-10 text-right',
                              pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-slate-600'
                            )}>
                              {pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {s.avgProcessingDays > 0 ? `${s.avgProcessingDays}d` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-4 bg-slate-50 border-dashed">
        <div className="flex items-start gap-3">
          <Target className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-900">How targets work</p>
            <p className="text-xs text-slate-600 mt-1">
              Click any staff member's name in the table above to open their profile and set or edit their monthly target.
              Targets can be set by HOC, MD, or Super Admin. Progress is calculated live based on loans disbursed during the selected month.
              The leaderboard updates in real time as loans are processed.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

'use client';
import { authFetch } from '@/lib/auth-client';

import { useAppStore } from '@/lib/store';
import { ROLE_LABELS, LOAN_STEP_LABELS, LOAN_STATUS_BADGES, LOAN_STATUS_LABELS } from '@/lib/constants';
import { useEffect, useState } from 'react';
import {
  Wallet, Users, FileText, TrendingUp, AlertTriangle, ArrowRight,
  Banknote, Landmark, Activity, CheckCircle2, Clock, ShieldCheck,
  Gavel, Coins, Calculator, ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DashboardSkeleton } from '@/components/ui/skeleton';

export function DashboardView() {
  const { currentAdmin, setView } = useAppStore();
  const [stats, setStats] = useState<any>(null);
  const [recentLoans, setRecentLoans] = useState<any[]>([]);
  const [recentAudit, setRecentAudit] = useState<any[]>([]);
  const [myQueue, setMyQueue] = useState<any[]>([]);

  const loadDashboard = async () => {
    try {
      const url = currentAdmin
        ? `/api/dashboard/stats?adminId=${currentAdmin.id}&role=${currentAdmin.role}&branchId=${currentAdmin.branchId || ''}`
        : '/api/dashboard/stats';
      const res = await authFetch(url);
      const data = await res.json();
      // Defer setState to avoid synchronous state update in effect
      setTimeout(() => {
        if (data.stats) setStats(data.stats);
        if (data.recentLoans) setRecentLoans(data.recentLoans);
        if (data.recentAudit) setRecentAudit(data.recentAudit);
        if (data.myQueue) setMyQueue(data.myQueue);
      }, 0);
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  };

  useEffect(() => {
    loadDashboard();
    // R9: Auto-refresh dashboard every 30 seconds for real-time updates
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [currentAdmin]);

  if (!stats) {
    return <DashboardSkeleton />;
  }

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDateTime = (d: Date) => new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      {/* Welcome banner */}
      <Card className="bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 text-white border-0 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-emerald-200 text-xs uppercase tracking-widest mb-1">
              {ROLE_LABELS[currentAdmin?.role] || 'Staff'} Dashboard
            </p>
            <h2 className="text-2xl font-bold mb-1">Welcome back, {currentAdmin?.firstName} 👋</h2>
            <p className="text-emerald-100 text-sm">
              {currentAdmin?.branch ? `${currentAdmin.branch.name} · ` : ''}
              {myQueue.length > 0
                ? `${myQueue.length} item${myQueue.length > 1 ? 's' : ''} awaiting your action`
                : 'All caught up — no pending work'}
            </p>
          </div>
          <div className="flex gap-2">
            {currentAdmin?.role === 'loan' || currentAdmin?.loanOrigination || currentAdmin?.role === 'super' ? (
              <Button onClick={() => setView('onboarding')} className="bg-white text-emerald-700 hover:bg-emerald-50">
                <Users className="h-4 w-4 mr-1.5" /> New Customer
              </Button>
            ) : null}
            <Button onClick={() => setView('loan-origination')} variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              <FileText className="h-4 w-4 mr-1.5" /> Loan Pipeline
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KpiCard
          icon={FileText}
          label="Active Loans"
          value={stats?.activeLoans ?? '—'}
          sub={`${stats?.processingLoans ?? 0} processing · ${stats?.pendingLoans ?? 0} pending`}
          color="emerald"
          onClick={() => setView('loan-portfolio')}
        />
        <KpiCard
          icon={Wallet}
          label="Total Disbursed"
          value={fmtNaira(stats?.totalDisbursed ?? 0)}
          sub="Across active portfolio"
          color="blue"
          onClick={() => setView('loan-portfolio')}
        />
        <KpiCard
          icon={Users}
          label="Customers"
          value={stats?.customers ?? '—'}
          sub={`${stats?.branches ?? 0} branches nationwide`}
          color="purple"
          onClick={() => setView('customers')}
        />
        <KpiCard
          icon={AlertTriangle}
          label="NPL / Defaulters"
          value={stats?.nplLoans ?? '—'}
          sub={`${stats?.declinedLoans ?? 0} declined applications`}
          color="red"
          onClick={() => setView('loan-npl')}
        />
      </div>

      {/* R3: Dashboard Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Loan Status Distribution */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Loan Status Distribution</h3>
          {stats && (
            <div className="space-y-2">
              {[
                { label: 'Active/Running', value: stats.activeLoans || 0, color: 'bg-emerald-500' },
                { label: 'Processing', value: stats.processingLoans || 0, color: 'bg-blue-500' },
                { label: 'Pending', value: stats.pendingLoans || 0, color: 'bg-amber-500' },
                { label: 'NPL/Defaulted', value: stats.nplLoans || 0, color: 'bg-red-500' },
                { label: 'Declined', value: stats.declinedLoans || 0, color: 'bg-slate-400' },
              ].map((item) => {
                const total = (stats.activeLoans || 0) + (stats.processingLoans || 0) + (stats.pendingLoans || 0) + (stats.nplLoans || 0) + (stats.declinedLoans || 0);
                const pct = total > 0 ? (item.value / total) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-600">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.value} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Portfolio Summary */}
        <Card className="p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Portfolio Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 rounded-lg p-4">
              <p className="text-[10px] uppercase text-emerald-700 font-semibold">Total Disbursed</p>
              <p className="text-xl font-bold text-emerald-800 mt-1">{fmtNaira(stats?.totalDisbursed ?? 0)}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-[10px] uppercase text-blue-700 font-semibold">Total Customers</p>
              <p className="text-xl font-bold text-blue-800 mt-1">{stats?.customers ?? 0}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-[10px] uppercase text-purple-700 font-semibold">Branches</p>
              <p className="text-xl font-bold text-purple-800 mt-1">{stats?.branches ?? 0}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-4">
              <p className="text-[10px] uppercase text-amber-700 font-semibold">Avg Loan Size</p>
              <p className="text-xl font-bold text-amber-800 mt-1">
                {stats?.activeLoans > 0 ? fmtNaira((stats?.totalDisbursed ?? 0) / stats.activeLoans) : '₦0'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* My queue + workflow snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">My Action Queue</h3>
              <p className="text-xs text-slate-500">Loans currently sitting on your desk</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setView('loan-origination')}>
              View Pipeline <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          {myQueue.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600 font-medium">Queue Empty!</p>
              <p className="text-xs text-slate-400">All pending work has been cleared.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myQueue.map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setView('loan-detail', { loanId: loan.id })}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                    {loan.user?.firstName?.[0]}{loan.user?.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {loan.user?.firstName} {loan.user?.lastName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {loan.applicationRef} · {loan.user?.business?.name || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{fmtNaira(loan.amount)}</p>
                    <p className="text-[10px] text-slate-500 uppercase">{LOAN_STEP_LABELS[loan.currentStep]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-bold text-slate-900 mb-1">Loan Pipeline</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution by stage</p>
          <div className="space-y-3">
            {[
              { label: 'Origination', count: stats?.pendingLoans ?? 0, color: 'bg-slate-400' },
              { label: 'Processing', count: stats?.processingLoans ?? 0, color: 'bg-blue-500' },
              { label: 'Active', count: stats?.activeLoans ?? 0, color: 'bg-emerald-500' },
              { label: 'NPL', count: stats?.nplLoans ?? 0, color: 'bg-red-500' },
              { label: 'Declined', count: stats?.declinedLoans ?? 0, color: 'bg-amber-500' },
            ].map((s) => {
              const total = (stats?.pendingLoans ?? 0) + (stats?.processingLoans ?? 0) + (stats?.activeLoans ?? 0) + (stats?.nplLoans ?? 0) + (stats?.declinedLoans ?? 0) || 1;
              const pct = (s.count / total) * 100;
              return (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600">{s.label}</span>
                    <span className="font-semibold text-slate-900">{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <button onClick={() => setView('mcc')} className="flex flex-col items-start gap-1 p-2 rounded-md hover:bg-slate-50">
                <Gavel className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-slate-900">MCC Decisions</span>
                <span className="text-slate-500">{stats?.mcc ?? 0} recorded</span>
              </button>
              <button onClick={() => setView('accounting-dashboard')} className="flex flex-col items-start gap-1 p-2 rounded-md hover:bg-slate-50">
                <Calculator className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-slate-900">Accounting</span>
                <span className="text-slate-500">GL & journals</span>
              </button>
              <button onClick={() => setView('treasury-dashboard')} className="flex flex-col items-start gap-1 p-2 rounded-md hover:bg-slate-50">
                <Coins className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-slate-900">Treasury</span>
                <span className="text-slate-500">{stats?.investments ?? 0} investments</span>
              </button>
              <button onClick={() => setView('audit-trail')} className="flex flex-col items-start gap-1 p-2 rounded-md hover:bg-slate-50">
                <ShieldCheck className="h-4 w-4 text-purple-600" />
                <span className="font-semibold text-slate-900">Audit Trail</span>
                <span className="text-slate-500">All events</span>
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent loans + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Recent Loan Applications</h3>
            <Button size="sm" variant="ghost" onClick={() => setView('loan-origination')}>
              All Loans <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {recentLoans.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No loans yet</p>
            ) : (
              recentLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50 cursor-pointer"
                  onClick={() => setView('loan-detail', { loanId: loan.id })}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                    {loan.user?.firstName?.[0]}{loan.user?.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {loan.user?.firstName} {loan.user?.lastName}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">{loan.applicationRef}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-900">{fmtNaira(loan.amount)}</p>
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${LOAN_STATUS_BADGES[loan.status]}`}>
                      {LOAN_STATUS_LABELS[loan.status]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900">Recent Activity</h3>
            <Button size="sm" variant="ghost" onClick={() => setView('audit-trail')}>
              All Events <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentAudit.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No activity yet</p>
            ) : (
              recentAudit.map((log) => (
                <div key={log.id} className="flex items-start gap-2.5 p-2">
                  <div className={`mt-0.5 h-2 w-2 rounded-full ${
                    log.severity === 'critical' ? 'bg-red-500' :
                    log.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-900">
                      <span className="font-semibold capitalize">{log.action}</span>
                      {log.module && <span className="text-slate-500"> · {log.module}</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{log.description}</p>
                    <p className="text-[10px] text-slate-400">{fmtDateTime(log.createdAt)} · {log.admin?.username || 'system'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Workflow visualizer */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-slate-900 mb-1">Loan Governance Workflow</h3>
        <p className="text-xs text-slate-500 mb-4">20-state lifecycle · click any stage to view loans at that step</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(LOAN_STEP_LABELS).map(([step, label], idx) => {
            const isLast = idx === Object.keys(LOAN_STEP_LABELS).length - 1;
            return (
              <div key={step} className="flex items-center gap-1.5">
                <button
                  onClick={() => setView('loan-origination', { step })}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  title={`Filter loans at step: ${label}`}
                >
                  {label}
                </button>
                {!isLast && <ChevronRight className="h-3 w-3 text-slate-300" />}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, sub, color, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: any;
  sub: string;
  color: 'emerald' | 'blue' | 'purple' | 'red';
  onClick?: () => void;
}) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
  };
  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`rounded-md ${colors[color]} p-2`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-[10px] text-slate-500 truncate">{sub}</p>
    </Card>
  );
}

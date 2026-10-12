'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/auth-client';
import {
  Activity, Users, FileText, Building2, ShieldCheck, AlertTriangle,
  TrendingUp, Banknote, Lock, ToggleRight, Clock, Server, RefreshCw,
} from 'lucide-react';

export function SuperAdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/superadmin/dashboard');
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-emerald-600" />
        Loading platform telemetry…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-3 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Failed to load dashboard</span>
          </div>
          <p className="text-sm text-red-600 mt-2">{error}</p>
          <Button onClick={load} className="mt-4" size="sm">Retry</Button>
        </Card>
      </div>
    );
  }

  const totals = data?.totals || {};
  const stats = [
    { label: 'Total Admins', value: totals.admins ?? 0, sub: `${totals.activeAdmins ?? 0} active`, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Total Clients', value: totals.users ?? 0, sub: `${totals.verifiedUsers ?? 0} verified`, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Total Loans', value: totals.loans ?? 0, sub: `${totals.runningLoans ?? 0} active`, icon: FileText, color: 'text-purple-600 bg-purple-50' },
    { label: 'NPL Loans', value: totals.nplLoans ?? 0, sub: 'in default', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { label: 'Branches', value: totals.branches ?? 0, sub: 'in network', icon: Building2, color: 'text-amber-600 bg-amber-50' },
    { label: 'Active Sessions', value: totals.activeSessions ?? 0, sub: 'signed-in now', icon: Lock, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Audit Logs (24h)', value: totals.auditLogsToday ?? 0, sub: `${totals.recentErrors ?? 0} errors`, icon: Activity, color: 'text-slate-600 bg-slate-100' },
    { label: 'Closed Loans', value: totals.closedLoans ?? 0, sub: 'fully paid', icon: ShieldCheck, color: 'text-teal-600 bg-teal-50' },
  ];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-600" /> SuperAdmin Platform Dashboard
            </h2>
            <p className="text-xs text-slate-500">System-wide KPIs across all branches, roles, and modules. Generated at {new Date(data.generatedAt).toLocaleString()}.</p>
          </div>
          <div className="flex gap-2">
            {data.maintenanceMode && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                <AlertTriangle className="h-3 w-3 mr-1" /> Maintenance Mode ON
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${s.color} mb-2`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
              <p className="text-xs font-medium text-slate-700">{s.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>
            </Card>
          );
        })}
      </div>

      {/* Disbursement this month */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Banknote className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-900">Disbursement This Month</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Loans Disbursed</p>
            <p className="text-xl font-bold text-slate-900">{data.disbursedThisMonth.count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Disbursed (₦)</p>
            <p className="text-xl font-bold text-emerald-700">
              ₦{(data.disbursedThisMonth.amount || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Loans by step */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Loans by Workflow Step</h3>
          </div>
          <div className="space-y-1.5">
            {(data.loansByStep || []).slice(0, 12).map((row: any) => {
              const max = Math.max(...(data.loansByStep || []).map((r: any) => r.count), 1);
              return (
                <div key={row.step} className="flex items-center gap-2 text-xs">
                  <span className="w-44 text-slate-600 truncate font-mono">{row.step}</span>
                  <div className="flex-1 bg-slate-100 rounded h-5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full flex items-center justify-end pr-1.5 text-[10px] text-white font-semibold"
                      style={{ width: `${(row.count / max) * 100}%` }}
                    >
                      {row.count}
                    </div>
                  </div>
                </div>
              );
            })}
            {(!data.loansByStep || data.loansByStep.length === 0) && (
              <p className="text-xs text-slate-400">No loans yet.</p>
            )}
          </div>
        </Card>

        {/* Admins by role */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-semibold text-slate-900">Admins by Role</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(data.adminsByRole || []).map((row: any) => (
              <div key={row.role} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5">
                <span className="text-xs font-mono uppercase text-slate-600">{row.role}</span>
                <Badge className="bg-slate-100 text-slate-700 border border-slate-200">{row.count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* System status */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">System Status</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <ToggleRight className="h-3 w-3" /> Feature Flags
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {data.featureFlags.enabled} / {data.featureFlags.total} enabled
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <Clock className="h-3 w-3" /> Audit Retention
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">{data.auditRetentionDays} days</p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <ShieldCheck className="h-3 w-3" /> Maintenance
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {data.maintenanceMode ? 'ENABLED' : 'Normal operation'}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <Activity className="h-3 w-3" /> Active Sessions
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">{totals.activeSessions}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

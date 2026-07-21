'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/auth-client';
import {
  Server, RefreshCw, Database, Cpu, Clock, ToggleRight, ShieldCheck, Activity,
} from 'lucide-react';

export function SystemHealthView() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/superadmin/system-health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setHealth(d);
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
        Running health checks…
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="p-6">
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">Health check failed</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <Button onClick={load} size="sm" className="mt-3">Retry</Button>
        </Card>
      </div>
    );
  }

  const statusColor = (s: string) =>
    s === 'ok' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : s === 'degraded' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';

  const fmtUptime = (sec: number) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Server className="h-5 w-5 text-emerald-600" /> System Health
            </h2>
            <p className="text-xs text-slate-500">Live status of the database, build, runtime, and key metrics.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </Card>

      {/* DB health */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-900">Database Connection</h3>
          <Badge className={statusColor(health.status)}>{health.status.toUpperCase()}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Latency</p>
            <p className="font-semibold text-slate-900">{health.dbLatencyMs} ms</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Admins</p>
            <p className="font-semibold text-slate-900">{health.counts.admins.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Users</p>
            <p className="font-semibold text-slate-900">{health.counts.users.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Loans</p>
            <p className="font-semibold text-slate-900">{health.counts.loans.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Audit Logs</p>
            <p className="font-semibold text-slate-900">{health.counts.auditLogs.toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Build info */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-slate-900">Build & Runtime</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">App Version</p>
            <p className="font-mono text-slate-900">v{health.buildInfo.version}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Node Env</p>
            <p className="font-mono text-slate-900">{health.buildInfo.nodeEnv}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Node Version</p>
            <p className="font-mono text-slate-900">{health.buildInfo.nodeVersion}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Platform</p>
            <p className="font-mono text-slate-900">{health.buildInfo.platform}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Uptime</p>
            <p className="font-mono text-slate-900 flex items-center gap-1">
              <Clock className="h-3 w-3 text-slate-400" />
              {fmtUptime(health.buildInfo.uptimeSec)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">Memory (RSS)</p>
            <p className="font-mono text-slate-900">{health.buildInfo.memoryUsageMb} MB</p>
          </div>
        </div>
      </Card>

      {/* Module status */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Module Status</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <ToggleRight className="h-3 w-3" /> Feature Flags
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {health.featureFlags.enabled} / {health.featureFlags.total}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase text-slate-400">
              <ShieldCheck className="h-3 w-3" /> Maintenance
            </div>
            <p className="text-sm font-semibold text-slate-900 mt-1">
              {health.maintenanceMode ? 'ENABLED' : 'OFF'}
            </p>
          </div>
        </div>
      </Card>

      <p className="text-[11px] text-slate-400 text-center">
        Last checked: {new Date(health.timestamp).toLocaleString()}
      </p>
    </div>
  );
}

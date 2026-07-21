'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/auth-client';
import { Clock, Trash2, Save, AlertTriangle, RefreshCw } from 'lucide-react';

export function AuditRetentionView() {
  const [days, setDays] = useState(365);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/superadmin/audit-retention');
      const d = await res.json();
      setDays(d.retentionDays);
      setStats(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const savePolicy = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await authFetch('/api/superadmin/audit-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, runNow: false }),
      });
      setMessage(`Retention policy updated to ${days} days. The daily cron job will purge older records automatically.`);
      await load();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const purgeNow = async () => {
    if (!confirm(`Purge all audit logs older than ${days} days? This cannot be undone.`)) return;
    setPurging(true);
    setMessage(null);
    try {
      const res = await authFetch('/api/superadmin/audit-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, runNow: true }),
      });
      const d = await res.json();
      setMessage(`Purged ${d.purged.auditLogs} audit logs and ${d.purged.loginHistory} login history records.`);
      await load();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-600" /> Audit Log Retention
            </h2>
            <p className="text-xs text-slate-500">
              Configure how long audit logs and login history are kept. A daily Vercel cron job purges records older than the cutoff.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </Card>

      {stats && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Purge Preview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Cutoff Date</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {new Date(stats.cutoffDate).toLocaleDateString()}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Audit Logs to Purge</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{stats.auditLogsToPurge.toLocaleString()}</p>
            </div>
            <div className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Login Records to Purge</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{stats.loginHistoryToPurge.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Retention Policy</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">Retention Period (days)</Label>
            <Input
              type="number"
              min={30}
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 365)}
              className="mt-1"
              disabled={loading}
            />
            <p className="text-[11px] text-slate-400 mt-1">Minimum 30 days. Recommended: 365 (1 year) for regulatory compliance.</p>
          </div>
          <Button onClick={savePolicy} disabled={saving || loading}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Policy'}
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900">Purge Now</p>
              <p className="text-xs text-slate-500">
                Immediately delete all audit logs older than {days} days. Use with caution — this cannot be undone.
              </p>
            </div>
            <Button variant="outline" onClick={purgeNow} disabled={purging || loading}
              className="text-red-600 hover:bg-red-50 border-red-200">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {purging ? 'Purging…' : 'Purge Now'}
            </Button>
          </div>
        </div>

        {message && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700">{message}</p>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">How the cron job works</h3>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li className="flex gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 shrink-0">Schedule</Badge>
            <span>Runs daily at 02:00 UTC via Vercel Cron (configured in <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">vercel.json</code>).</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 shrink-0">Endpoint</Badge>
            <span><code className="font-mono text-[11px] bg-slate-100 px-1 rounded">GET /api/cron/audit-cleanup</code> with <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">Authorization: Bearer $CRON_SECRET</code>.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 shrink-0">Tables affected</Badge>
            <span><code className="font-mono text-[11px] bg-slate-100 px-1 rounded">AuditLog</code> and <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">LoginHistory</code> — both have <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">createdAt</code> indexes.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 shrink-0">Default</Badge>
            <span>If no policy is set, defaults to 365 days. CBN regulations recommend minimum 7 years for AML records — set 2555 days if needed.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

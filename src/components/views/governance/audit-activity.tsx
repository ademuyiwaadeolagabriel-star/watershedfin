'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { Activity, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const SEVERITY_COLORS: Record<string, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function AuditActivityView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch('/api/audit/activity?days=30');
        const d = await res.json();
        setData(d);
      } catch (e) {
        console.error('Audit activity load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const byAction = data?.byAction || [];
  const byModule = data?.byModule || [];
  const trend = (data?.trend || []).map((t: any) => ({
    date: new Date(t.date).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }),
    count: t.count,
  }));
  const bySeverity = Object.entries(data?.bySeverity || {}).map(([name, value]) => ({ name, value: value as number }));

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Activity by Action Type</h3>
              <p className="text-xs text-slate-500">Last 30 days · {data?.total || 0} events</p>
            </div>
            <Activity className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="h-72">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading chart...</div>
            ) : byAction.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byAction} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="action" angle={-35} textAnchor="end" height={60} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Activity by Module</h3>
              <p className="text-xs text-slate-500">Distribution across system modules</p>
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="h-72">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading chart...</div>
            ) : byModule.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModule} layout="vertical" margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis dataKey="module" type="category" tick={{ fontSize: 10, fill: '#64748b' }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Activity Trend</h3>
              <p className="text-xs text-slate-500">Daily event count over last 30 days</p>
            </div>
          </div>
          <div className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>
            ) : trend.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Severity Split</h3>
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">Loading...</div>
            ) : bySeverity.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={bySeverity} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {bySeverity.map((entry: any) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Recent Activity Feed</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
          ) : (data?.recent || []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No recent activity.</p>
          ) : (data?.recent || []).map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
              <div className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold shrink-0',
                a.severity === 'critical' ? 'bg-red-100 text-red-700' :
                a.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-100 text-blue-700'
              )}>
                {a.admin?.firstName?.[0] || 'S'}{a.admin?.lastName?.[0] || ''}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-900">
                  <span className="font-semibold">{a.admin ? `${a.admin.firstName} ${a.admin.lastName}` : 'System'}</span>
                  {' · '}
                  <span className="font-mono text-emerald-700">{a.action}</span>
                  {a.module && <span className="text-slate-500"> in {a.module}</span>}
                </p>
                <p className="text-xs text-slate-600 truncate">{a.description || '—'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {fmtDateTime(a.createdAt)} {a.ipAddress && `· ${a.ipAddress}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

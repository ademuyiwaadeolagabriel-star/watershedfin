'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_SEVERITIES, AUDIT_SEVERITY_BADGES,
} from '@/lib/constants';
import {
  Search, ChevronLeft, ChevronRight, ShieldAlert, Clock, Calendar,
  AlertTriangle, FileClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditItem {
  id: string;
  action: string;
  module: string | null;
  description: string | null;
  ipAddress: string | null;
  severity: string;
  createdAt: string;
  admin: { id: string; firstName: string; lastName: string; username: string; role: string } | null;
}

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AuditTrailView() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [stats, setStats] = useState({ total: 0, today: 0, thisWeek: 0, critical: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [action, setAction] = useState('all');
  const [module, setModule] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (action !== 'all') params.set('action', action);
        if (module !== 'all') params.set('module', module);
        if (severity !== 'all') params.set('severity', severity);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (search) params.set('search', search);
        params.set('page', String(page));
        params.set('pageSize', '20');
        const res = await fetch(`/api/audit/trail?${params.toString()}`);
        const data = await res.json();
        setItems(data.items || []);
        setStats(data.stats || stats);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      } catch (e) {
        console.error('Audit trail load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [action, module, severity, from, to, search, page]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const statCards = [
    { label: 'Total Events', value: stats.total, icon: FileClock, color: 'text-slate-600', bg: 'bg-slate-100' },
    { label: 'Today', value: stats.today, icon: Clock, color: 'text-emerald-700', bg: 'bg-emerald-100' },
    { label: 'This Week', value: stats.thisWeek, icon: Calendar, color: 'text-amber-700', bg: 'bg-amber-100' },
    { label: 'Critical', value: stats.critical, icon: ShieldAlert, color: 'text-red-700', bg: 'bg-red-100' },
  ];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', s.bg)}>
                <s.icon className={cn('h-5 w-5', s.color)} />
              </div>
              <div>
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className="text-xl font-bold text-slate-900">{s.value.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="Search description, IP, user..."
              className="pl-9"
            />
          </div>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">All Actions</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">All Modules</option>
            {AUDIT_MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">All Severities</option>
            {AUDIT_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-2">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="text-xs" />
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="text-xs" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Module</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">IP Address</th>
                <th className="px-4 py-3 font-semibold">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading audit log...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <FileClock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No audit events match your filters.</p>
                </td></tr>
              ) : items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-[11px] text-slate-600 whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    {a.admin ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold">
                          {a.admin.firstName[0]}{a.admin.lastName[0]}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{a.admin.firstName} {a.admin.lastName}</p>
                          <p className="text-[10px] text-slate-500">@{a.admin.username}</p>
                        </div>
                      </div>
                    ) : <span className="text-xs text-slate-400">System</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-mono text-[10px]">{a.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{a.module || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-md truncate">{a.description || '—'}</td>
                  <td className="px-4 py-3 text-[11px] font-mono text-slate-600">{a.ipAddress || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-semibold capitalize', AUDIT_SEVERITY_BADGES[a.severity] || 'bg-slate-100 text-slate-700')}>
                      {a.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <p>Page <span className="font-semibold text-slate-900">{page}</span> of {totalPages} · {total} events</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-7 px-2">
                <ChevronLeft className="h-3 w-3" /> Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-7 px-2">
                Next <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

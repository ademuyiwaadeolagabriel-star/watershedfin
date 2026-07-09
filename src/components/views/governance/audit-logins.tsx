'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ShieldCheck, ShieldAlert, Monitor, Smartphone, Globe, MapPin,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

interface LoginItem {
  id: string;
  status: string;
  guard: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browserName: string | null;
  platformName: string | null;
  location: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  admin: { id: string; firstName: string; lastName: string; username: string; role: string } | null;
}

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AuditLoginsView() {
  const [items, setItems] = useState<LoginItem[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (status !== 'all') params.set('status', status);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        params.set('page', String(page));
        params.set('pageSize', '20');
        const res = await authFetch(`/api/audit/logins?${params.toString()}`);
        const data = await res.json();
        setItems(data.items || []);
        setFailedCount(data.failedCount || 0);
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      } catch (e) {
        console.error('Audit logins load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [status, from, to, page]);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {failedCount > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Security Alert — {failedCount} Failed Login Attempts</AlertTitle>
          <AlertDescription className="text-red-700">
            Multiple failed login attempts detected. Review the records below for possible brute-force attacks or unauthorized access attempts.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="text-sm" />
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="text-sm" />
          <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Real-time login surveillance</span>
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
                <th className="px-4 py-3 font-semibold">Guard</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">IP Address</th>
                <th className="px-4 py-3 font-semibold">Device</th>
                <th className="px-4 py-3 font-semibold">Browser</th>
                <th className="px-4 py-3 font-semibold">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Loading login history...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No login events recorded for this filter.</p>
                </td></tr>
              ) : items.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-[11px] text-slate-600 whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    {l.admin ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{l.admin.firstName} {l.admin.lastName}</p>
                        <p className="text-[10px] text-slate-500">@{l.admin.username} · {l.admin.role}</p>
                      </div>
                    ) : l.user ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{l.user.firstName} {l.user.lastName}</p>
                        <p className="text-[10px] text-slate-500">{l.user.email || l.user.phone}</p>
                      </div>
                    ) : <span className="text-xs text-slate-400">Unknown</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">{l.guard}</span>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <ShieldCheck className="h-3 w-3" /> Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        <ShieldAlert className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-mono text-slate-600">{l.ipAddress || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700">
                      {l.deviceType?.toLowerCase().includes('mobile') ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                      <span>{l.deviceType || l.platformName || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700">
                      <Globe className="h-3 w-3 text-slate-400" />
                      <span>{l.browserName || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-700">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{l.location || '—'}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <p>Page <span className="font-semibold text-slate-900">{page}</span> of {totalPages} · {total} records</p>
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

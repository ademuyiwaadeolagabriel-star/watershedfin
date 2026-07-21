'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/auth-client';
import { Lock, RefreshCw, LogOut, AlertTriangle } from 'lucide-react';

export function ActiveSessionsView() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/superadmin/sessions');
      const d = await res.json();
      setSessions(d.sessions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const revokeOne = async (sessionId: string) => {
    if (!confirm('Force logout this session? The user will be signed out on their next request.')) return;
    setRevoking(sessionId);
    try {
      await authFetch(`/api/superadmin/sessions?sessionId=${sessionId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllForAdmin = async (adminId: string, name: string) => {
    if (!confirm(`Force logout ALL sessions for ${name}?`)) return;
    setRevoking(adminId);
    try {
      await authFetch(`/api/superadmin/sessions?adminId=${adminId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setRevoking(null);
    }
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleString();
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-600" /> Active Sessions
            </h2>
            <p className="text-xs text-slate-500">
              Live view of all currently authenticated admin sessions. Force logout any user instantly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
              {sessions.length} active
            </Badge>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-8">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No active sessions.</p>
            <p className="text-xs text-slate-400 mt-1">No admins are currently signed in.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="text-left py-2 pr-3 font-medium">Admin</th>
                  <th className="text-left py-2 pr-3 font-medium">Role</th>
                  <th className="text-left py-2 pr-3 font-medium">IP</th>
                  <th className="text-left py-2 pr-3 font-medium">User Agent</th>
                  <th className="text-left py-2 pr-3 font-medium">Last Seen</th>
                  <th className="text-left py-2 pr-3 font-medium">Expires</th>
                  <th className="text-right py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-900">
                        {s.admin?.firstName} {s.admin?.lastName}
                      </div>
                      <div className="text-[11px] text-slate-500">{s.admin?.email}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline" className="text-[10px] uppercase">{s.admin?.role}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600 font-mono">{s.ip || '—'}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-500 max-w-[200px] truncate" title={s.userAgent || ''}>
                      {s.userAgent || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{fmtTime(s.lastSeen)}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-500">{fmtTime(s.expiresAt)}</td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revokeOne(s.id)}
                          disabled={revoking === s.id}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-3 w-3 mr-1" />
                          {revoking === s.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => revokeAllForAdmin(s.adminId, `${s.admin?.firstName} ${s.admin?.lastName}`)}
                          disabled={revoking === s.adminId}
                          title="Revoke all sessions for this admin"
                        >
                          All
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

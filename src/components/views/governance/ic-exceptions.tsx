'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import {
  AlertOctagon, Plus, Filter, AlertTriangle, Eye, CheckCircle2, UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const SEVERITY_BADGES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const STATUS_BADGES: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  under_review: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  escalated: 'bg-purple-100 text-purple-700',
};

const CATEGORIES = ['transaction', 'compliance', 'operational', 'security', 'fraud', 'credit'];
const RESOLUTION_TYPES = ['confirmed_fraud', 'policy_violation', 'error', 'false_positive', 'acceptable_risk', 'other'];

export function IcExceptionsView() {
  const { currentAdmin } = useAppStore();
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState({ type: 'error', notes: '' });

  const [filters, setFilters] = useState({ status: 'all', category: 'all', severity: 'all', escalated: 'all' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.category !== 'all') params.set('category', filters.category);
      if (filters.severity !== 'all') params.set('severity', filters.severity);
      if (filters.escalated !== 'all') params.set('escalated', filters.escalated);
      const res = await authFetch(`/api/ic/exceptions?${params.toString()}`);
      const d = await res.json();
      setExceptions(d.exceptions || []);
    } catch (e) {
      console.error('Exceptions load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const [form, setForm] = useState({
    title: '', description: '', category: 'operational', type: '',
    severity: 'medium', priority: 'normal',
  });

  const submit = async () => {
    if (!form.title) return;
    try {
      await authFetch('/api/ic/exceptions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, reporterId: currentAdmin?.id }),
      });
      setCreateOpen(false);
      setForm({ title: '', description: '', category: 'operational', type: '', severity: 'medium', priority: 'normal' });
      load();
    } catch (e) {
      console.error('Create exception error', e);
    }
  };

  const openDetail = async (e: any) => {
    setDetail(e);
    setDetailOpen(true);
    try {
      const res = await authFetch(`/api/ic/exceptions/${e.id}`);
      const d = await res.json();
      setDetail(d.exception);
    } catch (err) {
      console.error('Detail error', err);
    }
  };

  const resolve = async () => {
    if (!detail) return;
    try {
      await authFetch(`/api/ic/exceptions/${detail.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          resolutionType: resolution.type,
          resolutionNotes: resolution.notes,
          resolvedById: currentAdmin?.id,
        }),
      });
      setResolveOpen(false);
      setDetailOpen(false);
      setResolution({ type: 'error', notes: '' });
      load();
    } catch (e) {
      console.error('Resolve error', e);
    }
  };

  const escalate = async (e: any) => {
    await authFetch(`/api/ic/exceptions/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEscalated: true, status: 'escalated' }),
    });
    load();
  };

  const summary = {
    total: exceptions.length,
    open: exceptions.filter((e) => e.status === 'open').length,
    escalated: exceptions.filter((e) => e.isEscalated).length,
    critical: exceptions.filter((e) => e.severity === 'critical').length,
  };

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertOctagon className="h-5 w-5 text-emerald-600" /> Exception Reports
            </h2>
            <p className="text-xs text-slate-500">Operational, compliance, and fraud exceptions logged by staff.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Report Exception
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Total</p><p className="text-xl font-bold text-slate-900">{summary.total}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Open</p><p className="text-xl font-bold text-red-700">{summary.open}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Escalated</p><p className="text-xl font-bold text-purple-700">{summary.escalated}</p></Card>
        <Card className="p-3"><p className="text-[10px] uppercase text-slate-500">Critical</p><p className="text-xl font-bold text-orange-700">{summary.critical}</p></Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-slate-400" />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select value={filters.escalated} onChange={(e) => setFilters({ ...filters, escalated: e.target.value })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs">
            <option value="all">All</option>
            <option value="true">Escalated only</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Code</th>
                <th className="px-3 py-2 font-semibold">Title</th>
                <th className="px-3 py-2 font-semibold">Category</th>
                <th className="px-3 py-2 font-semibold">Severity</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Reporter</th>
                <th className="px-3 py-2 font-semibold">Assigned</th>
                <th className="px-3 py-2 font-semibold">Reported</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-400">Loading exceptions...</td></tr>
              ) : exceptions.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center">
                  <AlertOctagon className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No exceptions logged.</p>
                </td></tr>
              ) : exceptions.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => openDetail(e)}>
                  <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{e.exceptionCode || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {e.isEscalated && <AlertTriangle className="h-3 w-3 text-purple-600" />}
                      <p className="text-xs font-semibold text-slate-900">{e.title}</p>
                    </div>
                    {e.description && <p className="text-[10px] text-slate-500 truncate max-w-xs">{e.description}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{e.category || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold capitalize', SEVERITY_BADGES[e.severity])}>{e.severity}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold capitalize', STATUS_BADGES[e.status])}>{e.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.reporter ? `${e.reporter.firstName} ${e.reporter.lastName}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.assignedTo ? `${e.assignedTo.firstName} ${e.assignedTo.lastName}` : <span className="text-slate-400">unassigned</span>}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-600 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                  <td className="px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="View" onClick={() => openDetail(e)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {!e.isEscalated && e.status !== 'resolved' && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-purple-600" title="Escalate" onClick={() => escalate(e)}>
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Report New Exception</DialogTitle>
            <DialogDescription>Log an operational, compliance, or fraud exception for investigation.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="md:col-span-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Suspicious withdrawal pattern — Account 0123456789" />
            </div>
            <div className="md:col-span-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Type</Label>
              <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="e.g. unauthorized_access" />
            </div>
            <div>
              <Label>Severity</Label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail modal */}
      <Dialog open={detailOpen} onOpenChange={(o) => { setDetailOpen(o); if (!o) setDetail(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{detail?.exceptionCode}</span> · {detail?.category} · Reported by {detail?.reporter ? `${detail.reporter.firstName} ${detail.reporter.lastName}` : '—'}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 py-2">
              <div className="flex gap-2">
                <Badge className={cn('capitalize', SEVERITY_BADGES[detail.severity])}>{detail.severity}</Badge>
                <Badge className={cn('capitalize', STATUS_BADGES[detail.status])}>{detail.status.replace(/_/g, ' ')}</Badge>
                {detail.isEscalated && <Badge className="bg-purple-100 text-purple-700">escalated</Badge>}
              </div>
              {detail.description && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Description</p>
                  <p className="text-sm text-slate-700">{detail.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-500">Reporter</p>
                  <p className="font-semibold mt-0.5">{detail.reporter ? `${detail.reporter.firstName} ${detail.reporter.lastName}` : '—'}</p>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-500">Assigned To</p>
                  <p className="font-semibold mt-0.5">{detail.assignedTo ? `${detail.assignedTo.firstName} ${detail.assignedTo.lastName}` : '—'}</p>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-500">Reported</p>
                  <p className="font-semibold mt-0.5">{fmtDateTime(detail.createdAt)}</p>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-500">Resolved</p>
                  <p className="font-semibold mt-0.5">{detail.resolvedAt ? fmtDateTime(detail.resolvedAt) : '—'}</p>
                </div>
              </div>
              {detail.resolutionNotes && (
                <div className="rounded bg-emerald-50 p-2 text-xs">
                  <p className="font-semibold text-emerald-700 capitalize">{detail.resolutionType?.replace(/_/g, ' ')}</p>
                  <p className="text-slate-700 mt-1">{detail.resolutionNotes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {detail?.status !== 'resolved' && (
              <Button onClick={() => setResolveOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Resolve
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve modal */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Exception</DialogTitle>
            <DialogDescription>Mark this exception as resolved with a resolution type and notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Resolution Type</Label>
              <select value={resolution.type} onChange={(e) => setResolution({ ...resolution, type: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {RESOLUTION_TYPES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <Label>Resolution Notes</Label>
              <Textarea rows={3} value={resolution.notes} onChange={(e) => setResolution({ ...resolution, notes: e.target.value })} placeholder="Describe the investigation findings and resolution..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={resolve} className="bg-emerald-600 hover:bg-emerald-700">
              <UserCog className="h-4 w-4" /> Confirm Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

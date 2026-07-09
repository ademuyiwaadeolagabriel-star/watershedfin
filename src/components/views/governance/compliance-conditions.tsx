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
  ShieldCheck, Clock, AlertCircle, CheckCircle2, XCircle, FileText, Search, Gavel,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const COLUMNS = [
  { key: 'pending', label: 'Pending', color: 'border-t-amber-400', icon: Clock, badge: 'bg-amber-100 text-amber-700' },
  { key: 'under_review', label: 'Under Review', color: 'border-t-blue-400', icon: AlertCircle, badge: 'bg-blue-100 text-blue-700' },
  { key: 'verified', label: 'Verified', color: 'border-t-emerald-400', icon: CheckCircle2, badge: 'bg-emerald-100 text-emerald-700' },
  { key: 'rejected', label: 'Rejected', color: 'border-t-red-400', icon: XCircle, badge: 'bg-red-100 text-red-700' },
  { key: 'waived', label: 'Waived', color: 'border-t-purple-400', icon: Gavel, badge: 'bg-purple-100 text-purple-700' },
];

const PRIORITY_BADGES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const TYPE_LABELS: Record<string, string> = {
  document_upload: 'Document Upload',
  field_update: 'Field Update',
  guarantor_update: 'Guarantor Update',
  collateral_verification: 'Collateral Verification',
  account_validation: 'Account Validation',
  bvn_verification: 'BVN Verification',
  address_verification: 'Address Verification',
  employment_verification: 'Employment Verification',
  business_verification: 'Business Verification',
  insurance_required: 'Insurance Required',
  other: 'Other',
};

export function ComplianceConditionsView() {
  const { currentAdmin } = useAppStore();
  const [conditions, setConditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (overdueOnly) params.set('overdue', 'true');
      if (search) params.set('search', search);
      const res = await authFetch(`/api/compliance/conditions?${params.toString()}`);
      const d = await res.json();
      setConditions(d.conditions || []);
    } catch (e) {
      console.error('Conditions load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [overdueOnly, search]);

  const openDetail = async (c: any) => {
    setSelected(c);
    setActionNotes('');
    try {
      const res = await authFetch(`/api/compliance/conditions/${c.id}`);
      const d = await res.json();
      setDetail(d.condition);
    } catch (e) {
      console.error('Detail load error', e);
    }
  };

  const doAction = async (action: 'verify' | 'reject' | 'waive') => {
    if (!selected) return;
    setActing(true);
    try {
      await authFetch(`/api/compliance/conditions/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes: actionNotes,
          performedBy: currentAdmin?.id,
          performerRole: currentAdmin?.role,
        }),
      });
      setSelected(null);
      setDetail(null);
      setActionNotes('');
      load();
    } catch (e) {
      console.error('Action error', e);
    } finally {
      setActing(false);
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
  const isOverdue = (d: string | null, status: string) =>
    d && !['verified', 'rejected', 'waived', 'expired'].includes(status) && new Date(d) < new Date();

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.key] = conditions.filter((x) => x.status === c.key || (c.key === 'pending' && ['pending', 'document_uploaded', 'customer_notified'].includes(x.status)));
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> Compliance Conditions Board
            </h2>
            <p className="text-xs text-slate-500">Kanban view of loan compliance conditions across all active loans.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 w-48" />
            </div>
            <Button
              size="sm"
              variant={overdueOnly ? 'destructive' : 'outline'}
              onClick={() => setOverdueOnly(!overdueOnly)}
              className="h-9"
            >
              <Clock className="h-3.5 w-3.5" /> Overdue Only
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 text-center text-slate-400">Loading conditions...</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 overflow-x-auto">
          {COLUMNS.map((col) => {
            const items = grouped[col.key] || [];
            return (
              <div key={col.key} className={cn('flex flex-col rounded-lg border-t-4 bg-white shadow-sm', col.color)}>
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <col.icon className="h-4 w-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                  </div>
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', col.badge)}>{items.length}</span>
                </div>
                <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {items.length === 0 ? (
                    <p className="text-[10px] text-slate-400 text-center py-6">No items</p>
                  ) : items.map((c) => {
                    const overdue = isOverdue(c.deadline, c.status);
                    return (
                      <div
                        key={c.id}
                        onClick={() => openDetail(c)}
                        className={cn(
                          'rounded-lg border p-2 cursor-pointer hover:shadow-md transition',
                          overdue ? 'border-red-200 bg-red-50/50' : 'border-slate-100 hover:border-emerald-200'
                        )}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2">{c.title}</p>
                        </div>
                        <p className="text-[10px] text-slate-500 mb-1.5">{TYPE_LABELS[c.conditionType] || c.conditionType}</p>
                        <div className="flex items-center gap-1 mb-1.5">
                          <Badge variant="outline" className={cn('text-[9px] capitalize', PRIORITY_BADGES[c.priority])}>{c.priority}</Badge>
                          {overdue && <Badge className="text-[9px] bg-red-100 text-red-700">overdue</Badge>}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-mono">{c.loan?.applicationRef || '—'}</span>
                          {c.deadline && (
                            <span className={cn(overdue && 'text-red-600 font-semibold')}>
                              {fmtDate(c.deadline)}
                            </span>
                          )}
                        </div>
                        {c.loan?.user && (
                          <p className="text-[10px] text-slate-500 mt-1 truncate">
                            {c.loan.user.firstName} {c.loan.user.lastName}
                            {c.loan.user.business?.name && ` · ${c.loan.user.business.name}`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDetail(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {TYPE_LABELS[selected?.conditionType] || selected?.conditionType} · Loan {selected?.loan?.applicationRef || '—'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {selected?.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Description</p>
                <p className="text-sm text-slate-700">{selected.description}</p>
              </div>
            )}
            {selected?.instructions && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Instructions</p>
                <p className="text-sm text-slate-700">{selected.instructions}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded bg-slate-50 p-2">
                <p className="text-[10px] text-slate-500">Priority</p>
                <Badge variant="outline" className={cn('text-[10px] capitalize mt-1', PRIORITY_BADGES[selected?.priority])}>{selected?.priority}</Badge>
              </div>
              <div className="rounded bg-slate-50 p-2">
                <p className="text-[10px] text-slate-500">Deadline</p>
                <p className={cn('text-sm font-semibold mt-1', selected && isOverdue(selected.deadline, selected.status) && 'text-red-600')}>
                  {selected?.deadline ? fmtDate(selected.deadline) : '—'}
                </p>
              </div>
              <div className="rounded bg-slate-50 p-2 col-span-2">
                <p className="text-[10px] text-slate-500">Loan & Customer</p>
                <p className="text-xs font-semibold mt-1">
                  {selected?.loan?.user?.firstName} {selected?.loan?.user?.lastName}
                  {selected?.loan?.user?.business?.name && ` · ${selected.loan.user.business.name}`}
                </p>
                <p className="text-[10px] text-slate-500">Amount: ₦{selected?.loan?.amount?.toLocaleString?.() || 0}</p>
              </div>
            </div>

            {detail?.verifications?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Verification History</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {detail.verifications.map((v: any) => (
                    <div key={v.id} className="text-[11px] border-l-2 border-emerald-300 pl-2 py-0.5">
                      <span className="font-semibold capitalize">{v.action.replace(/_/g, ' ')}</span>
                      {' · '}
                      <span className="text-slate-500">{new Date(v.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {v.notes && <p className="text-slate-600">{v.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!['verified', 'rejected', 'waived', 'expired'].includes(selected?.status) && (
              <div>
                <Label htmlFor="notes">Action Notes</Label>
                <Textarea id="notes" rows={3} value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="Add verification notes, rejection reason, or waiver justification..." />
              </div>
            )}
          </div>
          <DialogFooter>
            {!['verified', 'rejected', 'waived', 'expired'].includes(selected?.status) ? (
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
                  disabled={acting}
                  onClick={() => doAction('verify')}
                >
                  <CheckCircle2 className="h-4 w-4" /> Verify
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-red-500 text-red-700 hover:bg-red-50"
                  disabled={acting}
                  onClick={() => doAction('reject')}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-purple-500 text-purple-700 hover:bg-purple-50"
                  disabled={acting}
                  onClick={() => doAction('waive')}
                >
                  <Gavel className="h-4 w-4" /> Waive
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => { setSelected(null); setDetail(null); }}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

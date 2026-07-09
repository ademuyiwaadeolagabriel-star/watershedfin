'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { PRE_DISBURSEMENT_ITEMS } from '@/lib/constants';
import {
  ClipboardCheck, CheckCircle2, Circle, AlertTriangle, FileText, Banknote, XCircle, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const ITEM_ICONS: Record<string, any> = {
  allConditionsVerified: ShieldCheck,
  documentsComplete: FileText,
  customerKycValid: CheckCircle2,
  guarantorKycValid: CheckCircle2,
  collateralDocumented: FileText,
  offerLetterSigned: FileText,
  bankAccountVerified: Banknote,
  disbursementAccountConfirmed: Banknote,
};

export function ComplianceChecklistView() {
  const { viewParams, currentAdmin } = useAppStore();
  const [checklists, setChecklists] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [notes, setNotes] = useState('');

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/compliance/checklist');
      const d = await res.json();
      setChecklists(d.checklists || []);
      if (d.checklists?.length && !selectedId) {
        const id = (viewParams.checklistId as string) || d.checklists[0].id;
        setSelectedId(id);
      }
    } catch (e) {
      console.error('Checklist load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);

  const loadOne = async (id: string) => {
    if (!id) { setCurrent(null); return; }
    try {
      const all = checklists.find((c) => c.id === id) || null;
      setCurrent(all);
    } catch (e) {
      console.error('Single checklist error', e);
    }
  };

  useEffect(() => { if (selectedId) loadOne(selectedId); }, [selectedId, checklists]);

  const toggle = async (item: string, value: boolean) => {
    if (!current) return;
    // Optimistic
    setCurrent({ ...current, [item]: value });
    try {
      const res = await authFetch(`/api/compliance/checklist/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item, value: !value }),
      });
      const d = await res.json();
      if (d.checklist) {
        setCurrent({ ...d.checklist, loan: current.loan });
        // also update in list
        setChecklists((cs) => cs.map((c) => (c.id === d.checklist.id ? { ...c, ...d.checklist } : c)));
      }
    } catch (e) {
      console.error('Toggle error', e);
    }
  };

  const approve = async () => {
    if (!current) return;
    setActing(true);
    try {
      await authFetch(`/api/compliance/checklist/${current.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedBy: currentAdmin?.id, notes }),
      });
      setNotes('');
      loadList();
    } catch (e) {
      console.error('Approve error', e);
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!current) return;
    setActing(true);
    try {
      await authFetch(`/api/compliance/checklist/${current.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectedBy: currentAdmin?.id, reason: notes }),
      });
      setNotes('');
      loadList();
    } catch (e) {
      console.error('Reject error', e);
    } finally {
      setActing(false);
    }
  };

  const allChecked = current ? PRE_DISBURSEMENT_ITEMS.every((it) => (current as any)[it.key] === true) : false;
  const checkedCount = current ? PRE_DISBURSEMENT_ITEMS.filter((it) => (current as any)[it.key] === true).length : 0;
  const pct = Math.round((checkedCount / PRE_DISBURSEMENT_ITEMS.length) * 100);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-slate-100 text-slate-700',
      in_progress: 'bg-amber-100 text-amber-700',
      completed: 'bg-blue-100 text-blue-700',
      disbursement_approved: 'bg-emerald-100 text-emerald-700',
      disbursement_rejected: 'bg-red-100 text-red-700',
    };
    return map[s] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" /> Pre-Disbursement Checklist
            </h2>
            <p className="text-xs text-slate-500">8-item compliance gate. Loan cannot be disbursed until all items verified.</p>
          </div>
          <div className="w-full md:w-80">
            <Label htmlFor="loan" className="text-[10px] uppercase tracking-wider text-slate-500">Select Loan Checklist</Label>
            <select
              id="loan"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm mt-1"
            >
              <option value="">— Select checklist —</option>
              {checklists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.loan?.applicationRef || c.id} · {c.loan?.user?.firstName} {c.loan?.user?.lastName} · {c.status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 text-center text-slate-400">Loading checklists...</Card>
      ) : !current ? (
        <Card className="p-12 text-center">
          <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {checklists.length === 0 ? 'No pre-disbursement checklists created yet.' : 'Select a checklist to begin review.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{current.loan?.applicationRef || '—'}</h3>
                <p className="text-xs text-slate-500">
                  {current.loan?.user?.firstName} {current.loan?.user?.lastName}
                  {current.loan?.user?.business?.name && ` · ${current.loan.user.business.name}`}
                </p>
              </div>
              <Badge className={cn('text-[10px]', statusBadge(current.status))}>{current.status.replace(/_/g, ' ')}</Badge>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 font-semibold">Completion</span>
                <span className="text-emerald-700 font-bold">{checkedCount}/{PRE_DISBURSEMENT_ITEMS.length} ({pct}%)</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            <div className="space-y-2">
              {PRE_DISBURSEMENT_ITEMS.map((it) => {
                const checked = (current as any)[it.key] === true;
                const Icon = ITEM_ICONS[it.key] || Circle;
                const disabled = ['disbursement_approved', 'disbursement_rejected'].includes(current.status);
                return (
                  <button
                    key={it.key}
                    onClick={() => !disabled && toggle(it.key, checked)}
                    disabled={disabled}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition',
                      checked ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white hover:bg-slate-50',
                      disabled && 'opacity-60 cursor-not-allowed'
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md shrink-0',
                      checked ? 'bg-emerald-100' : 'bg-slate-100'
                    )}>
                      <Icon className={cn('h-4 w-4', checked ? 'text-emerald-700' : 'text-slate-400')} />
                    </div>
                    <div className="flex-1">
                      <p className={cn('text-xs font-semibold', checked ? 'text-slate-900' : 'text-slate-700')}>{it.label}</p>
                    </div>
                    {checked ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Approval / Rejection</h3>
            <div className="space-y-3">
              <div className="rounded bg-slate-50 p-3 text-xs">
                <p className="text-slate-500">Loan Amount</p>
                <p className="text-lg font-bold text-slate-900">₦{current.loan?.amount?.toLocaleString('en-NG') || 0}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Stage: {current.loan?.currentStep} · Compliance: {current.loan?.complianceStatus}
                </p>
              </div>

              {!['disbursement_approved', 'disbursement_rejected'].includes(current.status) && (
                <>
                  {allChecked ? (
                    <div className="flex items-center gap-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> All items verified — ready for approval
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
                      <AlertTriangle className="h-4 w-4" /> {PRE_DISBURSEMENT_ITEMS.length - checkedCount} items still pending
                    </div>
                  )}

                  <div>
                    <Label htmlFor="notes" className="text-xs">Notes (optional)</Label>
                    <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Approval or rejection comments..." />
                  </div>

                  <Button
                    onClick={approve}
                    disabled={!allChecked || acting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve for Disbursement
                  </Button>
                  <Button
                    onClick={reject}
                    disabled={acting}
                    variant="outline"
                    className="w-full border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                </>
              )}

              {current.status === 'disbursement_approved' && (
                <div className="rounded bg-emerald-50 p-3 text-xs text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  Approved on {current.approvedAt ? new Date(current.approvedAt).toLocaleString('en-NG') : '—'}
                  {current.approvalNotes && <p className="mt-1">{current.approvalNotes}</p>}
                </div>
              )}
              {current.status === 'disbursement_rejected' && (
                <div className="rounded bg-red-50 p-3 text-xs text-red-700">
                  <XCircle className="h-4 w-4 inline mr-1" />
                  Rejected on {current.rejectedAt ? new Date(current.rejectedAt).toLocaleString('en-NG') : '—'}
                  {current.rejectionReason && <p className="mt-1">{current.rejectionReason}</p>}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

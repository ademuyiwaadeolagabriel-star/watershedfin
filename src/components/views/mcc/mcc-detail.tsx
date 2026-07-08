'use client';
import { authFetch } from '@/lib/auth-client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import {
  MCC_ROLES,
  ROLE_TO_MCC,
  CP_CHECKLIST_TOTAL,
  hasPermission,
} from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft, User, Wallet, Calendar, Gavel,
  CheckCircle2, XCircle, Clock, AlertCircle, FileDown, Plus, Trash2,
  TrendingUp, Percent, Loader2, ExternalLink, ShieldCheck,
  Stamp, FileCheck, Car, Home, FileText, ClipboardCheck, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { McCPaperPDF } from '@/components/pdf/mcc-paper';
import { pdf } from '@react-pdf/renderer';
import Image from 'next/image';

// ============================================================================
// MCC Detail View — mirrors the Excel "COMMITTEE'S DECISION" sheet
// + Conditions Precedent to Drawdown checklist (LOAN CHECK-LIST sheet)
// + Internal Control verification gate (after MD approval)
// ============================================================================

interface MccDecision {
  id: string;
  approvalLevel: number;
  approverName: string;
  approverRole: string;
  recommendedAmount: number | null;
  duration: number | null;
  ccdPercentage: number | null;
  upfrontFeePercentage: number | null;
  interestRatePercentage: number | null;
  comment: string | null;
  decisionType: string;
  decisionDate: string;
  approver?: { firstName?: string; lastName?: string; email?: string } | null;
}

interface ChecklistItem {
  id: string;
  label: string;
  category: 'vehiclePapers' | 'legalMortgage' | 'loanSupport';
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  conditionId: string | null;
  status: string;
  satisfaction?: string;
}

interface ChecklistPayload {
  checklist: {
    vehiclePapers: ChecklistItem[];
    legalMortgage: ChecklistItem[];
    loanSupport: ChecklistItem[];
  };
  totalItems: number;
  verifiedCount: number;
  isComplete: boolean;
  internalControlStatus: 'pending' | 'verified' | 'rejected';
  internalControlOfficer: string | null;
  internalControlOfficerId: string | null;
  internalControlNotes: string | null;
  internalControlVerifiedAt: string | null;
  preDisbursement: any | null;
}

interface CommitteeRow {
  sn: number;
  roleCode: string;
  designation: string;
  defaultName: string;
  decision: {
    id: string;
    name: string;
    designation: string;
    amount: number | null;
    duration: number | null;
    ccdPercentage: number | null;
    upfrontFeePercentage: number | null;
    interestRatePercentage: number | null;
    comment: string | null;
    decisionType: string;
    decisionDate: string;
    approverId: string;
  } | null;
  status: string;
}

interface MccDetailData {
  loan: {
    id: string;
    applicationRef: string | null;
    reason: string | null;
    repaymentPlan: string;
    createdAt: string;
    updatedAt: string;
    user: {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      bvn: string | null;
      accountNumber: string | null;
      business: { name: string; sector: string | null; shopAddress: string | null; state: string | null } | null;
    } | null;
    branch: { name: string; code: string } | null;
    plan: { name: string; interest: number } | null;
    loanOfficer: { firstName: string; lastName: string } | null;
    complianceConditions: any[];
  };
  customerInfo: {
    borrowerName: string;
    email: string | null;
    phone: string | null;
    businessName: string | null;
    sector: string | null;
    requestedAmount: number;
    tenure: number;
    bvn: string | null;
    accountNumber: string | null;
    branch: string | null;
    loanOfficer: string | null;
  };
  decisions: MccDecision[];
  committeeTable: CommitteeRow[];
  summary: {
    initialAmount: number;
    finalAmount: number;
    amountChange: number;
    amountChangePercent: number;
    progressPercent: number;
    decisionCount: number;
    totalLevels: number;
    isComplete: boolean;
    latestRates: {
      ccd: number | null;
      upfront: number | null;
      interest: number | null;
    };
    latestDecisionType: string | null;
    latestDecisionDate: string | null;
  };
  loanStatus: {
    status: string;
    statusLabel: string;
    statusBadge: string;
    currentStep: string;
    currentStepLabel: string;
    mdApprovedAt: string | null;
    auditPassedAt: string | null;
    finalApprovedAmount: number | null;
    finalApprovedTenor: number | null;
  };
  checklist: ChecklistPayload;
  meta: any;
}

const DECISION_BADGE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  deferred: 'bg-amber-100 text-amber-700 border-amber-200',
  conditional: 'bg-blue-100 text-blue-700 border-blue-200',
  pending: 'bg-slate-100 text-slate-500 border-slate-200',
};

const DECISION_ROW_BG: Record<string, string> = {
  approved: 'bg-emerald-50/40 hover:bg-emerald-50',
  rejected: 'bg-red-50/40 hover:bg-red-50',
  deferred: 'bg-amber-50/40 hover:bg-amber-50',
  conditional: 'bg-blue-50/40 hover:bg-blue-50',
  pending: 'bg-slate-50/30 hover:bg-slate-50',
};

// Steps at or beyond which the Internal Control gate becomes visible
const IC_VISIBLE_STEPS = new Set([
  'MD_APPROVAL',
  'INTERNAL_CONTROL_CHECK',
  'CFO_DISBURSEMENT',
  'TREASURY_PAYOUT',
]);

export function MccDetailView() {
  const { viewParams, setView, currentAdmin } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [data, setData] = useState<MccDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Checklist interactions
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [verifyAllOpen, setVerifyAllOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [icNotes, setIcNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [icSubmitting, setIcSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/mcc/${loanId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to load MCC paper');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      console.error('MCC detail error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loanId) fetchData();
  }, [loanId]);

  // Determine current admin's MCC role + permissions
  const adminRole = currentAdmin?.roleType || currentAdmin?.role || '';
  const adminMccCode = ROLE_TO_MCC[adminRole] || ROLE_TO_MCC[currentAdmin?.role || ''] || null;
  const adminMccMeta = adminMccCode ? (MCC_ROLES as any)[adminMccCode] : null;
  const canVerifyChecklist = hasPermission(currentAdmin as any, 'internalControl');

  // Is the Internal Control section visible for this loan's current step?
  const icVisible = useMemo(() => {
    if (!data) return false;
    return IC_VISIBLE_STEPS.has(data.loanStatus.currentStep);
  }, [data]);

  const fmtNaira = (n: number | null) =>
    n == null ? '—' : '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtPct = (n: number | null, digits = 2) =>
    n == null ? '—' : `${Number(n).toFixed(digits)}%`;
  const fmtDate = (d: string | Date | null) =>
    !d
      ? '—'
      : new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDateTime = (d: string | Date | null) =>
    !d
      ? '—'
      : new Date(d).toLocaleString('en-NG', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const blob = await pdf(
        <McCPaperPDF
          loan={data.loan}
          decisions={data.decisions}
          summary={data.summary}
          generatedAt={new Date().toISOString()}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MCC_${data.loan.applicationRef || loanId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF export error:', e);
    } finally {
      setExporting(false);
    }
  };

  // -----------------------------------------------------------------
  // Checklist interactions
  // -----------------------------------------------------------------
  const toggleItem = async (item: ChecklistItem) => {
    if (!canVerifyChecklist || !currentAdmin) return;
    setTogglingId(item.id);
    try {
      const res = await authFetch(`/api/mcc/${loanId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentAdmin.id,
          itemId: item.id,
          verified: !item.verified,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to toggle');
      }
      const json = await res.json();
      if (data) setData({ ...data, checklist: json, loanStatus: json.newStep ? { ...data.loanStatus, currentStep: json.newStep } : data.loanStatus });
      else fetchData();
    } catch (e: any) {
      console.error('Toggle error:', e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleVerifyAll = async () => {
    if (!currentAdmin) return;
    setIcSubmitting(true);
    try {
      const res = await authFetch(`/api/mcc/${loanId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentAdmin.id,
          action: 'verify_all',
          notes: icNotes || 'Internal Control verified all conditions precedent to drawdown.',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to verify');
      }
      const json = await res.json();
      if (data) {
        setData({
          ...data,
          checklist: json,
          loanStatus: { ...data.loanStatus, currentStep: json.newStep || data.loanStatus.currentStep },
        });
      }
      setVerifyAllOpen(false);
      setIcNotes('');
    } catch (e: any) {
      console.error('Verify-all error:', e);
    } finally {
      setIcSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentAdmin || !rejectReason.trim()) return;
    setIcSubmitting(true);
    try {
      const res = await authFetch(`/api/mcc/${loanId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: currentAdmin.id,
          action: 'reject',
          reason: rejectReason,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to reject');
      }
      const json = await res.json();
      if (data) {
        setData({
          ...data,
          checklist: json,
          loanStatus: { ...data.loanStatus, currentStep: json.newStep || data.loanStatus.currentStep },
        });
      }
      setRejectOpen(false);
      setRejectReason('');
    } catch (e: any) {
      console.error('Reject error:', e);
    } finally {
      setIcSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading MCC paper...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-300 mx-auto mb-2" />
        <p className="text-sm text-red-500 mb-3">{error || 'MCC paper not found.'}</p>
        <Button variant="outline" onClick={() => setView('mcc')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to MCC List
        </Button>
      </div>
    );
  }

  const { loan, customerInfo, committeeTable, summary, loanStatus, checklist } = data;

  // Verification progress for header summary
  const verifiedCount = checklist.verifiedCount;
  const verifiedPct = Math.round((verifiedCount / CP_CHECKLIST_TOTAL) * 100);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* ---------------------------------------------------------------- */}
      {/* A. Header — title + loan ref + actions                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setView('mcc')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Image
              src="/watershed-logo.png"
              alt="Watershed Finance"
              width={28}
              height={28}
              className="rounded shrink-0"
            />
            <h1 className="text-lg lg:text-xl font-bold text-slate-900 uppercase tracking-tight">
              Approval Committee&apos;s Decision
            </h1>
            <span
              className={cn(
                'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                loanStatus.statusBadge
              )}
            >
              {loanStatus.statusLabel}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              {loanStatus.currentStepLabel}
            </span>
            {summary.isComplete && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                MCC COMPLETE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono font-semibold text-slate-700">{loan.applicationRef}</span>
            {' · '}
            {customerInfo.borrowerName}
            {customerInfo.businessName ? ` · ${customerInfo.businessName}` : ''}
            {' · '}
            Created {fmtDate(loan.createdAt)} · Updated {fmtDate(loan.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView('loan-detail', { loanId: loan.id })}
          >
            <ExternalLink className="h-4 w-4 mr-1" /> Application
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-1" />
            )}
            Export PDF
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setModalOpen(true)}
          >
            <Gavel className="h-4 w-4 mr-1" /> Record Decision
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* B. Customer Info Card                                            */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Customer Information</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Borrower Name</p>
              <p className="text-sm font-bold text-slate-900">{customerInfo.borrowerName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">BVN</p>
              <p className="text-xs font-mono text-slate-700">{customerInfo.bvn || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Phone</p>
              <p className="text-xs text-slate-700">{customerInfo.phone || '—'}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Business Name</p>
              <p className="text-xs font-semibold text-slate-900">{customerInfo.businessName || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Sector</p>
              <p className="text-xs text-slate-700">{customerInfo.sector || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Branch / Loan Officer</p>
              <p className="text-xs text-slate-700">
                {customerInfo.branch || '—'}
                {customerInfo.loanOfficer ? ` · ${customerInfo.loanOfficer}` : ''}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">
                Requested Amount
              </p>
              <p className="text-2xl font-bold text-emerald-700">
                {fmtNaira(customerInfo.requestedAmount)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Tenor</p>
                <p className="text-sm font-semibold text-slate-900">
                  {customerInfo.tenure} months
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Repayment Plan</p>
                <p className="text-xs text-slate-700 uppercase">{loan.repaymentPlan}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* C. Committee Decision Table — EXACT Excel format                 */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Approval Committee&apos;s Decision
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {summary.decisionCount}/{summary.totalLevels} levels · {summary.progressPercent}%
            </Badge>
            {summary.latestDecisionType && (
              <Badge
                variant="outline"
                className={cn('text-[10px] capitalize', DECISION_BADGE[summary.latestDecisionType])}
              >
                Latest: {summary.latestDecisionType}
              </Badge>
            )}
          </div>
        </div>

        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border-t border-slate-100">
          <table className="w-full text-xs min-w-[1100px]">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold w-10">S/N</th>
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Designation</th>
                <th className="px-3 py-2 font-semibold text-right">Amount</th>
                <th className="px-3 py-2 font-semibold text-right">Duration</th>
                <th className="px-3 py-2 font-semibold text-right">CCD %</th>
                <th className="px-3 py-2 font-semibold text-right">Upfront Fee %</th>
                <th className="px-3 py-2 font-semibold text-right">Interest Rate %</th>
                <th className="px-3 py-2 font-semibold">Other Comment</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold text-center">Signature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {committeeTable.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-slate-400">
                    <Gavel className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    No committee rows available.
                  </td>
                </tr>
              ) : (
                committeeTable.map((row) => {
                  const d = row.decision;
                  const status = row.status || 'pending';
                  return (
                    <tr
                      key={row.roleCode}
                      className={cn(DECISION_ROW_BG[status] || 'hover:bg-slate-50')}
                    >
                      <td className="px-3 py-2 text-slate-400 font-mono">{row.sn}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {d ? d.name : <span className="text-slate-400 italic">{row.defaultName}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">
                          {row.designation}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-900">
                        {d && d.amount != null ? fmtNaira(d.amount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {d && d.duration ? `${d.duration}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {d && d.ccdPercentage != null ? fmtPct(d.ccdPercentage) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {d && d.upfrontFeePercentage != null ? fmtPct(d.upfrontFeePercentage) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {d && d.interestRatePercentage != null ? fmtPct(d.interestRatePercentage) : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[220px]">
                        {d && d.comment ? (
                          <p className="truncate" title={d.comment}>{d.comment}</p>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                        <span
                          className={cn(
                            'mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold border capitalize',
                            DECISION_BADGE[status]
                          )}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 text-[10px] whitespace-nowrap">
                        {d ? fmtDate(d.decisionDate) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {status === 'approved' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 inline" />
                        ) : status === 'rejected' ? (
                          <XCircle className="h-5 w-5 text-red-500 inline" />
                        ) : status === 'deferred' ? (
                          <Clock className="h-5 w-5 text-amber-500 inline" />
                        ) : status === 'conditional' ? (
                          <AlertCircle className="h-5 w-5 text-blue-500 inline" />
                        ) : (
                          <span className="text-slate-300 text-[9px] uppercase">Pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with CREDIT CERTIFIED STAMP */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="text-[10px] text-slate-500">
            Last decision: {fmtDateTime(summary.latestDecisionDate)}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 border border-dashed border-slate-300 rounded px-3 py-1.5">
            <Stamp className="h-3.5 w-3.5 text-slate-400" />
            Credit Certified Stamp
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Summary cards (4) + rates (3)                                    */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-slate-500" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Initial Request
            </p>
          </div>
          <p className="text-xl font-bold text-slate-900">{fmtNaira(summary.initialAmount)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Customer ask at origination</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Final MCC Amount
            </p>
          </div>
          <p className="text-xl font-bold text-emerald-700">{fmtNaira(summary.finalAmount)}</p>
          <p
            className={cn(
              'text-[10px] font-semibold mt-1',
              summary.amountChangePercent > 0
                ? 'text-emerald-600'
                : summary.amountChangePercent < 0
                  ? 'text-red-600'
                  : 'text-slate-500'
            )}
          >
            {summary.amountChangePercent > 0 ? '▲' : summary.amountChangePercent < 0 ? '▼' : '·'}{' '}
            {Math.abs(summary.amountChangePercent)}% change
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gavel className="h-4 w-4 text-amber-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Approval Progress
            </p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {summary.decisionCount}
            <span className="text-sm text-slate-500">/{summary.totalLevels}</span>
          </p>
          <Progress
            value={summary.progressPercent}
            className={cn('mt-2 h-1.5', summary.isComplete ? '[&_>div]:bg-emerald-500' : '[&_>div]:bg-amber-500')}
          />
          <p className="text-[10px] text-slate-500 mt-1">{summary.progressPercent}% complete</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Status
            </p>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {summary.isComplete
              ? 'COMPLETE'
              : (summary.latestDecisionType || 'PENDING').toUpperCase()}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">{fmtDateTime(summary.latestDecisionDate)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-emerald-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">CCD %</p>
          </div>
          <p className="text-2xl font-bold text-emerald-700">
            {summary.latestRates.ccd != null ? fmtPct(summary.latestRates.ccd) : '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Capital Contribution Deposit</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-blue-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Upfront Fee %</p>
          </div>
          <p className="text-2xl font-bold text-blue-700">
            {summary.latestRates.upfront != null ? fmtPct(summary.latestRates.upfront) : '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">One-time origination fee</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="h-4 w-4 text-amber-600" />
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Interest Rate %</p>
          </div>
          <p className="text-2xl font-bold text-amber-700">
            {summary.latestRates.interest != null ? fmtPct(summary.latestRates.interest) : '—'}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Per annum (p.a.)</p>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* D. Conditions Precedent to Drawdown — EXACT Excel checklist      */}
      {/* ---------------------------------------------------------------- */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900 uppercase">
              Loan Check-List — Conditions Precedent to Drawdown
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {verifiedCount} of {CP_CHECKLIST_TOTAL} documents verified
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] capitalize',
                checklist.internalControlStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : checklist.internalControlStatus === 'rejected'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
              )}
            >
              IC: {checklist.internalControlStatus}
            </Badge>
          </div>
        </div>

        <div className="px-5 pb-3">
          <Progress
            value={verifiedPct}
            className={cn(
              'h-2',
              checklist.internalControlStatus === 'verified'
                ? '[&_>div]:bg-emerald-500'
                : checklist.internalControlStatus === 'rejected'
                  ? '[&_>div]:bg-red-500'
                  : '[&_>div]:bg-amber-500'
            )}
          />
          <p className="text-[10px] text-slate-500 mt-1">
            {verifiedPct}% complete · Please TICK the provided box · TO BE COMPLETED
          </p>
        </div>

        {/* Checklist grid — 3 sub-sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border-t border-slate-200">
          {/* 1. VEHICLE PAPERS PROVIDED */}
          <ChecklistSection
            title="1. VEHICLE PAPERS PROVIDED"
            icon={<Car className="h-4 w-4 text-slate-600" />}
            items={checklist.checklist.vehiclePapers}
            canEdit={canVerifyChecklist}
            togglingId={togglingId}
            onToggle={toggleItem}
            showSatisfaction={false}
          />

          {/* 2. LEGAL MORTGAGE PROVIDED — has SATISFACTION column */}
          <ChecklistSection
            title="2. LEGAL MORTGAGE PROVIDED"
            icon={<Home className="h-4 w-4 text-slate-600" />}
            items={checklist.checklist.legalMortgage}
            canEdit={canVerifyChecklist}
            togglingId={togglingId}
            onToggle={toggleItem}
            showSatisfaction
          />

          {/* 3. LOAN SUPPORT DOCUMENT */}
          <ChecklistSection
            title="3. LOAN SUPPORT DOCUMENT"
            icon={<FileText className="h-4 w-4 text-slate-600" />}
            items={checklist.checklist.loanSupport}
            canEdit={canVerifyChecklist}
            togglingId={togglingId}
            onToggle={toggleItem}
            showSatisfaction={false}
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="text-[10px] text-slate-500">
            {checklist.internalControlVerifiedAt
              ? `Verified ${fmtDateTime(checklist.internalControlVerifiedAt)}${
                  checklist.internalControlOfficer ? ` by ${checklist.internalControlOfficer}` : ''
                }`
              : 'Not yet verified by Internal Control'}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-500 border border-dashed border-slate-300 rounded px-3 py-1.5">
            <Stamp className="h-3.5 w-3.5 text-slate-400" />
            Credit Certified Stamp
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* E. Internal Control Verification Section                         */}
      {/* ---------------------------------------------------------------- */}
      {icVisible && (
        <Card className="p-5 border-2 border-emerald-200">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase">
                  Internal Control Verification
                </h3>
                <p className="text-[10px] text-slate-500">
                  Conditions precedent gate · required after MD approval and before disbursement
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'capitalize text-[10px]',
                checklist.internalControlStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : checklist.internalControlStatus === 'rejected'
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
              )}
            >
              {checklist.internalControlStatus}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Officer</p>
              <p className="text-sm font-semibold text-slate-900">
                {checklist.internalControlOfficer || '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Verified At</p>
              <p className="text-sm font-semibold text-slate-900">
                {fmtDateTime(checklist.internalControlVerifiedAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Verification Status</p>
              <p
                className={cn(
                  'text-sm font-semibold capitalize',
                  checklist.internalControlStatus === 'verified'
                    ? 'text-emerald-700'
                    : checklist.internalControlStatus === 'rejected'
                      ? 'text-red-700'
                      : 'text-amber-700'
                )}
              >
                {checklist.internalControlStatus}
              </p>
            </div>
          </div>

          {checklist.internalControlNotes && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Notes</p>
              <p className="text-xs text-slate-700 mt-1">{checklist.internalControlNotes}</p>
            </div>
          )}

          {/* Verification progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Documents Verified
              </p>
              <p className="text-xs font-bold text-slate-900">
                {verifiedCount} / {CP_CHECKLIST_TOTAL}
              </p>
            </div>
            <Progress
              value={verifiedPct}
              className={cn(
                'h-2',
                checklist.internalControlStatus === 'verified'
                  ? '[&_>div]:bg-emerald-500'
                  : checklist.internalControlStatus === 'rejected'
                    ? '[&_>div]:bg-red-500'
                    : '[&_>div]:bg-amber-500'
              )}
            />
          </div>

          {/* Action buttons — only for Internal Control officers when not yet verified */}
          {canVerifyChecklist && checklist.internalControlStatus === 'pending' && (
            <div className="mt-4 flex flex-col md:flex-row gap-2 md:items-center md:justify-end">
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setRejectOpen(true)}
                disabled={icSubmitting}
              >
                <ShieldAlert className="h-4 w-4 mr-1" /> Reject Conditions
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setVerifyAllOpen(true)}
                disabled={icSubmitting || verifiedCount < CP_CHECKLIST_TOTAL}
                title={
                  verifiedCount < CP_CHECKLIST_TOTAL
                    ? `Verify all ${CP_CHECKLIST_TOTAL} documents first (${verifiedCount}/${CP_CHECKLIST_TOTAL} done)`
                    : 'Verify all conditions and advance to disbursement'
                }
              >
                <FileCheck className="h-4 w-4 mr-1" /> Verify All Conditions
              </Button>
            </div>
          )}

          {checklist.internalControlStatus === 'verified' && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-xs text-emerald-700">
                All conditions precedent to drawdown verified. Loan has been advanced to the
                Disbursement step (CFO_DISBURSEMENT).
              </p>
            </div>
          )}

          {checklist.internalControlStatus === 'rejected' && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              <p className="text-xs text-red-700">
                Conditions rejected by Internal Control. Loan returned to MD_APPROVAL for
                re-deliberation.
              </p>
            </div>
          )}

          {/* Permission notice */}
          {!canVerifyChecklist && checklist.internalControlStatus === 'pending' && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-slate-500" />
              <p className="text-xs text-slate-600">
                Only Internal Control officers can verify these conditions. Contact the Internal
                Control unit to clear this loan for disbursement.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* F. Decision Recording Modal                                      */}
      {/* ---------------------------------------------------------------- */}
      <DecisionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        loanId={loanId}
        applicationRef={loan.applicationRef}
        adminMccCode={adminMccCode}
        adminMccMeta={adminMccMeta}
        currentAdmin={currentAdmin}
        onRecorded={() => {
          setModalOpen(false);
          fetchData();
        }}
      />

      {/* Verify All dialog */}
      <AlertDialog open={verifyAllOpen} onOpenChange={setVerifyAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-emerald-600" />
              Verify All Conditions Precedent
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all {CP_CHECKLIST_TOTAL} checklist items as verified, stamp the
              audit-passed timestamp, and advance loan <span className="font-mono">{loan.applicationRef}</span>{' '}
              to the Disbursement step (CFO_DISBURSEMENT). This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ic-notes">Verification Notes (optional)</Label>
            <Textarea
              id="ic-notes"
              value={icNotes}
              onChange={(e) => setIcNotes(e.target.value)}
              placeholder="e.g. All documents physically sighted and verified at the branch..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={icSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVerifyAll}
              disabled={icSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {icSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Verify & Advance to Disbursement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Reject Conditions Precedent
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will return loan <span className="font-mono">{loan.applicationRef}</span> to
              MD_APPROVAL for re-deliberation. A reason is required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason for rejection *</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Valuation report expired, insurance lapsed, C of O not sighted..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={icSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={icSubmitting || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {icSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject & Return to MD
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// Checklist Section component — renders one sub-section (vehicle / legal / support)
// ============================================================================

interface ChecklistSectionProps {
  title: string;
  icon: React.ReactNode;
  items: ChecklistItem[];
  canEdit: boolean;
  togglingId: string | null;
  onToggle: (item: ChecklistItem) => void;
  showSatisfaction: boolean;
}

function ChecklistSection({
  title,
  icon,
  items,
  canEdit,
  togglingId,
  onToggle,
  showSatisfaction,
}: ChecklistSectionProps) {
  const verifiedCount = items.filter((i) => i.verified).length;
  return (
    <div className="border-b lg:border-b-0 lg:border-r border-slate-200 last:border-r-0">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider truncate">
            {title}
          </h4>
        </div>
        <Badge variant="outline" className="text-[9px] shrink-0">
          {verifiedCount}/{items.length}
        </Badge>
      </div>
      <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {showSatisfaction ? (
          // Header row for satisfaction column (only for LEGAL MORTGAGE)
          <div className="grid grid-cols-[auto_1fr_90px] gap-2 px-4 py-1.5 bg-slate-50/50 text-[9px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
            <div className="w-5">Tick</div>
            <div>Document</div>
            <div className="text-right">Satisfaction</div>
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-[10px] text-slate-400">No items</div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className={cn(
                'grid gap-2 px-4 py-2 items-center',
                showSatisfaction
                  ? 'grid-cols-[auto_1fr_90px]'
                  : 'grid-cols-[auto_1fr]'
              )}
            >
              <div className="w-5">
                {canEdit ? (
                  <Checkbox
                    id={`cp-${item.id}`}
                    checked={item.verified}
                    onCheckedChange={() => onToggle(item)}
                    disabled={togglingId === item.id}
                    className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                ) : item.verified ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <div className="h-4 w-4 rounded border border-slate-300" />
                )}
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={`cp-${item.id}`}
                  className={cn(
                    'text-xs block',
                    item.verified ? 'text-slate-900 font-medium' : 'text-slate-600'
                  )}
                >
                  <span className="text-slate-400 mr-1.5 font-mono text-[10px]">
                    {String.fromCharCode(97 + idx)})
                  </span>
                  {item.label}
                </label>
                {item.verified && item.verifiedAt && (
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {new Date(item.verifiedAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
              {showSatisfaction ? (
                <div className="text-right text-[10px] text-slate-600 truncate" title={item.satisfaction || ''}>
                  {item.verified ? (item.satisfaction || 'Satisfactory') : '—'}
                </div>
              ) : null}
              {togglingId === item.id && (
                <div className="col-span-full">
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Decision Recording Modal
// ============================================================================

interface DecisionModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loanId: string;
  applicationRef: string | null;
  adminMccCode: string | null;
  adminMccMeta: { code: string; level: number; label: string } | null;
  currentAdmin: any;
  onRecorded: () => void;
}

function DecisionModal({
  open,
  onOpenChange,
  loanId,
  applicationRef,
  adminMccCode,
  adminMccMeta,
  currentAdmin,
  onRecorded,
}: DecisionModalProps) {
  const [recommendedAmount, setRecommendedAmount] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [ccdPercentage, setCcdPercentage] = useState<string>('');
  const [upfrontFeePercentage, setUpfrontFeePercentage] = useState<string>('');
  const [interestRatePercentage, setInterestRatePercentage] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [decisionType, setDecisionType] = useState<string>('approved');
  const [conditions, setConditions] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setRecommendedAmount('');
      setDuration('');
      setCcdPercentage('');
      setUpfrontFeePercentage('');
      setInterestRatePercentage('');
      setComment('');
      setDecisionType('approved');
      setConditions(['']);
      setSubmitError(null);
    }
  }, [open]);

  const handleAddCondition = () => setConditions((c) => [...c, '']);
  const handleRemoveCondition = (i: number) =>
    setConditions((c) => c.filter((_, idx) => idx !== i));
  const handleChangeCondition = (i: number, v: string) =>
    setConditions((c) => c.map((val, idx) => (idx === i ? v : val)));

  const handleSubmit = async () => {
    if (!currentAdmin) {
      setSubmitError('You must be logged in to record a decision.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: any = {
        approverId: currentAdmin.id,
        recommendedAmount: recommendedAmount ? Number(recommendedAmount) : null,
        duration: duration ? Number(duration) : null,
        ccdPercentage: ccdPercentage ? Number(ccdPercentage) : null,
        upfrontFeePercentage: upfrontFeePercentage ? Number(upfrontFeePercentage) : null,
        interestRatePercentage: interestRatePercentage ? Number(interestRatePercentage) : null,
        comment: comment || null,
        decisionType,
      };

      if (decisionType === 'conditional') {
        body.conditions = conditions.filter((c) => c.trim().length > 0);
        if (body.conditions.length === 0) {
          setSubmitError('Conditional decision requires at least one condition.');
          setSubmitting(false);
          return;
        }
      }

      const res = await authFetch(`/api/mcc/${loanId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Failed (${res.status})`);
      }
      onRecorded();
    } catch (e: any) {
      console.error('Decision submit error:', e);
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-amber-600" />
            Record MCC Decision
          </DialogTitle>
          <DialogDescription>
            Application <span className="font-mono">{applicationRef}</span> · This will be recorded
            in the immutable MCC ledger.
          </DialogDescription>
        </DialogHeader>

        {/* Current user role indicator */}
        <div
          className={cn(
            'rounded-md border p-3',
            adminMccCode
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          )}
        >
          <div className="flex items-center gap-2">
            <User className={cn('h-4 w-4', adminMccCode ? 'text-emerald-600' : 'text-amber-600')} />
            <p className="text-xs font-semibold text-slate-900">
              {currentAdmin?.firstName} {currentAdmin?.lastName}
            </p>
            {adminMccMeta ? (
              <Badge className="bg-emerald-600 text-white text-[9px]">
                {adminMccMeta.code} · Level {adminMccMeta.level}
              </Badge>
            ) : (
              <Badge className="bg-amber-600 text-white text-[9px]">No MCC role</Badge>
            )}
          </div>
          {adminMccMeta ? (
            <p className="text-[10px] text-slate-600 mt-1">
              Designation: {adminMccMeta.label}. Your decision will be recorded at approval level{' '}
              {adminMccMeta.level} of 8.
            </p>
          ) : (
            <p className="text-[10px] text-amber-700 mt-1">
              Your current role is not mapped to an MCC level. The decision will still be recorded
              but you may want to update your role assignment.
            </p>
          )}
        </div>

        {/* Decision Type */}
        <div className="space-y-2">
          <Label>Decision Type</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(['approved', 'rejected', 'deferred', 'conditional'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => setDecisionType(dt)}
                className={cn(
                  'rounded-md border px-3 py-2 text-xs font-medium capitalize transition-colors',
                  decisionType === dt
                    ? dt === 'approved'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : dt === 'rejected'
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : dt === 'deferred'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {dt}
              </button>
            ))}
          </div>
        </div>

        {/* Amount + Duration row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="recommended-amount">Recommended Amount (₦)</Label>
            <Input
              id="recommended-amount"
              type="number"
              value={recommendedAmount}
              onChange={(e) => setRecommendedAmount(e.target.value)}
              placeholder="e.g. 2500000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (months)</Label>
            <Input
              id="duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 12"
            />
          </div>
        </div>

        {/* Rate row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label htmlFor="ccd">CCD %</Label>
            <Input
              id="ccd"
              type="number"
              step="0.1"
              value={ccdPercentage}
              onChange={(e) => setCcdPercentage(e.target.value)}
              placeholder="10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upfront">Upfront Fee %</Label>
            <Input
              id="upfront"
              type="number"
              step="0.1"
              value={upfrontFeePercentage}
              onChange={(e) => setUpfrontFeePercentage(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interest">Interest % p.a.</Label>
            <Input
              id="interest"
              type="number"
              step="0.1"
              value={interestRatePercentage}
              onChange={(e) => setInterestRatePercentage(e.target.value)}
              placeholder="24"
            />
          </div>
        </div>

        {/* Comment */}
        <div className="space-y-2">
          <Label htmlFor="comment">Comment / Justification</Label>
          <Textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Approved based on strong cashflow, verified stock value and clean BVN history..."
            rows={3}
          />
        </div>

        {/* Conditions (only if conditional) */}
        {decisionType === 'conditional' && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-blue-700">Compliance Conditions</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddCondition}
                className="h-7"
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-slate-500">
              Each condition will be created as a high-priority compliance item with a 7-day
              deadline. Customer will be notified to satisfy these before disbursement.
            </p>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={c}
                    onChange={(e) => handleChangeCondition(i, e.target.value)}
                    placeholder={`Condition #${i + 1} — e.g. "BVN verification required"`}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleRemoveCondition(i)}
                    disabled={conditions.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            {submitError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Recording...
              </>
            ) : (
              <>
                <Gavel className="h-4 w-4 mr-1" /> Record Decision
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

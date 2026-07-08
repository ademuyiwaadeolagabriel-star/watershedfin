'use client';
import { authFetch } from '@/lib/auth-client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import {
  LOAN_STEP_LABELS, LOAN_STATUS_LABELS, LOAN_STATUS_BADGES,
  MCC_ROLES, MCC_DECISION_TYPES, COMPLIANCE_STATUS_LABELS,
  SNAPSHOT_LABELS, hasPermission, STEP_PERMISSIONS,
} from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft, User, Building2, Wallet, Calendar, FileText, Gavel,
  ShieldCheck, CheckCircle2, XCircle, Clock, GitBranch, MapPin,
  AlertTriangle, TrendingUp, Lock, History, Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoanDetailSkeleton } from '@/components/ui/skeleton';

export function LoanDetailView() {
  const { viewParams, setView, currentAdmin } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [loan, setLoan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!loanId) return;
      try {
        const res = await authFetch(`/api/loans/${loanId}`);
        const data = await res.json();
        setLoan(data.loan);
      } catch (e) {
        console.error('Loan detail error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [loanId]);

  if (loading) {
    return <LoanDetailSkeleton />;
  }
  if (!loan) {
    return <div className="p-6 text-center text-red-500">Loan not found.</div>;
  }

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: Date | string | null) => d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d: Date | string | null) => d ? new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // Compute snapshot states
  const snapshots = loan.appraisal ? [
    { key: 'loSnapshot', label: 'LO', data: loan.appraisal.loSnapshot, role: 'Loan Officer', icon: User },
    { key: 'bmSnapshot', label: 'BM', data: loan.appraisal.bmSnapshot, role: 'Branch Manager', icon: MapPin },
    { key: 'analystSnapshot', label: 'CA', data: loan.appraisal.analystSnapshot, role: 'Credit Analyst', icon: TrendingUp },
    { key: 'hocSnapshot', label: 'HOC', data: loan.appraisal.hocSnapshot, role: 'Head of Credit', icon: GitBranch },
    { key: 'croSnapshot', label: 'CRO', data: loan.appraisal.croSnapshot, role: 'Chief Risk Officer', icon: ShieldCheck },
    { key: 'cfoSnapshot', label: 'CFO', data: loan.appraisal.cfoSnapshot, role: 'CFO', icon: Wallet },
    { key: 'legalSnapshot', label: 'LEGAL', data: loan.appraisal.legalSnapshot, role: 'Legal', icon: Lock },
    { key: 'mdSnapshot', label: 'MD', data: loan.appraisal.mdSnapshot, role: 'MD', icon: Gavel },
  ] : [];

  const workflowProgress = (() => {
    const steps = Object.keys(LOAN_STEP_LABELS);
    const idx = steps.indexOf(loan.currentStep);
    return { current: idx, total: steps.length, pct: ((idx + 1) / steps.length) * 100 };
  })();

  // Determine which action button to show based on current step + role
  const canActOnCurrentStep = (() => {
    if (!currentAdmin) return false;
    if (currentAdmin.role === 'super') return true;
    // Use the full STEP_PERMISSIONS map from constants
    const perm = STEP_PERMISSIONS[loan.currentStep];
    if (!perm) return false;
    return hasPermission(currentAdmin, perm) || (currentAdmin as any)[perm] === true;
  })();

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setView('loan-origination')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">{loan.applicationRef}</h1>
            <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-semibold', LOAN_STATUS_BADGES[loan.status])}>
              {LOAN_STATUS_LABELS[loan.status]}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
              {LOAN_STEP_LABELS[loan.currentStep]}
            </span>
            {loan.defaulter && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                DEFAULTER
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Created {fmtDate(loan.createdAt)} · Last updated {fmtDate(loan.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canActOnCurrentStep && (
            <Button onClick={() => setView('cam', { loanId: loan.id })} className="bg-emerald-600 hover:bg-emerald-700">
              Open CAM Workspace
            </Button>
          )}
          {canActOnCurrentStep && loan.status !== 'declined' && loan.status !== 'paid' && (
            <WorkflowActions loan={loan} adminId={currentAdmin?.id} onDone={() => window.location.reload()} />
          )}
        </div>
      </div>

      {/* BVN Verification Panel (Loan Officer) */}
      {loan.currentStep && ['LO_ENTRY', 'LO_ASSESSMENT'].includes(loan.currentStep) && currentAdmin && (
        (currentAdmin.role === 'loan' || currentAdmin.role === 'super' || currentAdmin.loanOrigination) && (
          <BvnVerificationPanel loan={loan} adminId={currentAdmin.id} onDone={() => window.location.reload()} />
        )
      )}

      {/* CAC Verification Panel (Legal) */}
      {loan.currentStep === 'LEGAL_CAC_CHECK' && currentAdmin && (
        (currentAdmin.role === 'legal' || currentAdmin.role === 'super' || currentAdmin.loanLegal) && (
          <CacVerificationPanel loan={loan} adminId={currentAdmin.id} onDone={() => window.location.reload()} />
        )
      )}

      {/* Workflow progress bar */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700">Workflow Progress</p>
          <p className="text-xs text-slate-500">
            Step {workflowProgress.current + 1} of {workflowProgress.total} ·{' '}
            <span className="font-semibold text-emerald-700">{Math.round(workflowProgress.pct)}%</span>
          </p>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all"
            style={{ width: `${workflowProgress.pct}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(LOAN_STEP_LABELS).map(([step, label], idx) => {
            const isCurrent = step === loan.currentStep;
            const isPast = idx < workflowProgress.current;
            const isFuture = idx > workflowProgress.current;
            return (
              <span
                key={step}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[9px] font-medium',
                  isCurrent && 'bg-emerald-600 text-white',
                  isPast && 'bg-emerald-100 text-emerald-700',
                  isFuture && 'bg-slate-100 text-slate-400'
                )}
                title={label}
              >
                {label}
              </span>
            );
          })}
        </div>
      </Card>

      {/* Top grid: Borrower + Loan terms + Triple Lock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Borrower */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Borrower</h3>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
              {loan.user?.firstName?.[0]}{loan.user?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {loan.user?.firstName} {loan.user?.lastName}
              </p>
              <p className="text-xs text-slate-500 truncate">{loan.user?.email}</p>
            </div>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Business</dt>
              <dd className="font-medium text-slate-900 truncate ml-2">{loan.user?.business?.name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">BVN</dt>
              <dd className="font-mono text-slate-900">{loan.user?.bvn || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Account No.</dt>
              <dd className="font-mono text-slate-900">{loan.user?.accountNumber || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">KYC Status</dt>
              <dd>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  loan.user?.kycStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                )}>
                  {loan.user?.kycStatus || '—'}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Loan Officer</dt>
              <dd className="font-medium text-slate-900 truncate ml-2">
                {loan.loanOfficer ? `${loan.loanOfficer.firstName} ${loan.loanOfficer.lastName}` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Branch</dt>
              <dd className="font-medium text-slate-900">{loan.branch?.name || '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Loan Terms */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Loan Terms</h3>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between items-baseline">
              <dt className="text-slate-500">Requested Amount</dt>
              <dd className="text-sm font-bold text-slate-900">{fmtNaira(loan.amount)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-slate-500">Vetted Amount</dt>
              <dd className="text-sm font-semibold text-slate-700">{fmtNaira(loan.vettedAmount || 0)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-slate-500">Structured Amount</dt>
              <dd className="text-sm font-semibold text-slate-700">{fmtNaira(loan.structuredAmount || 0)}</dd>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
              <dt className="text-slate-700 font-semibold">Final Amount</dt>
              <dd className="text-sm font-bold text-emerald-700">{fmtNaira(loan.finalAmount || loan.approvedAmount || 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Duration</dt>
              <dd className="font-medium text-slate-900">{loan.finalTenure || loan.approvedTenor || loan.duration} months</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Interest Rate</dt>
              <dd className="font-medium text-slate-900">{loan.finalInterestRate || loan.percent || 0}% p.a.</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">CCD Fee</dt>
              <dd className="font-medium text-slate-900">{loan.finalCcdFeePercent || 0}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Upfront Fee</dt>
              <dd className="font-medium text-slate-900">{loan.finalUpfrontFeePercent || 0}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Repayment</dt>
              <dd className="font-medium text-slate-900">{loan.repaymentPlan || 'REDUCING'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Purpose</dt>
              <dd className="font-medium text-slate-900 text-right max-w-[60%] truncate">{loan.reason || '—'}</dd>
            </div>
          </dl>
        </Card>

        {/* Triple Lock / Approval Status */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">Approval Status</h3>
          </div>
          <div className="space-y-2">
            {[
              { label: 'BM Vetting', done: !!loan.bmVerifiedAt, at: loan.bmVerifiedAt, by: loan.bmValidatedBy },
              { label: 'HOC Structuring', done: !!loan.hocStructuredAt, at: loan.hocStructuredAt },
              { label: 'Analyst Review', done: !!loan.analystReviewedAt, at: loan.analystReviewedAt },
              { label: 'Risk Approval', done: !!loan.riskApprovedAt, at: loan.riskApprovedAt },
              { label: 'CFO Clearance', done: !!loan.cfoClearedAt, at: loan.cfoClearedAt },
              { label: 'Legal Cleared', done: !!loan.legalClearedAt, at: loan.legalClearedAt },
              { label: 'MD Sanctioned', done: !!loan.mdApprovedAt, at: loan.mdApprovedAt },
              { label: 'Offer Generated', done: !!loan.offerLetterGeneratedAt, at: loan.offerLetterGeneratedAt },
              { label: 'Audit Passed', done: !!loan.auditPassedAt, at: loan.auditPassedAt },
              { label: 'Disbursed', done: !!loan.disbursedAt, at: loan.disbursedAt },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                {s.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                )}
                <span className={s.done ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                  {s.label}
                </span>
                {s.done && s.at && (
                  <span className="text-[10px] text-slate-400 ml-auto">{fmtDate(s.at)}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Snapshot Cascade */}
      {snapshots.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Snapshot Cascade</h3>
                <Badge variant="outline" className="text-[10px]">8 Gates</Badge>
                {loan.appraisal?.isSnapshotLocked && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">
                    <Lock className="h-2.5 w-2.5 mr-1" /> Locked
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Each governance tier freezes its view of the loan at decision time. Immutable audit trail.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {snapshots.map((s) => {
              const Icon = s.icon;
              const hasData = !!s.data;
              const parsed = hasData ? (() => { try { return JSON.parse(s.data); } catch { return null; } })() : null;
              const recAmount = parsed?.recommendation?.amount;
              return (
                <div
                  key={s.key}
                  className={cn(
                    'rounded-md border p-2.5 text-center',
                    hasData
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-slate-50'
                  )}
                >
                  <Icon className={cn('h-4 w-4 mx-auto mb-1', hasData ? 'text-emerald-600' : 'text-slate-300')} />
                  <p className={cn('text-[10px] font-bold', hasData ? 'text-emerald-700' : 'text-slate-400')}>
                    {s.label}
                  </p>
                  <p className="text-[9px] text-slate-500 truncate">{s.role}</p>
                  {hasData ? (
                    <p className="text-[10px] font-mono text-slate-700 mt-1">
                      {recAmount ? fmtNaira(recAmount) : '✓'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">—</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* MCC Decision Table */}
      {loan.mccDecisions && loan.mccDecisions.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gavel className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">MCC Decision Ledger</h3>
            <Badge variant="outline" className="text-[10px]">{loan.mccDecisions.length}/8 levels</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Approver</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold text-right">Amount</th>
                  <th className="px-3 py-2 font-semibold text-right">Tenor</th>
                  <th className="px-3 py-2 font-semibold text-right">Interest</th>
                  <th className="px-3 py-2 font-semibold text-right">CCD</th>
                  <th className="px-3 py-2 font-semibold text-right">Upfront</th>
                  <th className="px-3 py-2 font-semibold">Decision</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loan.mccDecisions.map((d: any) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 text-slate-400 font-mono">{d.approvalLevel}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{d.approverName}</td>
                    <td className="px-3 py-2 text-slate-600">{d.approverRole}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-900">{d.recommendedAmount ? fmtNaira(d.recommendedAmount) : '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{d.duration || '—'} mo</td>
                    <td className="px-3 py-2 text-right text-slate-700">{d.interestRatePercentage || '—'}%</td>
                    <td className="px-3 py-2 text-right text-slate-700">{d.ccdPercentage || '—'}%</td>
                    <td className="px-3 py-2 text-right text-slate-700">{d.upfrontFeePercentage || '—'}%</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                        d.decisionType === 'approved' && 'bg-emerald-100 text-emerald-700',
                        d.decisionType === 'rejected' && 'bg-red-100 text-red-700',
                        d.decisionType === 'deferred' && 'bg-amber-100 text-amber-700',
                        d.decisionType === 'conditional' && 'bg-blue-100 text-blue-700'
                      )}>
                        {d.decisionType}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-[10px]">{fmtDate(d.decisionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Compliance conditions + Pre-disbursement checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Compliance Conditions</h3>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {COMPLIANCE_STATUS_LABELS[loan.complianceStatus] || loan.complianceStatus}
            </Badge>
          </div>
          {loan.complianceConditions && loan.complianceConditions.length > 0 ? (
            <div className="space-y-2">
              {loan.complianceConditions.map((c: any) => (
                <div key={c.id} className="flex items-start gap-2 p-2 rounded-md border border-slate-200">
                  {c.status === 'verified' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  ) : c.status === 'rejected' ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900">{c.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {c.conditionType} · Priority: {c.priority}
                      {c.deadline && ` · Due: ${fmtDate(c.deadline)}`}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px]">{c.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-4 text-center">No compliance conditions set.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">Pre-Disbursement Checklist</h3>
          </div>
          {loan.preDisbursementChecklist ? (
            <div className="space-y-1.5">
              {[
                { k: 'allConditionsVerified', l: 'All Conditions Verified' },
                { k: 'documentsComplete', l: 'Documents Complete' },
                { k: 'customerKycValid', l: 'Customer KYC Valid' },
                { k: 'guarantorKycValid', l: 'Guarantor KYC Valid' },
                { k: 'collateralDocumented', l: 'Collateral Documented' },
                { k: 'offerLetterSigned', l: 'Offer Letter Signed' },
                { k: 'bankAccountVerified', l: 'Bank Account Verified' },
                { k: 'disbursementAccountConfirmed', l: 'Disbursement Account Confirmed' },
              ].map((item) => {
                const done = loan.preDisbursementChecklist[item.k];
                return (
                  <div key={item.k} className="flex items-center gap-2 text-xs">
                    <div className={cn('h-3.5 w-3.5 rounded flex items-center justify-center', done ? 'bg-emerald-500' : 'bg-slate-200')}>
                      {done && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <span className={done ? 'text-slate-900 font-medium' : 'text-slate-500'}>{item.l}</span>
                  </div>
                );
              })}
              <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="text-xs text-slate-500">Status:</span>
                <Badge variant="outline" className="text-[10px]">{loan.preDisbursementChecklist.status}</Badge>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-4 text-center">No checklist created yet.</p>
          )}
        </Card>
      </div>

      {/* Approval timeline */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">Approval Timeline</h3>
        </div>
        {loan.approvalLogs && loan.approvalLogs.length > 0 ? (
          <div className="space-y-2">
            {loan.approvalLogs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                <div className={cn(
                  'mt-1 h-2 w-2 rounded-full shrink-0',
                  log.action === 'APPROVED' ? 'bg-emerald-500' :
                  log.action === 'REJECTED' ? 'bg-red-500' :
                  log.action === 'QUERIED' ? 'bg-amber-500' :
                  log.action === 'FORWARDED' ? 'bg-blue-500' :
                  log.action === 'DISBURSED' ? 'bg-purple-500' :
                  'bg-slate-400'
                )} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-slate-900">
                      {log.admin ? `${log.admin.firstName} ${log.admin.lastName}` : 'System'}
                    </p>
                    <Badge variant="outline" className="text-[9px]">{log.action}</Badge>
                    {log.roleAtTimeOfAction && (
                      <span className="text-[10px] text-slate-500">{log.roleAtTimeOfAction}</span>
                    )}
                  </div>
                  {log.comments && (
                    <p className="text-xs text-slate-600 mt-0.5">{log.comments}</p>
                  )}
                  <p className="text-[10px] text-slate-400">{fmtDateTime(log.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-4 text-center">No approval events yet.</p>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// WORKFLOW ACTIONS — approve / return / query / reject buttons
// ============================================================================

function WorkflowActions({ loan, adminId, onDone }: { loan: any; adminId?: string; onDone: () => void }) {
  const [showDecision, setShowDecision] = useState(false);
  const [action, setAction] = useState<'forward' | 'return' | 'query' | 'reject' | 'disburse'>('forward');
  const [comment, setComment] = useState('');
  const [recommendedAmount, setRecommendedAmount] = useState(loan.finalAmount || loan.vettedAmount || loan.amount);
  const [duration, setDuration] = useState(loan.finalTenure || loan.vettedDuration || loan.duration);
  const [interestRate, setInterestRate] = useState(loan.finalInterestRate || loan.percent || 24);
  const [ccdPercentage, setCcdPercentage] = useState(loan.finalCcdFeePercent || 10);
  const [upfrontFeePercentage, setUpfrontFeePercentage] = useState(loan.finalUpfrontFeePercent || 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAction = async () => {
    if (!adminId) return;
    setLoading(true);
    setError('');
    try {
      const payload: any = {
        // A1 FIX: adminId comes from JWT token, not request body
        action,
        comment,
        mccDecision: action === 'forward' ? {
          recommendedAmount: Number(recommendedAmount),
          duration: Number(duration),
          interestRatePercentage: Number(interestRate),
          ccdPercentage: Number(ccdPercentage),
          upfrontFeePercentage: Number(upfrontFeePercentage),
          comment,
          decisionType: 'approved',
        } : undefined,
      };
      const res = await authFetch(`/api/loans/${loan.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      alert(`✅ ${data.action} — loan moved to ${data.newStep}`);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const isDisbursementStep = loan.currentStep === 'TREASURY_PAYOUT' || loan.currentStep === 'CFO_DISBURSEMENT';

  return (
    <>
      <Button onClick={() => setShowDecision(true)} variant="outline" size="sm">
        <Gavel className="h-4 w-4 mr-1" /> Take Action
      </Button>

      {showDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDecision(false)}>
          <Card className="max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Workflow Decision</h3>
                <p className="text-xs text-slate-500">Loan {loan.applicationRef} · Step: {loan.currentStep}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowDecision(false)}>✕</Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium">Action</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                  <button
                    onClick={() => setAction('forward')}
                    className={cn('rounded-md border px-3 py-2 text-xs font-medium', action === 'forward' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600')}
                  >
                    <CheckCircle2 className="h-4 w-4 mx-auto mb-1" /> Forward / Approve
                  </button>
                  <button
                    onClick={() => setAction('return')}
                    className={cn('rounded-md border px-3 py-2 text-xs font-medium', action === 'return' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600')}
                  >
                    <ArrowLeft className="h-4 w-4 mx-auto mb-1" /> Return
                  </button>
                  <button
                    onClick={() => setAction('query')}
                    className={cn('rounded-md border px-3 py-2 text-xs font-medium', action === 'query' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600')}
                  >
                    <AlertTriangle className="h-4 w-4 mx-auto mb-1" /> Query
                  </button>
                  <button
                    onClick={() => setAction('reject')}
                    className={cn('rounded-md border px-3 py-2 text-xs font-medium', action === 'reject' ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600')}
                  >
                    <XCircle className="h-4 w-4 mx-auto mb-1" /> Reject
                  </button>
                </div>
              </div>

              {action === 'forward' && (
                <div className="rounded-md bg-emerald-50 p-3 space-y-3">
                  <p className="text-xs font-semibold text-emerald-900">MCC Decision Terms (will be recorded in the ledger)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase">Recommended Amount (₦)</Label>
                      <Input type="number" value={recommendedAmount} onChange={(e) => setRecommendedAmount(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Duration (months)</Label>
                      <Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Interest Rate (%)</Label>
                      <Input type="number" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">CCD (%)</Label>
                      <Input type="number" value={ccdPercentage} onChange={(e) => setCcdPercentage(Number(e.target.value))} className="h-8" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase">Upfront Fee (%)</Label>
                      <Input type="number" value={upfrontFeePercentage} onChange={(e) => setUpfrontFeePercentage(Number(e.target.value))} className="h-8" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium">Comment / Justification</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Explain your decision..."
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setShowDecision(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={handleAction}
                  className={cn(
                    action === 'forward' && 'bg-emerald-600 hover:bg-emerald-700',
                    action === 'return' && 'bg-amber-600 hover:bg-amber-700',
                    action === 'query' && 'bg-blue-600 hover:bg-blue-700',
                    action === 'reject' && 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  {loading ? 'Processing...' : `Confirm ${action === 'forward' ? 'Forward' : action === 'return' ? 'Return' : action === 'query' ? 'Send Query' : 'Reject'}`}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// ============================================================================
// BVN VERIFICATION PANEL (Loan Officer)
// ============================================================================

function BvnVerificationPanel({ loan, adminId, onDone }: { loan: any; adminId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [notes, setNotes] = useState('');
  const bvn = loan.user?.bvn;
  const isVerified = loan.user?.bvnVerified;

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/loans/${loan.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, type: 'bvn', action: 'verify', notes: 'BVN verified externally' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('✅ BVN verified successfully!');
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/loans/${loan.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, type: 'bvn', action: 'reject', notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('❌ BVN rejected. Application returned to LO for correction.');
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 border-l-4 border-l-emerald-500">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-900">BVN Verification</h3>
        {isVerified ? (
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Verified</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Verify the customer's BVN ({bvn || '—'}) externally. After verification, confirm here.
        If the BVN is incorrect, reject to return the application to the customer.
      </p>
      {!isVerified && (
        <div className="flex gap-2">
          <Button onClick={handleVerify} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
            <CheckCircle2 className="h-4 w-4 mr-1" /> {loading ? 'Processing...' : 'BVN Verified Externally'}
          </Button>
          <Button onClick={() => setShowReject(!showReject)} variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
            <XCircle className="h-4 w-4 mr-1" /> Reject BVN
          </Button>
        </div>
      )}
      {showReject && (
        <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-200">
          <Label className="text-xs">Reason for BVN rejection</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. BVN does not match customer name..." className="mt-1" />
          <Button onClick={handleReject} disabled={loading || !notes} className="mt-2 bg-red-600 hover:bg-red-700" size="sm">
            Confirm Rejection
          </Button>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// CAC VERIFICATION PANEL (Legal)
// ============================================================================

function CacVerificationPanel({ loan, adminId, onDone }: { loan: any; adminId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [notes, setNotes] = useState('');
  const rcBnNumber = loan.user?.business?.rcBnNumber;
  const isVerified = loan.isCacVerified;

  const handleVerify = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/loans/${loan.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, type: 'cac', action: 'verify', notes: 'CAC verified externally' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('✅ CAC verified! Application forwarded to Branch Manager.');
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/loans/${loan.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, type: 'cac', action: 'reject', notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert('❌ CAC rejected. Application returned to Loan Officer.');
      onDone();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 border-l-4 border-l-purple-500">
      <div className="flex items-center gap-2 mb-3">
        <Scale className="h-4 w-4 text-purple-600" />
        <h3 className="text-sm font-bold text-slate-900">CAC Verification (Legal)</h3>
        {isVerified ? (
          <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> Verified</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Verify the company's CAC registration (RC/BN: {rcBnNumber || '—'}) externally.
        If verified, forward to Branch Manager. If invalid, reject back to Loan Officer.
      </p>
      {!isVerified && (
        <div className="flex gap-2">
          <Button onClick={handleVerify} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700" size="sm">
            <CheckCircle2 className="h-4 w-4 mr-1" /> {loading ? 'Processing...' : 'CAC Verified — Forward to BM'}
          </Button>
          <Button onClick={() => setShowReject(!showReject)} variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
            <XCircle className="h-4 w-4 mr-1" /> Reject — Return to LO
          </Button>
        </div>
      )}
      {showReject && (
        <div className="mt-3 p-3 rounded-md bg-red-50 border border-red-200">
          <Label className="text-xs">Reason for CAC rejection</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="e.g. RC number not found in CAC registry..." className="mt-1" />
          <Button onClick={handleReject} disabled={loading || !notes} className="mt-2 bg-red-600 hover:bg-red-700" size="sm">
            Confirm Rejection
          </Button>
        </div>
      )}
    </Card>
  );
}

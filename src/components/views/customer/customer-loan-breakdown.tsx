'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, FileText, CreditCard, Calendar, TrendingDown, Calculator,
  CheckCircle2, Clock, AlertCircle, Download, Receipt, ChevronRight,
  User, Building2, Wallet, Percent, ScrollText, Loader2, RotateCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOAN_STATUS_BADGES, LOAN_STATUS_LABELS, LOAN_STEP_LABELS } from '@/lib/constants';
import { fmtNaira, fmtDate } from '@/lib/loan-calc';

export function CustomerLoanBreakdown() {
  const { currentUser, viewParams, setView } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Restructuring state
  const [showRestructure, setShowRestructure] = useState(false);
  const [restructures, setRestructures] = useState<any[]>([]);
  const [reqType, setReqType] = useState<'extend_tenor' | 'reduce_payment' | 'grace_period'>('extend_tenor');
  const [reqTenor, setReqTenor] = useState<number>(0);
  const [reqReason, setReqReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restructureError, setRestructureError] = useState<string | null>(null);
  const [restructureSuccess, setRestructureSuccess] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!loanId || !currentUser) return;
      try {
        const res = await fetch(`/api/customer/loan/${loanId}/breakdown?userId=${currentUser.id}`);
        const d = await res.json();
        setData(d);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
    // Load restructuring history
    if (currentUser && loanId) {
      fetch(`/api/customer/restructure?userId=${currentUser.id}`)
        .then((r) => r.json())
        .then((d) => {
          const list = (d.requests || []).filter((r: any) => r.loanApplicantId === loanId);
          setRestructures(list);
        })
        .catch(() => {});
    }
  }, [loanId, currentUser]);

  const submitRestructure = async () => {
    if (!currentUser) return;
    if (!reqTenor || reqTenor <= 0) {
      setRestructureError('Please enter a valid requested tenor in months.');
      return;
    }
    if (!reqReason.trim()) {
      setRestructureError('A short reason is required.');
      return;
    }
    setSubmitting(true);
    setRestructureError(null);
    try {
      const res = await fetch('/api/customer/restructure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          loanId,
          requestType: reqType,
          requestedTenor: reqTenor,
          reason: reqReason.trim(),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to submit restructuring request');
      setShowRestructure(false);
      setReqType('extend_tenor');
      setReqTenor(0);
      setReqReason('');
      setRestructureSuccess(d.message || 'Restructuring request submitted successfully.');
      // Refresh list
      fetch(`/api/customer/restructure?userId=${currentUser.id}`)
        .then((r) => r.json())
        .then((d) => {
          const list = (d.requests || []).filter((r: any) => r.loanApplicantId === loanId);
          setRestructures(list);
        })
        .catch(() => {});
    } catch (e: any) {
      setRestructureError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-400">Loading loan breakdown...</div>;
  if (!data) return <div className="p-6 text-center text-red-500">Failed to load</div>;

  const { loan, calculation, summary, progress, totalPaid } = data;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{loan.applicationRef}</h1>
              <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-semibold', LOAN_STATUS_BADGES[loan.status])}>
                {LOAN_STATUS_LABELS[loan.status]}
              </span>
              <Badge variant="outline" className="text-[10px]">{loan.plan?.name || 'Loan'}</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Disbursed {fmtDate(loan.disbursedAt)} · {summary.tenorMonths} months · {summary.annualRate}% p.a.
            </p>
          </div>
          {loan.status === 'running' && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setView('customer-decision' as any, { loanId })}>
                <FileText className="h-4 w-4 mr-1" /> Decision Timeline
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setView('customer-pay-back' as any, { loanId })}>
                <CreditCard className="h-4 w-4 mr-1" /> Make Payment
              </Button>
            </div>
          )}
        </div>

        {/* Hero — loan overview */}
        <Card className="overflow-hidden border-0">
          <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-slate-900 text-white p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Principal</p>
                <p className="text-2xl font-bold">{fmtNaira(summary.principal)}</p>
              </div>
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Monthly Payment</p>
                <p className="text-2xl font-bold">{fmtNaira(summary.monthlyInstallment)}</p>
              </div>
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Outstanding Balance</p>
                <p className="text-2xl font-bold">{fmtNaira(progress.outstandingBalance)}</p>
              </div>
              <div>
                <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Next Payment Due</p>
                <p className="text-2xl font-bold">{progress.nextDue ? fmtDate(progress.nextDue.dueDate) : '—'}</p>
              </div>
            </div>
          </div>
          {loan.status === 'running' && (
            <div className="p-4 bg-white border-t border-slate-100">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-700">Repayment Progress</p>
                <p className="text-xs font-bold text-emerald-600">{progress.progressPercent.toFixed(0)}% ({progress.paidCount}/{progress.totalCount} payments)</p>
              </div>
              <Progress value={progress.progressPercent} className="h-2" />
              {progress.overdueCount > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>{progress.overdueCount} payment(s) overdue — please pay immediately to avoid penalties</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Loan terms breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Loan Terms</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Principal Amount" value={fmtNaira(summary.principal)} />
              <Row label="Interest Rate" value={`${summary.annualRate}% p.a.`} />
              <Row label="Monthly Interest Rate" value={`${(calculation.monthlyRate * 100).toFixed(3)}%`} />
              <Row label="Tenor" value={`${summary.tenorMonths} months`} />
              <Row label="Repayment Method" value={loan.repaymentPlan || 'REDUCING'} />
              <Row label="Monthly Installment" value={fmtNaira(summary.monthlyInstallment)} highlight />
              <Row label="Total Repayment" value={fmtNaira(summary.totalRepayment)} />
              <Row label="Total Interest" value={fmtNaira(summary.totalInterest)} />
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Fees & Disbursement</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Principal" value={fmtNaira(summary.principal)} />
              <Row label="Less: Upfront Fee" value={`- ${fmtNaira(summary.upfrontFeeAmount)}`} negative />
              <Row label="Less: CCD (Credit Confirmation Deposit)" value={`- ${fmtNaira(summary.ccdAmount)}`} negative />
              <Row label="Net Disbursement (what you received)" value={fmtNaira(summary.netDisbursement)} highlight />
              <div className="pt-2 border-t border-slate-100">
                <Row label="Total Cost of Credit" value={fmtNaira(summary.totalCostOfCredit)} />
                <Row label="Effective APR" value={`${summary.effectiveAPR.toFixed(2)}%`} />
              </div>
            </dl>
          </Card>
        </div>

        {/* Borrower + Loan Officer info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">Borrower</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Name" value={`${loan.user?.firstName} ${loan.user?.lastName}`} />
              <Row label="Account Number" value={loan.user?.accountNumber || '—'} mono />
              <Row label="BVN" value={loan.user?.bvn || '—'} mono />
              <Row label="Business" value={loan.user?.business?.name || '—'} />
              <Row label="Sector" value={loan.user?.business?.sector || '—'} />
              <Row label="Phone" value={loan.user?.phone || '—'} />
              <Row label="Email" value={loan.user?.email || '—'} />
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">Loan Officer & Branch</h3>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Loan Officer" value={loan.loanOfficer ? `${loan.loanOfficer.firstName} ${loan.loanOfficer.lastName}` : '—'} />
              <Row label="Branch" value={loan.branch?.name || '—'} />
              <Row label="Branch Code" value={loan.branch?.code || '—'} mono />
              <Row label="Application Ref" value={loan.applicationRef} mono />
              <Row label="Applied On" value={fmtDate(loan.createdAt)} />
              <Row label="Disbursed On" value={fmtDate(loan.disbursedAt)} />
              <Row label="Maturity Date" value={fmtDate(loan.maturityDate)} />
            </dl>
          </Card>
        </div>

        {/* Repayment schedule */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Repayment Schedule</h3>
            </div>
            <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" /> Download</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-[10px] uppercase text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Due Date</th>
                  <th className="px-3 py-2 text-right">Opening Balance</th>
                  <th className="px-3 py-2 text-right">Installment</th>
                  <th className="px-3 py-2 text-right">Interest</th>
                  <th className="px-3 py-2 text-right">Principal</th>
                  <th className="px-3 py-2 text-right">Closing Balance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calculation.schedule.map((row: any) => (
                  <tr key={row.month} className={cn(
                    row.status === 'paid' && 'bg-emerald-50/50',
                    row.status === 'overdue' && 'bg-red-50',
                  )}>
                    <td className="px-3 py-2 font-mono text-xs">{row.month}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(row.dueDate)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtNaira(row.openingBalance)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-bold">{fmtNaira(row.installment)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-amber-600">{fmtNaira(row.interest)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{fmtNaira(row.principal)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{fmtNaira(row.closingBalance)}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold',
                        row.status === 'paid' && 'bg-emerald-100 text-emerald-700',
                        row.status === 'overdue' && 'bg-red-100 text-red-700',
                        row.status === 'partial' && 'bg-amber-100 text-amber-700',
                        row.status === 'upcoming' && 'bg-slate-100 text-slate-600',
                      )}>
                        {row.status === 'paid' ? '✓ Paid' : row.status === 'overdue' ? 'Overdue' : row.status === 'partial' ? 'Partial' : 'Upcoming'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase">Total</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtNaira(summary.totalRepayment)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-amber-600">{fmtNaira(summary.totalInterest)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{fmtNaira(summary.principal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        {/* Collateral + Guarantor (from appraisal) */}
        {loan.appraisal && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <ScrollText className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-bold text-slate-900">Security & Collateral</h3>
            </div>
            <p className="text-xs text-slate-500">Collateral pledged as security for this loan</p>
            {loan.appraisal.loSnapshot ? (
              <div className="mt-2">
                {/* Try to parse loSnapshot for collateral data */}
                {(() => {
                  try {
                    const snap = JSON.parse(loan.appraisal.loSnapshot);
                    const collaterals = snap.formData?.collaterals || snap.security?.collaterals || [];
                    if (collaterals.length === 0) return <p className="text-xs text-slate-500 mt-2">No collateral details available</p>;
                    return (
                      <div className="overflow-x-auto mt-2">
                        <table className="w-full text-sm">
                          <thead><tr className="text-left text-[10px] uppercase text-slate-500">
                            <th className="px-2 py-1">Type</th>
                            <th className="px-2 py-1 text-right">Market Value</th>
                            <th className="px-2 py-1 text-right">FSV (80%)</th>
                          </tr></thead>
                          <tbody>
                            {collaterals.map((c: any, i: number) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="px-2 py-1.5 text-xs">{c.type}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtNaira(c.marketValue)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-xs">{fmtNaira(c.marketValue * (c.type === 'MOVABLE' ? 0.8 : c.type === 'IMMOVABLE' ? 0.6 : 1))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  } catch { return <p className="text-xs text-slate-500 mt-2">Collateral details recorded in CAM</p>; }
                })()}
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-2">Collateral details recorded in CAM</p>
            )}
          </Card>
        )}

        {/* Actions */}
        {loan.status === 'running' && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setView('customer-pay-back' as any, { loanId })} className="bg-emerald-600 hover:bg-emerald-700 flex-1">
              <CreditCard className="h-4 w-4 mr-1" /> Make a Payment
            </Button>
            <Button variant="outline" onClick={() => setView('customer-pay-back' as any, { loanId })} className="flex-1">
              <TrendingDown className="h-4 w-4 mr-1" /> Early Payoff Calculator
            </Button>
            <Button variant="outline" onClick={() => setView('customer-decision' as any, { loanId })} className="flex-1">
              <FileText className="h-4 w-4 mr-1" /> View Decision Timeline
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowRestructure(true);
                setRestructureError(null);
                setRestructureSuccess(null);
              }}
              className="flex-1 border-amber-400 text-amber-700 hover:bg-amber-50"
            >
              <RotateCw className="h-4 w-4 mr-1" /> Request Restructuring
            </Button>
          </div>
        )}

        {/* Restructuring history + success/error banners */}
        {restructureSuccess && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {restructureSuccess}
          </div>
        )}
        {restructures.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <RotateCw className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">Restructuring Requests</h3>
            </div>
            <div className="space-y-2">
              {restructures.map((r) => (
                <div key={r.id} className="p-3 rounded-md border border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          className={cn(
                            'text-[9px] px-1.5 py-0',
                            r.status === 'approved' && 'bg-emerald-100 text-emerald-700',
                            r.status === 'pending' && 'bg-amber-100 text-amber-700',
                            r.status === 'rejected' && 'bg-red-100 text-red-700',
                          )}
                        >
                          {r.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-semibold text-slate-900 capitalize">
                          {r.requestType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {r.currentTenor} → {r.requestedTenor} months
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{r.reason}</p>
                      {r.adminNotes && (
                        <p className="text-[10px] text-slate-500 mt-1 italic">
                          Admin notes: {r.adminNotes}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        Requested {new Date(r.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Restructuring dialog */}
        <Dialog open={showRestructure} onOpenChange={setShowRestructure}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RotateCw className="h-4 w-4 text-amber-600" /> Request Loan Restructuring
              </DialogTitle>
              <DialogDescription>
                Tell us how you&apos;d like to restructure this loan. Our team will review your request within 48 hours.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="req-type">Request Type</Label>
                <Select value={reqType} onValueChange={(v: any) => setReqType(v)}>
                  <SelectTrigger id="req-type">
                    <SelectValue placeholder="Pick a restructuring type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extend_tenor">Extend Tenor (lower monthly payment)</SelectItem>
                    <SelectItem value="reduce_payment">Reduce Payment (custom plan)</SelectItem>
                    <SelectItem value="grace_period">Grace Period (pause payments)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-tenor">Requested Tenor (months)</Label>
                <Input
                  id="req-tenor"
                  type="number"
                  min={1}
                  max={60}
                  value={reqTenor || ''}
                  onChange={(e) => setReqTenor(parseInt(e.target.value, 10) || 0)}
                  placeholder="e.g. 6"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-reason">Reason for Restructuring</Label>
                <Textarea
                  id="req-reason"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="Briefly explain why you need to restructure this loan — e.g. cashflow issue, medical emergency, delayed customer payments."
                  rows={4}
                />
              </div>
              {restructureError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {restructureError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRestructure(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={submitRestructure}
                disabled={submitting || !reqTenor || !reqReason.trim()}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4 mr-1" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function Row({ label, value, highlight, negative, mono }: { label: string; value: string; highlight?: boolean; negative?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={cn(
        'text-sm font-semibold',
        highlight && 'text-emerald-700 text-base font-bold',
        negative && 'text-red-600',
        !highlight && !negative && 'text-slate-900',
        mono && 'font-mono',
      )}>{value}</dd>
    </div>
  );
}

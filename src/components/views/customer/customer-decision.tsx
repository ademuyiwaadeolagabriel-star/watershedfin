'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, AlertCircle,
  User, Gavel, FileText, Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtNaira, fmtDate, fmtDateTime } from '@/lib/loan-calc';
import { authFetch } from '@/lib/auth-client';

export function CustomerDecisionTimeline() {
  const { currentUser, viewParams, setView } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!loanId || !currentUser) return;
      try {
        const res = await authFetch(`/api/customer/loan/${loanId}/decision?userId=${currentUser.id}`);
        const d = await res.json();
        setData(d);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [loanId, currentUser]);

  if (loading) return <div className="p-6 text-center text-slate-400">Loading decision timeline...</div>;
  if (!data) return <div className="p-6 text-center text-red-500">Failed to load</div>;

  const { loan, timeline, completedCount, progressPercent, logs, estimatedTimeRemaining } = data;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">Decision Timeline</h1>
            <p className="text-xs text-slate-500">{loan.applicationRef} · Submitted {fmtDate(loan.submittedAt || loan.disbursedAt)}</p>
          </div>
        </div>

        {/* Progress overview */}
        <Card className="p-5 bg-gradient-to-r from-emerald-700 to-slate-900 text-white border-0">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-emerald-200 text-xs uppercase tracking-wider mb-1">Approval Progress</p>
              <p className="text-3xl font-bold">{completedCount}/8 gates cleared</p>
              <p className="text-emerald-200 text-xs mt-1">{progressPercent.toFixed(0)}% complete</p>
            </div>
            <div className="text-right">
              <p className="text-emerald-200 text-xs uppercase tracking-wider mb-1">Estimated Time Remaining</p>
              <p className="text-xl font-bold">{estimatedTimeRemaining}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </Card>

        {/* 8-gate approval chain */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gavel className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">8-Level Approval Chain</h3>
            <Badge variant="outline" className="text-[10px]">Management Credit Committee</Badge>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Your application passes through 8 governance gates. Each approver reviews and records their decision before forwarding to the next level.
          </p>

          <div className="space-y-3">
            {timeline.map((gate: any, idx: number) => {
              const isDecided = gate.status === 'decided';
              const isPassed = gate.status === 'passed';
              const isCurrent = gate.status === 'current';
              const isPending = gate.status === 'pending';
              const d = gate.decision;

              return (
                <div key={gate.level} className="relative">
                  {/* Connecting line */}
                  {idx < timeline.length - 1 && (
                    <div className={cn(
                      'absolute left-5 top-12 w-0.5 h-full',
                      isDecided || isPassed ? 'bg-emerald-300' : 'bg-slate-200'
                    )} />
                  )}

                  <div className={cn(
                    'flex gap-3 p-3 rounded-md border',
                    isCurrent && 'border-emerald-400 bg-emerald-50',
                    isDecided && 'border-emerald-200 bg-emerald-50/50',
                    isPassed && 'border-slate-200 bg-slate-50',
                    isPending && 'border-slate-200',
                  )}>
                    {/* Status icon */}
                    <div className={cn(
                      'relative z-10 flex h-10 w-10 items-center justify-center rounded-full shrink-0',
                      isDecided && 'bg-emerald-500 text-white',
                      isPassed && 'bg-emerald-100 text-emerald-600',
                      isCurrent && 'bg-emerald-600 text-white ring-4 ring-emerald-200',
                      isPending && 'bg-slate-200 text-slate-400',
                    )}>
                      {isDecided || isPassed ? <CheckCircle2 className="h-5 w-5" /> :
                       isCurrent ? <Clock className="h-5 w-5 animate-pulse" /> :
                       <div className="text-xs font-bold">{gate.level}</div>}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {gate.label}
                            <span className="text-xs font-normal text-slate-500 ml-2">Level {gate.level}</span>
                          </p>
                          {isCurrent && (
                            <Badge className="bg-emerald-600 text-white text-[9px] mt-1">
                              <Clock className="h-2.5 w-2.5 mr-1" /> Currently Here
                            </Badge>
                          )}
                          {isPending && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting review</p>
                          )}
                        </div>
                        {d && (
                          <Badge className={cn(
                            'text-[9px]',
                            d.decisionType === 'approved' && 'bg-emerald-100 text-emerald-700',
                            d.decisionType === 'rejected' && 'bg-red-100 text-red-700',
                            d.decisionType === 'deferred' && 'bg-amber-100 text-amber-700',
                            d.decisionType === 'conditional' && 'bg-blue-100 text-blue-700',
                          )}>
                            {d.decisionType}
                          </Badge>
                        )}
                      </div>

                      {/* Decision details */}
                      {d && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {d.recommendedAmount && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase">Recommended</p>
                              <p className="font-semibold">{fmtNaira(d.recommendedAmount)}</p>
                            </div>
                          )}
                          {d.duration && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase">Tenor</p>
                              <p className="font-semibold">{d.duration} mo</p>
                            </div>
                          )}
                          {d.interestRate != null && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase">Interest</p>
                              <p className="font-semibold">{d.interestRate}%</p>
                            </div>
                          )}
                          {d.decisionDate && (
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase">Decided</p>
                              <p className="font-semibold">{fmtDate(d.decisionDate)}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {d?.comment && (
                        <p className="text-xs text-slate-600 mt-2 italic">"{d.comment}"</p>
                      )}

                      {d?.approverName && (
                        <p className="text-[10px] text-slate-500 mt-1">— {d.approverName} ({d.approverRole})</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Activity log */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Activity Log</h3>
          </div>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No activity yet</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-2.5 p-2 rounded-md hover:bg-slate-50">
                  <div className={cn(
                    'mt-1 h-2 w-2 rounded-full shrink-0',
                    log.action === 'APPROVED' || log.action === 'FORWARDED' ? 'bg-emerald-500' :
                    log.action === 'REJECTED' ? 'bg-red-500' :
                    log.action === 'QUERIED' ? 'bg-amber-500' :
                    log.action === 'DISBURSED' ? 'bg-purple-500' :
                    log.action === 'OFFER_ACCEPTED' ? 'bg-emerald-500' :
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
                    {log.comments && <p className="text-xs text-slate-600 mt-0.5">{log.comments}</p>}
                    <p className="text-[10px] text-slate-400">{fmtDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* What happens next */}
        <Card className="p-5 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-blue-900">What happens next?</h3>
              <p className="text-xs text-blue-700 mt-1">
                {completedCount >= 8
                  ? "Your loan has been fully approved! Check your dashboard for the offer letter."
                  : completedCount >= 4
                  ? "Your application is in the final stages. The remaining approvers will review and make a decision within 1-2 business days."
                  : "Your application is being reviewed by our credit team. This process typically takes 3-5 business days. You'll be notified at each step."
                }
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, FileText, CheckCircle2, Clock, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOAN_STATUS_BADGES, LOAN_STATUS_LABELS } from '@/lib/constants';
import { fmtNaira, fmtDate } from '@/lib/loan-calc';

export function CustomerHeader({ title, user, subtitle }: { title: string; user: any; subtitle?: string }) {
  const { setView } = useAppStore();
  return (
    <div className="mb-4 flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
        ← Dashboard
      </Button>
      <div className="flex-1">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

export function CustomerLoans() {
  const { currentUser, setView } = useAppStore();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!currentUser) return;
      try {
        const res = await fetch(`/api/customer/dashboard?userId=${currentUser.id}`);
        const d = await res.json();
        setLoans(d.loans || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [currentUser]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            ← Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">My Loans</h1>
            <p className="text-xs text-slate-500">{loans.length} loan(s) total</p>
          </div>
          <Button onClick={() => setView('customer-apply' as any)} className="bg-emerald-600 hover:bg-emerald-700">
            <ArrowRight className="h-4 w-4 mr-1" /> Apply
          </Button>
        </div>

        <Card className="p-5">
          {loading ? (
            <p className="text-xs text-slate-400 py-6 text-center">Loading...</p>
          ) : loans.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No loan applications yet</p>
              <Button onClick={() => setView('customer-apply' as any)} className="mt-3 bg-emerald-600 hover:bg-emerald-700">
                Apply for Your First Loan
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {loans.map((loan) => (
                <button
                  key={loan.id}
                  onClick={() => setView('customer-loan-breakdown' as any, { loanId: loan.id })}
                  className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 w-full text-left"
                >
                  <div className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
                    loan.status === 'running' ? 'bg-emerald-100 text-emerald-600' :
                    loan.status === 'paid' ? 'bg-green-100 text-green-600' :
                    loan.status === 'declined' ? 'bg-red-100 text-red-600' :
                    'bg-blue-100 text-blue-600'
                  )}>
                    {loan.status === 'running' ? <CheckCircle2 className="h-5 w-5" /> :
                     loan.status === 'declined' ? <XCircle className="h-5 w-5" /> :
                     <Clock className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{loan.applicationRef}</p>
                    <p className="text-xs text-slate-500">{loan.plan?.name || 'Loan'} · {fmtDate(loan.createdAt)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{fmtNaira(loan.approvedAmount || loan.amount)}</p>
                    <span className={cn('inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold', LOAN_STATUS_BADGES[loan.status])}>
                      {LOAN_STATUS_LABELS[loan.status]}
                    </span>
                  </div>
                  {loan.currentStep === 'CUSTOMER_ACCEPTANCE' && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px] shrink-0">OFFER READY →</Badge>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

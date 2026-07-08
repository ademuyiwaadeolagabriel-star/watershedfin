'use client';
import { authFetch } from '@/lib/auth-client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import {
  LOAN_STEP_LABELS, LOAN_STATUS_LABELS, LOAN_STATUS_BADGES, LOAN_STATUSES,
} from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Filter, FileText, ChevronLeft, ChevronRight, Eye, Calendar, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/skeleton';

interface LoanListItem {
  id: string;
  applicationRef: string | null;
  status: string;
  currentStep: string;
  amount: number;
  duration: number;
  createdAt: Date;
  user: { firstName: string; lastName: string; email: string | null; business: { name: string } | null } | null;
  plan: { name: string; interest: number } | null;
  branch: { name: string; code: string } | null;
}

interface LoanListViewProps {
  fixedStep?: string;
  fixedStatus?: string;
  title?: string;
}

export function LoanListView({ fixedStep, fixedStatus, title }: LoanListViewProps) {
  const { setView, viewParams, currentAdmin } = useAppStore();
  const [loans, setLoans] = useState<LoanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(fixedStatus || viewParams.status || 'all');
  const [stepFilter, setStepFilter] = useState<string>(fixedStep || viewParams.step || 'all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (stepFilter !== 'all') params.set('step', stepFilter);
        if (currentAdmin) {
          params.set('role', currentAdmin.role);
          // Only pass staffId for Loan Officer role (they only see their own)
          if (currentAdmin.role === 'loan') {
            params.set('staffId', currentAdmin.id);
          }
          // Only pass branchId for BM role (they only see their branch)
          if (currentAdmin.role === 'bm' && currentAdmin.branchId) {
            params.set('branchId', currentAdmin.branchId);
          }
        }
        const res = await authFetch(`/api/loans?${params.toString()}`);
        const data = await res.json();
        setLoans(data.loans || []);
      } catch (e) {
        console.error('Loan list error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [statusFilter, stepFilter, currentAdmin, viewParams.status, viewParams.step]);

  const filtered = useMemo(() => {
    if (!search) return loans;
    const q = search.toLowerCase();
    return loans.filter((l) => {
      return (
        l.applicationRef?.toLowerCase().includes(q) ||
        l.user?.firstName?.toLowerCase().includes(q) ||
        l.user?.lastName?.toLowerCase().includes(q) ||
        l.user?.email?.toLowerCase().includes(q) ||
        l.user?.business?.name?.toLowerCase().includes(q)
      );
    });
  }, [loans, search]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ref, customer name, email, business..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses</option>
              {Object.entries(LOAN_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="all">All Stages</option>
              {Object.entries(LOAN_STEP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Application</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Tenor</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6">
                    <TableSkeleton rows={5} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No loans match your filters.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((loan) => (
                  <tr
                    key={loan.id}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => setView('loan-detail', { loanId: loan.id })}
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-900">
                        {loan.applicationRef || '—'}
                      </p>
                      <p className="text-[10px] text-slate-500">{loan.plan?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                          {loan.user?.firstName?.[0]}{loan.user?.lastName?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {loan.user?.firstName} {loan.user?.lastName}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {loan.user?.business?.name || loan.user?.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-bold text-slate-900">{fmtNaira(loan.amount)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-700">{loan.duration} mo</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                        {LOAN_STEP_LABELS[loan.currentStep] || loan.currentStep}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-block rounded px-2 py-0.5 text-[10px] font-semibold', LOAN_STATUS_BADGES[loan.status])}>
                        {LOAN_STATUS_LABELS[loan.status] || loan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[11px] text-slate-600">{fmtDate(loan.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <p>Showing <span className="font-semibold text-slate-900">{filtered.length}</span> of {loans.length} loans</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled className="h-7 px-2">
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" disabled className="h-7 px-2">
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

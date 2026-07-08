'use client';
import { authFetch } from '@/lib/auth-client';

import { useAppStore } from '@/lib/store';
import { useEffect, useMemo, useState } from 'react';
import {
  LOAN_STATUS_LABELS,
  LOAN_STATUS_BADGES,
  MCC_ROLES,
  MCC_DECISION_TYPES,
} from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, FileText, ChevronLeft, ChevronRight, Eye, Gavel,
  CheckCircle2, Clock, XCircle, AlertCircle, TrendingUp, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/ui/skeleton';

interface MccListItem {
  id: string;
  applicationRef: string | null;
  amount: number;
  duration: number;
  status: string;
  currentStep: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    business: { name: string; sector: string | null } | null;
  } | null;
  branch: { name: string; code: string } | null;
  plan: { name: string; interest: number } | null;
  decisionCount: number;
  progressPercent: number;
  isComplete: boolean;
  latestDecisionType: string | null;
  latestMccDecision: {
    id: string;
    approvalLevel: number;
    approverRole: string;
    decisionType: string;
    recommendedAmount: number | null;
    decisionDate: string;
  } | null;
  finalAmount: number | null;
  borrowerName: string;
  businessName: string | null;
  sector: string | null;
}

interface MccStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const TOTAL_LEVELS = Object.keys(MCC_ROLES).length; // 8

const DECISION_BADGE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  deferred: 'bg-amber-100 text-amber-700',
  conditional: 'bg-blue-100 text-blue-700',
};

export function MccListView() {
  const { setView, currentAdmin } = useAppStore();
  const [loans, setLoans] = useState<MccListItem[]>([]);
  const [stats, setStats] = useState<MccStats>({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (currentAdmin?.role === 'bm' && currentAdmin.branchId) {
          params.set('branchId', currentAdmin.branchId);
        }
        const res = await authFetch(`/api/mcc?${params.toString()}`);
        const data = await res.json();
        setLoans(data.loans || []);
        setStats(data.stats || { total: 0, pending: 0, approved: 0, rejected: 0 });
      } catch (e) {
        console.error('MCC list error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [statusFilter, currentAdmin]);

  const filtered = useMemo(() => {
    if (!search) return loans;
    const q = search.toLowerCase();
    return loans.filter(
      (l) =>
        l.applicationRef?.toLowerCase().includes(q) ||
        l.borrowerName.toLowerCase().includes(q) ||
        (l.businessName?.toLowerCase().includes(q) ?? false) ||
        (l.user?.email?.toLowerCase().includes(q) ?? false)
    );
  }, [loans, search]);

  const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Gavel className="h-5 w-5 text-amber-600" />
            Management Credit Committee
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            8-level approval decision ledger — {TOTAL_LEVELS} governance gates from Loan Officer to MD/CEO
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Total MCC Records</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Pending Review</p>
              <p className="text-2xl font-bold text-amber-700">{stats.pending}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Approved / Complete</p>
              <p className="text-2xl font-bold text-emerald-700">{stats.approved}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-medium">Rejected</p>
              <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ref, borrower name, business, email..."
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="all">All Decisions</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved / Complete</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Application Ref</th>
                <th className="px-4 py-3 font-semibold">Borrower</th>
                <th className="px-4 py-3 font-semibold">Business</th>
                <th className="px-4 py-3 font-semibold text-right">Requested</th>
                <th className="px-4 py-3 font-semibold text-right">Final MCC Amount</th>
                <th className="px-4 py-3 font-semibold">Progress</th>
                <th className="px-4 py-3 font-semibold">Status</th>
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
                    <Gavel className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No MCC decisions match your filters.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      MCC decisions are recorded as loans progress through the approval chain.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((loan) => {
                  const decisionType = loan.latestDecisionType;
                  return (
                    <tr
                      key={loan.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setView('mcc-detail', { loanId: loan.id })}
                    >
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {loan.applicationRef || '—'}
                        </p>
                        <p className="text-[10px] text-slate-500">{loan.plan?.name || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                            {loan.user?.firstName?.[0]}{loan.user?.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900 truncate">
                              {loan.borrowerName}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {loan.user?.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-slate-800 truncate">
                          {loan.businessName || '—'}
                        </p>
                        <p className="text-[10px] text-slate-500">{loan.sector || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-slate-900">
                          {fmtNaira(loan.amount)}
                        </p>
                        <p className="text-[10px] text-slate-500">{loan.duration} mo</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-bold text-emerald-700">
                          {loan.finalAmount != null ? fmtNaira(loan.finalAmount) : '—'}
                        </p>
                        {loan.finalAmount != null && loan.finalAmount !== loan.amount && (
                          <p
                            className={cn(
                              'text-[10px] font-semibold',
                              loan.finalAmount > loan.amount
                                ? 'text-emerald-600'
                                : 'text-red-600'
                            )}
                          >
                            {loan.finalAmount > loan.amount ? '▲' : '▼'}{' '}
                            {Math.abs(
                              ((loan.finalAmount - loan.amount) / loan.amount) * 100
                            ).toFixed(1)}
                            %
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                loan.isComplete
                                  ? 'bg-emerald-500'
                                  : 'bg-amber-500'
                              )}
                              style={{ width: `${loan.progressPercent}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              'text-[10px] font-bold',
                              loan.isComplete ? 'text-emerald-700' : 'text-amber-700'
                            )}
                          >
                            {loan.decisionCount}/{TOTAL_LEVELS}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">
                          {loan.latestMccDecision?.approverRole || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={cn(
                              'inline-block rounded px-2 py-0.5 text-[10px] font-semibold w-fit',
                              LOAN_STATUS_BADGES[loan.status]
                            )}
                          >
                            {LOAN_STATUS_LABELS[loan.status] || loan.status}
                          </span>
                          {decisionType && (
                            <span
                              className={cn(
                                'inline-block rounded px-2 py-0.5 text-[9px] font-semibold w-fit',
                                DECISION_BADGE[decisionType]
                              )}
                            >
                              {decisionType}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setView('mcc-detail', { loanId: loan.id });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
            <p>
              Showing{' '}
              <span className="font-semibold text-slate-900">{filtered.length}</span> of{' '}
              {loans.length} MCC records
            </p>
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

      {/* MCC role legend */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-900">8-Level Approval Chain</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {Object.values(MCC_ROLES).map((role) => (
            <div
              key={role.code}
              className="rounded-md border border-slate-200 bg-white p-2 text-center"
            >
              <p className="text-[10px] font-bold text-emerald-700">{role.code}</p>
              <p className="text-[9px] text-slate-500 mt-0.5">L{role.level}</p>
              <p className="text-[9px] text-slate-600 truncate">{role.label}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

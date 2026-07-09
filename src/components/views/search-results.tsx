'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  LOAN_STATUS_BADGES,
  LOAN_STATUS_LABELS,
  LOAN_STEP_LABELS,
  KYC_STATUS_LABELS,
  KYC_STATUS_BADGES,
  ROLE_LABELS,
} from '@/lib/constants';
import { fmtNaira, fmtDate } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Search as SearchIcon,
  Loader2,
  FileText,
  Users,
  UserCog,
  Building2,
  Eye,
  Inbox,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';

interface LoanResult {
  id: string;
  applicationRef: string | null;
  amount: number;
  status: string;
  currentStep: string;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    business: { id: string; name: string } | null;
  } | null;
}

interface CustomerResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  accountNumber: string | null;
  bvn: string | null;
  kycStatus: string | null;
  status: number;
  createdAt: string;
  business: { id: string; name: string } | null;
}

interface StaffResult {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  roleType: string | null;
  status: number;
  branch: { id: string; name: string; code: string } | null;
}

interface BranchResult {
  id: string;
  name: string;
  code: string;
  state: string | null;
  status: string;
}

interface SearchPayload {
  loans: LoanResult[];
  customers: CustomerResult[];
  staff: StaffResult[];
  branches: BranchResult[];
  total: number;
}

export function SearchResultsView() {
  const { viewParams, setView, currentAdmin } = useAppStore();
  const { toast } = useToast();

  const initialQ = (viewParams?.q as string) || '';
  const [query, setQuery] = useState(initialQ);
  const [committedQ, setCommittedQ] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchPayload>({
    loans: [],
    customers: [],
    staff: [],
    branches: [],
    total: 0,
  });

  // Re-run search whenever the committed query changes
  useEffect(() => {
    if (!committedQ) {
      setData({ loans: [], customers: [], staff: [], branches: [], total: 0 });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: committedQ });
        if (currentAdmin?.id) params.set('adminId', currentAdmin.id);
        const res = await authFetch(`/api/search?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || 'Search failed');
        setData({
          loans: json.loans || [],
          customers: json.customers || [],
          staff: json.staff || [],
          branches: json.branches || [],
          total: json.total || 0,
        });
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: 'Search failed',
            description: e.message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [committedQ, currentAdmin?.id, toast]);

  // If the user performs a new search from the topbar (which calls
  // setView('search-results', { q }) while we're already mounted), sync the
  // local state with the latest viewParams.
  useEffect(() => {
    const incoming = (viewParams?.q as string) || '';
    if (incoming && incoming !== committedQ) {
      setQuery(incoming);
      setCommittedQ(incoming);
    }
  }, [viewParams, committedQ]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCommittedQ(query.trim());
  };

  const counts = useMemo(
    () => ({
      loans: data.loans.length,
      customers: data.customers.length,
      staff: data.staff.length,
      branches: data.branches.length,
    }),
    [data]
  );

  return (
    <div className="min-h-full bg-slate-50">
      {/* Search header */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur px-4 lg:px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setView('dashboard')}
            className="text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>

          <form onSubmit={onSubmit} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search loans, customers, BVN, staff, branches…"
                className="pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <SearchIcon className="h-4 w-4 mr-1.5" />
              )}
              Search
            </Button>
          </form>
        </div>

        {committedQ && (
          <p className="mt-2 text-xs text-slate-500">
            {loading ? (
              'Searching…'
            ) : (
              <>
                Showing <span className="font-semibold text-slate-900">{data.total}</span>{' '}
                result{data.total === 1 ? '' : 's'} for{' '}
                <span className="font-semibold text-slate-900">“{committedQ}”</span>
                {currentAdmin?.role &&
                  !['super', 'md', 'cfo', 'hoc', 'cro', 'legal'].includes(
                    currentAdmin.role
                  ) && (
                    <span className="ml-2 text-amber-600">
                      (scoped to your branch)
                    </span>
                  )}
              </>
            )}
          </p>
        )}
      </div>

      <div className="p-4 lg:p-6">
        {!committedQ ? (
          <EmptyState
            icon={SearchIcon}
            title="Start typing to search"
            description="Use the box above to find loans, customers, staff or branches across the platform."
          />
        ) : data.total === 0 && !loading ? (
          <EmptyState
            icon={Inbox}
            title="No results found"
            description={`We couldn't find anything matching “${committedQ}”. Try a different keyword.`}
          />
        ) : (
          <Tabs defaultValue="loans" className="w-full">
            <TabsList className="bg-white border border-slate-200 p-1 h-auto flex flex-wrap">
              <TabTrigger
                value="loans"
                icon={FileText}
                label="Loans"
                count={counts.loans}
              />
              <TabTrigger
                value="customers"
                icon={Users}
                label="Customers"
                count={counts.customers}
              />
              <TabTrigger
                value="staff"
                icon={UserCog}
                label="Staff"
                count={counts.staff}
              />
              <TabTrigger
                value="branches"
                icon={Building2}
                label="Branches"
                count={counts.branches}
              />
            </TabsList>

            {/* Loans */}
            <TabsContent value="loans" className="mt-4">
              <ResultsGrid
                empty={
                  counts.loans === 0 && (
                    <EmptyState
                      icon={FileText}
                      title="No loans found"
                      description="No loan applications match your search."
                      compact
                    />
                  )
                }
              >
                {data.loans.map((loan) => (
                  <ResultCard
                    key={loan.id}
                    onClick={() =>
                      setView('loan-detail', { id: loan.id })
                    }
                    title={loan.applicationRef || 'No ref'}
                    subtitle={`${loan.user?.firstName || ''} ${
                      loan.user?.lastName || ''
                    }`.trim() || '—'}
                    meta={[
                      loan.user?.business?.name || 'No business',
                      `${fmtNaira(loan.amount)}`,
                    ]}
                    badges={[
                      <Badge
                        key="status"
                        className={cn(
                          'border-transparent',
                          LOAN_STATUS_BADGES[loan.status] ||
                            'bg-slate-100 text-slate-700'
                        )}
                      >
                        {LOAN_STATUS_LABELS[loan.status] || loan.status}
                      </Badge>,
                      <Badge
                        key="step"
                        variant="outline"
                        className="border-slate-200 text-slate-600"
                      >
                        {LOAN_STEP_LABELS[loan.currentStep] || loan.currentStep}
                      </Badge>,
                    ]}
                    foot={`Created ${fmtDate(loan.createdAt)}`}
                  />
                ))}
              </ResultsGrid>
            </TabsContent>

            {/* Customers */}
            <TabsContent value="customers" className="mt-4">
              <ResultsGrid
                empty={
                  counts.customers === 0 && (
                    <EmptyState
                      icon={Users}
                      title="No customers found"
                      description="No customer records match your search."
                      compact
                    />
                  )
                }
              >
                {data.customers.map((c) => (
                  <ResultCard
                    key={c.id}
                    onClick={() => setView('customer-detail', { id: c.id })}
                    title={`${c.firstName} ${c.lastName}`}
                    subtitle={c.email || c.phone || '—'}
                    meta={[
                      c.business?.name || 'No business',
                      c.accountNumber
                        ? `Acct: ${c.accountNumber}`
                        : c.bvn
                        ? `BVN: ••••${c.bvn.slice(-4)}`
                        : 'No account',
                    ]}
                    badges={[
                      <Badge
                        key="kyc"
                        className={cn(
                          'border-transparent',
                          KYC_STATUS_BADGES[c.kycStatus || ''] ||
                            'bg-slate-100 text-slate-700'
                        )}
                      >
                        {KYC_STATUS_LABELS[c.kycStatus || ''] ||
                          c.kycStatus ||
                          'No KYC'}
                      </Badge>,
                    ]}
                    foot={`Joined ${fmtDate(c.createdAt)}`}
                  />
                ))}
              </ResultsGrid>
            </TabsContent>

            {/* Staff */}
            <TabsContent value="staff" className="mt-4">
              <ResultsGrid
                empty={
                  counts.staff === 0 && (
                    <EmptyState
                      icon={UserCog}
                      title="No staff found"
                      description="No staff members match your search."
                      compact
                    />
                  )
                }
              >
                {data.staff.map((s) => (
                  <ResultCard
                    key={s.id}
                    onClick={() => setView('staff-detail', { id: s.id })}
                    title={`${s.firstName} ${s.lastName}`}
                    subtitle={`@${s.username} · ${s.email}`}
                    meta={[
                      ROLE_LABELS[s.role] || s.role,
                      s.branch?.name
                        ? `${s.branch.name} (${s.branch.code})`
                        : 'No branch',
                    ]}
                    badges={[
                      <Badge
                        key="role"
                        className="bg-emerald-100 text-emerald-700 border-transparent"
                      >
                        {ROLE_LABELS[s.role] || s.role}
                      </Badge>,
                      <Badge
                        key="status"
                        variant="outline"
                        className={cn(
                          'border-slate-200',
                          s.status === 1
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        )}
                      >
                        {s.status === 1 ? 'Active' : 'Suspended'}
                      </Badge>,
                    ]}
                    foot={null}
                  />
                ))}
              </ResultsGrid>
            </TabsContent>

            {/* Branches */}
            <TabsContent value="branches" className="mt-4">
              <ResultsGrid
                empty={
                  counts.branches === 0 && (
                    <EmptyState
                      icon={Building2}
                      title="No branches found"
                      description="No branches match your search."
                      compact
                    />
                  )
                }
              >
                {data.branches.map((b) => (
                  <ResultCard
                    key={b.id}
                    onClick={() => setView('branches')}
                    title={b.name}
                    subtitle={`Code: ${b.code}`}
                    meta={[b.state || 'No state', 'Branch']}
                    badges={[
                      <Badge
                        key="status"
                        variant="outline"
                        className={cn(
                          'border-slate-200',
                          b.status === 'active'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        )}
                      >
                        {b.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>,
                    ]}
                    foot={null}
                  />
                ))}
              </ResultsGrid>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function TabTrigger({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex items-center gap-2 px-3 py-1.5 text-sm data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 data-[state=active]:bg-emerald-100 data-[state=active]:text-emerald-700">
        {count}
      </span>
    </TabsTrigger>
  );
}

function ResultsGrid({
  children,
  empty,
}: {
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  if (empty) return <>{empty}</>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {children}
    </div>
  );
}

function ResultCard({
  title,
  subtitle,
  meta,
  badges,
  foot,
  onClick,
}: {
  title: string;
  subtitle: string;
  meta: string[];
  badges: React.ReactNode[];
  foot: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className="cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all group"
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 truncate">
              {title}
            </p>
            <p className="text-xs text-slate-500 truncate">{subtitle}</p>
          </div>
          <Eye className="h-4 w-4 text-slate-300 group-hover:text-emerald-600 shrink-0" />
        </div>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {meta.map((m, i) => (
            <span key={i} className="truncate">
              {m}
            </span>
          ))}
        </div>
        {foot && <div className="text-[11px] text-slate-400 pt-1">{foot}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-10' : 'py-20'
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">{description}</p>
    </div>
  );
}

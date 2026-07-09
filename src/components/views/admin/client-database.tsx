'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  KYC_STATUS_BADGES,
  KYC_STATUS_LABELS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableHead, TableHeader, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Users, Search, Eye, ChevronLeft, ChevronRight,
  Building2, CheckCircle2, Clock, XCircle,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import { authFetch } from '@/lib/auth-client';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  bvn: string | null;
  accountNumber: string | null;
  kycStatus: string | null;
  createdAt: string;
  business: { id: string; name: string; sector: string | null } | null;
  branch: { id: string; name: string; code: string } | null;
  _count: { loans: number };
}

interface Stats {
  total: number;
  approved: number;
  pending: number;
  declined: number;
}

const PAGE_SIZE = 50;

export function ClientDatabaseView() {
  const { setView } = useAppStore();
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, declined: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [kycStatus, setKycStatus] = useState<string>('all');
  const [branchId, setBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<{ id: string; name: string; code: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (kycStatus && kycStatus !== 'all') params.set('kycStatus', kycStatus);
      if (branchId && branchId !== 'all') params.set('branchId', branchId);
      params.set('page', String(page));
      const res = await authFetch(`/api/admin/customers?${params.toString()}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setCustomers(d.customers || []);
      setStats(d.stats || { total: 0, approved: 0, pending: 0, declined: 0 });
      setTotalPages(d.totalPages || 1);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, kycStatus, branchId, page, toast]);

  useEffect(() => {
    authFetch('/api/branches')
      .then((r) => r.json())
      .then((d) => setBranches(d.branches || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      if (page !== 1) setPage(1);
      else load();
    }, 400);
    return () => clearTimeout(t);
  }, [search, page, load]);

  useEffect(() => {
    if (page !== 1) setPage(1);
    else load();
  }, [kycStatus, branchId, page, load]);

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const initials = (c: Customer) =>
    `${c.firstName?.[0] || ''}${c.lastName?.[0] || ''}`.toUpperCase() || '??';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" /> Client Database
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Global searchable directory of all customers across branches.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Customers" value={stats.total} color="slate" icon={Users} />
        <StatCard label="KYC Approved" value={stats.approved} color="emerald" icon={CheckCircle2} />
        <StatCard label="Pending" value={stats.pending} color="amber" icon={Clock} />
        <StatCard label="Declined" value={stats.declined} color="red" icon={XCircle} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, BVN, account number..."
                className="pl-9"
              />
            </div>
            <Select value={kycStatus} onValueChange={setKycStatus}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="KYC status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All KYC statuses</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="RESUBMIT">Resubmit</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Customer</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Account No</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">BVN</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Business</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Branch</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Loans</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">KYC</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Joined</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="px-4 py-6">
                    <TableSkeleton rows={5} />
                  </TableCell>
                </TableRow>
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No customers match your filters.</p>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                          {initials(c)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{c.email || c.phone || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-700">
                      {c.accountNumber || '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-600">
                      {c.bvn ? `••••${c.bvn.slice(-4)}` : '—'}
                    </TableCell>
                    <TableCell>
                      {c.business ? (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{c.business.name}</p>
                            {c.business.sector && (
                              <p className="text-[10px] text-slate-500 truncate">{c.business.sector}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {c.branch ? `${c.branch.name}` : <span className="text-slate-400">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">{c._count?.loans ?? 0}</Badge>
                    </TableCell>
                    <TableCell>
                      {c.kycStatus ? (
                        <Badge className={cn('text-[10px]', KYC_STATUS_BADGES[c.kycStatus] || 'bg-slate-100 text-slate-700')}>
                          {KYC_STATUS_LABELS[c.kycStatus] || c.kycStatus}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-slate-400">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{fmtDate(c.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => setView('customer-detail', { userId: c.id })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!loading && customers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-600">
            <p>
              Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
              <span className="font-semibold text-slate-900">{totalPages}</span>
              <span className="hidden sm:inline"> · {PAGE_SIZE} per page</span>
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
function StatCard({
  label, value, color, icon: Icon,
}: {
  label: string;
  value: number;
  color: 'slate' | 'amber' | 'emerald' | 'red';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <Card className={cn('p-4 border', colors[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
          <p className="text-2xl font-bold mt-0.5">{value}</p>
        </div>
        <Icon className="h-7 w-7 opacity-50" />
      </div>
    </Card>
  );
}

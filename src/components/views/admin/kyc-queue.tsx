'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  KYC_STATUS_BADGES,
  KYC_STATUS_LABELS,
  KYC_STATUSES,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableHead, TableHeader, TableRow, TableBody, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  ShieldCheck, Search, Eye, CheckCircle2, XCircle, AlertTriangle,
  Loader2, FileText, Image as ImageIcon, RefreshCw,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';

type TabKey = 'all' | 'pending' | 'resubmit' | 'approved' | 'declined';

interface KycUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  bvn: string | null;
  nin: string | null;
  kycStatus: string;
  createdAt: string;
  updatedAt: string;
  business: {
    id: string;
    name: string;
    docFront: string | null;
    docBack: string | null;
    proofOfAddress: string | null;
    selfie: string | null;
    docShopPhoto: string | null;
    docCac: string | null;
    docType: string | null;
    docNumber: string | null;
    sourceOfFunds: string | null;
    businessType: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    postalCode: string | null;
    bDay: number | null;
    bMonth: number | null;
    bYear: number | null;
    declineReason: string | null;
  } | null;
}

interface Stats {
  pending: number;
  approved: number;
  declined: number;
  resubmit: number;
  total: number;
}

const SOURCE_OF_FUNDS_LABELS: Record<string, string> = {
  PERSONAL_SAVINGS: 'Personal Savings',
  FAMILY_SAVINGS: 'Family Savings',
  SALE_OF_ASSETS: 'Sale of Assets',
  BUSINESS_PROFITS: 'Business Profits',
  SALARY: 'Salary',
  INVESTMENT_RETURNS: 'Investment Returns',
  INHERITANCE: 'Inheritance',
  GIFT: 'Gift',
  PENSION: 'Pension',
  RENTAL_INCOME: 'Rental Income',
  OTHER: 'Other',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function KycQueueView() {
  const { currentAdmin, setView } = useAppStore();
  const { toast } = useToast();

  const [users, setUsers] = useState<KycUser[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0, declined: 0, resubmit: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');

  // Detail modal
  const [detailUser, setDetailUser] = useState<KycUser | null>(null);

  // Action modal (decline / resubmit reason)
  const [actionOpen, setActionOpen] = useState(false);
  const [actionKind, setActionKind] = useState<'decline' | 'resubmit' | null>(null);
  const [actionUser, setActionUser] = useState<KycUser | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/kyc');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setUsers(d.users || []);
      setStats(d.stats || { pending: 0, approved: 0, declined: 0, resubmit: 0, total: 0 });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      (u.bvn || '').toLowerCase().includes(q)
    );
  });

  const tabFiltered = filtered.filter((u) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return u.kycStatus === KYC_STATUSES.PROCESSING;
    if (tab === 'resubmit') return u.kycStatus === KYC_STATUSES.RESUBMIT;
    if (tab === 'approved') return u.kycStatus === KYC_STATUSES.APPROVED;
    if (tab === 'declined') return u.kycStatus === KYC_STATUSES.DECLINED;
    return true;
  });

  const doApprove = async (u: KycUser) => {
    if (!currentAdmin) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/kyc/${u.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentAdmin.id, action: 'approve' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Action failed');
      toast({ title: 'KYC Approved', description: `${u.firstName} ${u.lastName} can now apply for loans.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openAction = (u: KycUser, kind: 'decline' | 'resubmit') => {
    setActionUser(u);
    setActionKind(kind);
    setReason(u.business?.declineReason || '');
    setActionOpen(true);
  };

  const submitAction = async () => {
    if (!actionUser || !actionKind || !currentAdmin) return;
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'Please enter a reason for the customer.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/kyc/${actionUser.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentAdmin.id, action: actionKind, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Action failed');
      toast({
        title: actionKind === 'decline' ? 'KYC Declined' : 'Resubmit Requested',
        description: `${actionUser.firstName} ${actionUser.lastName} notified.`,
      });
      setActionOpen(false);
      setActionUser(null);
      setReason('');
      await load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const initials = (u: KycUser) =>
    `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase() || '??';

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" /> KYC Verification Queue
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review customer documents and approve, decline, or request resubmission.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Review" value={stats.pending} color="amber" icon={ShieldCheck} />
        <StatCard label="Approved" value={stats.approved} color="emerald" icon={CheckCircle2} />
        <StatCard label="Declined" value={stats.declined} color="red" icon={XCircle} />
        <StatCard label="Resubmit" value={stats.resubmit} color="orange" icon={AlertTriangle} />
      </div>

      {/* Filter tabs + search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="resubmit">Resubmit</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="declined">Declined</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, BVN, phone..."
                className="pl-9"
              />
            </div>
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
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">BVN</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Doc Type</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Status</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Submitted</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-6">
                    <TableSkeleton rows={5} />
                  </TableCell>
                </TableRow>
              ) : tabFiltered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <ShieldCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No KYC submissions in this view.</p>
                  </TableCell>
                </TableRow>
              ) : (
                tabFiltered.map((u) => (
                  <TableRow key={u.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                          {initials(u)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{u.email || u.phone || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-600">
                      {u.bvn ? `••••${u.bvn.slice(-4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {u.business?.docType || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('text-[10px]', KYC_STATUS_BADGES[u.kycStatus] || 'bg-slate-100 text-slate-700')}>
                        {KYC_STATUS_LABELS[u.kycStatus] || u.kycStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{fmtDate(u.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" title="View documents" onClick={() => setDetailUser(u)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-emerald-700 hover:bg-emerald-50"
                          title="Approve"
                          disabled={submitting}
                          onClick={() => doApprove(u)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-red-700 hover:bg-red-50"
                          title="Decline"
                          onClick={() => openAction(u, 'decline')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-amber-700 hover:bg-amber-50"
                          title="Request resubmit"
                          onClick={() => openAction(u, 'resubmit')}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Detail modal */}
      <Dialog open={!!detailUser} onOpenChange={(o) => !o && setDetailUser(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {detailUser && (
            <>
              <DialogHeader>
                <DialogTitle>KYC Documents — {detailUser.firstName} {detailUser.lastName}</DialogTitle>
                <DialogDescription>
                  {detailUser.email || detailUser.phone || 'No contact'}
                  {detailUser.business?.name ? ` · ${detailUser.business.name}` : ''}
                </DialogDescription>
              </DialogHeader>

              {/* Customer info summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs py-2">
                <InfoBlock label="BVN" value={detailUser.bvn ? `••••${detailUser.bvn.slice(-4)}` : '—'} mono />
                <InfoBlock label="NIN" value={detailUser.nin ? `••••${detailUser.nin.slice(-4)}` : '—'} mono />
                <InfoBlock label="Doc Type" value={detailUser.business?.docType || '—'} />
                <InfoBlock label="Doc Number" value={detailUser.business?.docNumber || '—'} mono />
                <InfoBlock
                  label="Date of Birth"
                  value={
                    detailUser.business?.bDay && detailUser.business?.bMonth && detailUser.business?.bYear
                      ? `${detailUser.business.bDay} ${MONTHS[detailUser.business.bMonth - 1]} ${detailUser.business.bYear}`
                      : '—'
                  }
                />
                <InfoBlock label="Source of Funds" value={SOURCE_OF_FUNDS_LABELS[detailUser.business?.sourceOfFunds || ''] || detailUser.business?.sourceOfFunds || '—'} />
                <InfoBlock label="Business Type" value={detailUser.business?.businessType || '—'} />
                <InfoBlock
                  label="Address"
                  value={
                    detailUser.business?.line1
                      ? `${detailUser.business.line1}${detailUser.business.city ? ', ' + detailUser.business.city : ''}${detailUser.business.state ? ', ' + detailUser.business.state : ''}`
                      : '—'
                  }
                />
              </div>

              {detailUser.kycStatus === KYC_STATUSES.RESUBMIT && detailUser.business?.declineReason && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold mb-0.5">Previous resubmit reason:</p>
                  <p>{detailUser.business.declineReason}</p>
                </div>
              )}

              {/* Documents grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
                <DocTile label="ID Front" src={detailUser.business?.docFront} />
                <DocTile label="ID Back" src={detailUser.business?.docBack} />
                <DocTile label="Proof of Address" src={detailUser.business?.proofOfAddress} />
                <DocTile label="Selfie" src={detailUser.business?.selfie} />
                <DocTile label="Shop Photo" src={detailUser.business?.docShopPhoto} />
                <DocTile label="CAC Document" src={detailUser.business?.docCac} />
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setDetailUser(null)}>Close</Button>
                <Button
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => {
                    const u = detailUser;
                    setDetailUser(null);
                    openAction(u, 'resubmit');
                  }}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" /> Request Resubmit
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => {
                    const u = detailUser;
                    setDetailUser(null);
                    openAction(u, 'decline');
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" /> Decline
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  disabled={submitting}
                  onClick={() => {
                    const u = detailUser;
                    setDetailUser(null);
                    doApprove(u);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve KYC
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Action (decline / resubmit) modal */}
      <Dialog open={actionOpen} onOpenChange={(o) => { setActionOpen(o); if (!o) { setActionUser(null); setReason(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionKind === 'decline' ? 'Decline KYC Submission' : 'Request Resubmission'}
            </DialogTitle>
            <DialogDescription>
              {actionUser && (
                <>
                  For <span className="font-semibold">{actionUser.firstName} {actionUser.lastName}</span>.
                  The reason below will be visible to the customer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="reason">
              Reason {actionKind === 'decline' ? 'for decline' : 'for resubmission'} <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              placeholder={
                actionKind === 'decline'
                  ? 'e.g. The ID document is expired and the selfie is unclear.'
                  : 'e.g. Please re-upload a clearer copy of your proof of address (utility bill).'
              }
            />
            {actionKind === 'resubmit' && (
              <p className="text-[11px] text-slate-500">
                The customer will be allowed to re-submit their KYC documents.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionOpen(false); setActionUser(null); setReason(''); }}>
              Cancel
            </Button>
            <Button
              className={
                actionKind === 'decline'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }
              disabled={submitting || !reason.trim()}
              onClick={submitAction}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {actionKind === 'decline' ? 'Decline KYC' : 'Request Resubmit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label, value, color, icon: Icon,
}: {
  label: string;
  value: number;
  color: 'amber' | 'emerald' | 'red' | 'orange';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
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

function InfoBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className={cn('text-sm text-slate-900 break-words', mono && 'font-mono')}>{value}</p>
    </div>
  );
}

function DocTile({ label, src }: { label: string; src: string | null | undefined }) {
  return (
    <div className="rounded-md border border-slate-200 overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white">
        <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
          <FileText className="h-3 w-3 text-slate-400" /> {label}
        </p>
        {src ? (
          <a href={src} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-700 hover:underline">
            Open
          </a>
        ) : null}
      </div>
      <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={label}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const parent = (e.target as HTMLImageElement).parentElement;
              if (parent) {
                parent.innerHTML = '<div class="text-slate-400 text-xs flex flex-col items-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg><span class="mt-1">Preview unavailable</span></div>';
              }
            }}
          />
        ) : (
          <div className="text-slate-400 text-xs flex flex-col items-center">
            <ImageIcon className="h-5 w-5 mb-1" />
            <span>Not provided</span>
          </div>
        )}
      </div>
    </div>
  );
}

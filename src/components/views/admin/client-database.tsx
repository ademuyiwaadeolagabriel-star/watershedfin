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
  UserCog, KeyRound, Pencil, ShieldAlert, X,
} from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import { authFetch } from '@/lib/auth-client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore as useStore } from '@/lib/store';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  bvn: string | null;
  nin?: string | null;
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
  const { setView, currentAdmin } = useStore();
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

  // G1: Assignment + Password Reset + Profile Edit state
  const [assignModal, setAssignModal] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null });
  const [resetModal, setResetModal] = useState<{ open: boolean; customer: Customer | null; tempPwd?: string }>({ open: false, customer: null });
  const [staffList, setStaffList] = useState<{ id: string; firstName: string; lastName: string; role: string; branchId?: string }[]>([]);
  const [assignTo, setAssignTo] = useState<'bm' | 'lo'>('bm');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [resetting, setResetting] = useState(false);

  // G1b: Profile edit state
  const [editModal, setEditModal] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null });
  const [editForm, setEditForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // G1b: Open edit modal with customer data
  const openEditModal = (c: Customer) => {
    setEditForm({
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      email: c.email || '',
      phone: c.phone || '',
      bvn: c.bvn || '',
      nin: c.nin || '',
      address: '',
      state: '',
      accountNumber: c.accountNumber || '',
    });
    setEditModal({ open: true, customer: c });
  };

  // G1b: Save profile
  const handleSaveProfile = async () => {
    if (!editModal.customer) return;
    setSavingProfile(true);
    try {
      const res = await authFetch(`/api/customers/${editModal.customer.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: '✅ Profile Updated', description: 'Customer profile has been updated successfully.' });
      setEditModal({ open: false, customer: null });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  // G1: Load staff for assignment dropdowns
  useEffect(() => {
    authFetch('/api/staff').then(r => r.json()).then(d => setStaffList(d.staff || [])).catch(() => {});
  }, []);

  // G1: Handle assignment
  const handleAssign = async () => {
    if (!assignModal.customer || !selectedStaffId) return;
    setAssigning(true);
    try {
      const res = await authFetch(`/api/customers/${assignModal.customer.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignTo,
          [assignTo === 'bm' ? 'bmId' : 'loId']: selectedStaffId,
          branchId: assignModal.customer.branch?.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: '✅ Assigned', description: d.message || 'Client assigned successfully' });
      setAssignModal({ open: false, customer: null });
      setSelectedStaffId('');
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  // G1: Handle password reset
  const handleResetPassword = async () => {
    if (!resetModal.customer) return;
    setResetting(true);
    try {
      const res = await authFetch(`/api/customers/${resetModal.customer.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setResetModal({ open: true, customer: resetModal.customer, tempPwd: d.tempPassword });
      toast({ title: '✅ Password Reset', description: 'Temporary password generated and sent to customer email.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

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
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">Onboarding</TableHead>
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
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[9px] capitalize',
                        (c as any).onboardingStage === 'onboarding_complete' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        (c as any).onboardingStage === 'payment_pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                        (c as any).onboardingStage === 'legal_cac_search' && 'bg-blue-50 text-blue-700 border-blue-200',
                        (c as any).onboardingStage === 'legal_rejected' && 'bg-red-50 text-red-700 border-red-200',
                        (c as any).onboardingStage === 'cs_kyc_review' && 'bg-purple-50 text-purple-700 border-purple-200',
                      )}>
                        {((c as any).onboardingStage || '—').replace(/_/g, ' ')}
                      </Badge>
                      {(c as any).accountNumber && (
                        <span className="block text-[9px] font-mono text-slate-400 mt-0.5">
                          {(c as any).accountNumber}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{fmtDate(c.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setView('customer-detail', { userId: c.id })}
                          title="View Profile"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {/* G1: Assign button — visible to frontdesk, bm, super */}
                        {(currentAdmin?.role === 'super' || currentAdmin?.role === 'frontdesk' || currentAdmin?.role === 'bm') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-blue-600 hover:text-blue-700"
                            onClick={() => { setAssignModal({ open: true, customer: c }); setAssignTo(currentAdmin.role === 'bm' ? 'lo' : 'bm'); }}
                            title="Assign to staff"
                          >
                            <UserCog className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {/* G1: Password reset button — visible to frontdesk, bm, super */}
                        {(currentAdmin?.role === 'super' || currentAdmin?.role === 'frontdesk' || currentAdmin?.role === 'bm') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-amber-600 hover:text-amber-700"
                            onClick={() => setResetModal({ open: true, customer: c })}
                            title="Reset password"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {/* G1b: Edit profile button — visible to frontdesk, bm, super */}
                        {(currentAdmin?.role === 'super' || currentAdmin?.role === 'frontdesk' || currentAdmin?.role === 'bm') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-emerald-600 hover:text-emerald-700"
                            onClick={() => openEditModal(c)}
                            title="Edit profile"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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

      {/* G1: Assignment Modal */}
      <Dialog open={assignModal.open} onOpenChange={(o) => setAssignModal({ open: o, customer: assignModal.customer })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Client</DialogTitle>
            <DialogDescription>
              Assign {assignModal.customer?.firstName} {assignModal.customer?.lastName} to a {assignTo === 'bm' ? 'Branch Manager' : 'Loan Officer'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={assignTo === 'bm' ? 'default' : 'outline'}
                onClick={() => setAssignTo('bm')}
                className={assignTo === 'bm' ? 'bg-emerald-600' : ''}
              >
                Branch Manager
              </Button>
              <Button
                size="sm"
                variant={assignTo === 'lo' ? 'default' : 'outline'}
                onClick={() => setAssignTo('lo')}
                className={assignTo === 'lo' ? 'bg-emerald-600' : ''}
              >
                Loan Officer
              </Button>
            </div>
            <div>
              <Label className="text-xs text-slate-600">
                Select {assignTo === 'bm' ? 'Branch Manager' : 'Loan Officer'}
              </Label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">— Select staff —</option>
                {staffList
                  .filter(s => assignTo === 'bm' ? s.role === 'bm' : s.role === 'loan')
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.role.toUpperCase()})
                    </option>
                  ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-500 bg-blue-50 border border-blue-100 rounded p-2">
              ℹ️ The selected staff member will receive a dashboard notification and email about this assignment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModal({ open: false, customer: null })}>Cancel</Button>
            <Button onClick={handleAssign} disabled={!selectedStaffId || assigning} className="bg-emerald-600 hover:bg-emerald-700">
              {assigning ? 'Assigning...' : 'Assign Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* G1: Password Reset Modal */}
      <Dialog open={resetModal.open} onOpenChange={(o) => setResetModal({ open: o, customer: resetModal.customer })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Reset the password for {resetModal.customer?.firstName} {resetModal.customer?.lastName}.
            </DialogDescription>
          </DialogHeader>
          {resetModal.tempPwd ? (
            <div className="space-y-3 py-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-xs text-emerald-700 font-semibold mb-1">Temporary Password:</p>
                <p className="text-2xl font-bold text-emerald-800 font-mono tracking-wider">{resetModal.tempPwd}</p>
              </div>
              <p className="text-[11px] text-slate-500">
                ✅ This password has been sent to the customer's email.
                Please also share it with the customer in person or via phone.
                The customer should change it immediately after logging in.
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <p className="text-sm text-slate-600">
                A new random password will be generated and sent to the customer's email address.
                The customer will need to change it after their first login.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-xs text-amber-700">
                  ⚠️ <strong>Customer Email:</strong> {resetModal.customer?.email || 'No email on file'}
                  {resetModal.customer?.email ? '' : ' — Password will only be shown to you.'}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            {resetModal.tempPwd ? (
              <Button onClick={() => setResetModal({ open: false, customer: null })} className="bg-emerald-600 hover:bg-emerald-700">
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setResetModal({ open: false, customer: null })}>Cancel</Button>
                <Button onClick={handleResetPassword} disabled={resetting} className="bg-amber-600 hover:bg-amber-700">
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* G1b: Edit Profile Modal */}
      <Dialog open={editModal.open} onOpenChange={(o) => setEditModal({ open: o, customer: editModal.customer })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Customer Profile</DialogTitle>
            <DialogDescription>
              Update {editModal.customer?.firstName} {editModal.customer?.lastName}'s profile information.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div>
              <Label className="text-xs text-slate-600">First Name</Label>
              <Input value={editForm.firstName || ''} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Last Name</Label>
              <Input value={editForm.lastName || ''} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Email</Label>
              <Input value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Phone</Label>
              <Input value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">BVN (11 digits)</Label>
              <Input value={editForm.bvn || ''} onChange={(e) => setEditForm({ ...editForm, bvn: e.target.value })} className="mt-1" maxLength={11} />
            </div>
            <div>
              <Label className="text-xs text-slate-600">NIN (11 digits)</Label>
              <Input value={editForm.nin || ''} onChange={(e) => setEditForm({ ...editForm, nin: e.target.value })} className="mt-1" maxLength={11} />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Account Number</Label>
              <Input value={editForm.accountNumber || ''} onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">State</Label>
              <Input value={editForm.state || ''} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-slate-600">Residential Address</Label>
              <Textarea value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal({ open: false, customer: null })}>Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={savingProfile} className="bg-emerald-600 hover:bg-emerald-700">
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

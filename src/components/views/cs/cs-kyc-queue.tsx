'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Headphones, RefreshCw, AlertTriangle, Loader2, ShieldCheck, ArrowRight,
  CheckCircle2, XCircle, RefreshCcw, FileText, ExternalLink,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// v41: CsKycQueueView — now includes inline Approve/Decline/Resubmit actions
// with a reason dialog, so CS staff don't have to navigate to customer-detail
// to perform KYC verification. Documents are shown as view links.
// ============================================================================

export function CsKycQueueView() {
  const { setView } = useAppStore();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Action dialog state
  const [actionUser, setActionUser] = useState<any | null>(null);
  const [action, setAction] = useState<'approve' | 'decline' | 'resubmit' | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/kyc');
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users || []);
        setStats(d.stats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submitAction = async () => {
    if (!actionUser || !action) return;
    if ((action === 'decline' || action === 'resubmit') && !reason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for this action.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/admin/kyc/${actionUser.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: action === 'approve' ? 'KYC Approved' : action === 'decline' ? 'KYC Declined' : 'Resubmit Requested',
          description: `${actionUser.firstName} ${actionUser.lastName} has been notified.`,
        });
        setActionUser(null);
        setAction(null);
        setReason('');
        await load();
      } else {
        toast({ title: 'Action failed', description: d.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openAction = (user: any, act: 'approve' | 'decline' | 'resubmit') => {
    setActionUser(user);
    setAction(act);
    setReason('');
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Headphones className="h-5 w-5 text-emerald-600" /> Customer Service — KYC Verification Queue
            </h2>
            <p className="text-xs text-slate-500">
              Review and verify customer KYC submissions. Approve, reject per-field, or request re-upload — all inline.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Resubmit</p>
            <p className="text-2xl font-bold text-blue-600">{stats.resubmit}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Approved</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Declined</p>
            <p className="text-2xl font-bold text-red-600">{stats.declined}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total</p>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pending KYC Submissions</CardTitle>
          <CardDescription>
            Click "Review Docs" to open the customer detail page, or use the inline Approve / Decline / Resubmit buttons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Loading…</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No pending KYC submissions.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email / Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const business = u.business;
                  const docs = [
                    { label: 'Passport', path: business?.selfie },
                    { label: 'ID Front', path: business?.docFront },
                    { label: 'ID Back', path: business?.docBack },
                    { label: 'Utility Bill', path: business?.proofOfAddress },
                    { label: 'Shop Photo', path: business?.docShopPhoto },
                    { label: 'CAC Cert', path: business?.docCac },
                  ].filter(d => d.path);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.firstName} {u.lastName}</div>
                        {u.bvn && <div className="text-[10px] text-slate-400 font-mono">BVN: {u.bvn}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{u.email || '—'}</div>
                        <div className="text-slate-400">{u.phone || '—'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(
                          'text-[10px]',
                          u.kycStatus === 'PROCESSING' && 'bg-blue-50 text-blue-700 border-blue-200',
                          u.kycStatus === 'RESUBMIT' && 'bg-amber-50 text-amber-700 border-amber-200'
                        )}>
                          {u.kycStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {docs.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {docs.map((d, i) => (
                              <a
                                key={i}
                                href={d.path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-100"
                              >
                                <FileText className="h-2.5 w-2.5" /> {d.label}
                                <ExternalLink className="h-2 w-2" />
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">No docs uploaded</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(u.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setView('customer-detail', { userId: u.id })}
                            title="View full customer profile"
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" /> Review
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 h-7 px-2"
                            onClick={() => openAction(u, 'approve')}
                            title="Approve KYC"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-amber-600 border-amber-300 hover:bg-amber-50 h-7 px-2"
                            onClick={() => openAction(u, 'resubmit')}
                            title="Request Resubmit"
                          >
                            <RefreshCcw className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-300 hover:bg-red-50 h-7 px-2"
                            onClick={() => openAction(u, 'decline')}
                            title="Decline KYC"
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Action confirmation dialog */}
      <Dialog open={!!actionUser} onOpenChange={(o) => !o && (setActionUser(null), setAction(null), setReason(''))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {action === 'approve' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              {action === 'decline' && <XCircle className="h-5 w-5 text-red-600" />}
              {action === 'resubmit' && <RefreshCcw className="h-5 w-5 text-amber-600" />}
              {action === 'approve' ? 'Approve KYC' : action === 'decline' ? 'Decline KYC' : 'Request Resubmit'}
            </DialogTitle>
            <DialogDescription>
              {actionUser?.firstName} {actionUser?.lastName}
              {action === 'approve'
                ? ' — Customer will be notified to proceed with CAC search fee payment.'
                : action === 'decline'
                ? ' — Customer will be notified with the reason below.'
                : ' — Customer will be asked to re-upload corrected documents.'}
            </DialogDescription>
          </DialogHeader>

          {(action === 'decline' || action === 'resubmit') && (
            <div>
              <Label className="text-xs">
                {action === 'decline' ? 'Rejection Reason *' : 'Resubmit Instructions *'}
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder={
                  action === 'decline'
                    ? 'e.g. CAC certificate is expired. Please renew and resubmit.'
                    : 'e.g. Utility bill is unclear. Please upload a sharper image of a recent bill (max 3 months old).'
                }
                className="mt-1"
              />
            </div>
          )}

          {action === 'approve' && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">
                Confirming KYC approval will advance the customer to the payment stage. They will receive
                SMS + Email + dashboard notification prompting them to pay the CAC search fee.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionUser(null); setAction(null); setReason(''); }}>
              Cancel
            </Button>
            <Button
              onClick={submitAction}
              disabled={saving || ((action === 'decline' || action === 'resubmit') && !reason.trim())}
              className={cn(
                action === 'approve' && 'bg-emerald-600 hover:bg-emerald-700',
                action === 'decline' && 'bg-red-600 hover:bg-red-700',
                action === 'resubmit' && 'bg-amber-600 hover:bg-amber-700',
              )}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              Confirm {action === 'approve' ? 'Approval' : action === 'decline' ? 'Rejection' : 'Resubmit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

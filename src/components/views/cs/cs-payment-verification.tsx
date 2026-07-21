'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DollarSign, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle, Eye,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function CsPaymentVerificationView() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // Query onboarding payments via a dedicated endpoint (or fallback to SystemSetting query)
      const res = await authFetch('/api/admin/cs/payments');
      if (res.ok) {
        const d = await res.json();
        setPayments(d.payments || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const confirm = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/cs/payments/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        toast({ title: 'Payment confirmed', description: 'Customer has been notified' });
        setViewing(null);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const reject = async () => {
    if (!rejectReason) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    setRejecting(true);
    try {
      const res = await authFetch(`/api/admin/cs/payments/${viewing.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason }),
      });
      if (res.ok) {
        toast({ title: 'Payment rejected', description: 'Customer has been notified' });
        setViewing(null);
        setRejectReason('');
        await load();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" /> Payment Verification Queue
            </h2>
            <p className="text-xs text-slate-500">Verify manual bank transfer proof-of-payments for onboarding fees.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Loading payments…</p>
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No pending manual transfer verifications.</p>
              <p className="text-xs text-slate-400 mt-1">Paystack payments are auto-confirmed; only manual transfers need review.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.user?.firstName} {p.user?.lastName}</div>
                      <div className="text-[10px] text-slate-400">{p.user?.email}</div>
                    </TableCell>
                    <TableCell className="font-mono font-semibold">₦{Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">{p.method}</Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{p.reference || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[10px] capitalize',
                        p.status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                        p.status === 'confirmed' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        p.status === 'rejected' && 'bg-red-50 text-red-700 border-red-200',
                      )}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setViewing(p)}>
                        <Eye className="h-3 w-3 mr-1" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Customer</p>
                  <p className="font-medium">{viewing.user?.firstName} {viewing.user?.lastName}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Amount</p>
                  <p className="font-mono font-semibold">₦{Number(viewing.amount).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Method</p>
                  <p className="capitalize">{viewing.method}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Reference</p>
                  <p className="font-mono text-xs">{viewing.reference || '—'}</p>
                </div>
              </div>
              {viewing.proofOfPaymentPath && (
                <div>
                  <p className="text-[11px] text-slate-400 uppercase mb-1">Proof of Payment</p>
                  <a href={viewing.proofOfPaymentPath} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-emerald-700 hover:underline">
                    View uploaded proof →
                  </a>
                </div>
              )}
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setRejectReason('')}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button onClick={() => confirm(viewing.id)} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm Payment
                </Button>
              </DialogFooter>
              {rejectReason !== '' && (
                <div className="space-y-2 mt-3 pt-3 border-t">
                  <Label className="text-xs">Rejection Reason</Label>
                  <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Receipt is unclear" />
                  <Button variant="destructive" size="sm" onClick={reject} disabled={rejecting}>
                    {rejecting ? 'Rejecting…' : 'Submit Rejection'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

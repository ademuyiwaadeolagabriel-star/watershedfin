'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  FileCheck, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function LegalMccView() {
  const { toast } = useToast();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/loans?step=LEGAL_MCC');
      if (res.ok) {
        const d = await res.json();
        setLoans(d.loans || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (action === 'reject' && !reason) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/loans/${viewing.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStep: action === 'approve' ? 'MD_MCC_APPROVAL' : 'CFO_REVIEW',
          notes: action === 'reject' ? reason : 'Legal MCC compliance approved',
        }),
      });
      if (res.ok) {
        toast({
          title: action === 'approve' ? 'MCC Compliance Approved' : 'MCC Compliance Rejected',
          description: action === 'approve'
            ? 'Loan advanced to MD/MCC approval.'
            : 'Loan returned to CFO for correction.',
        });
        setViewing(null);
        setAction(null);
        setReason('');
        await load();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-emerald-600" /> Legal — MCC Compliance Queue
            </h2>
            <p className="text-xs text-slate-500">
              Review loans at the MCC compliance stage. Approve to advance to MD/MCC, or reject back to CFO.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto mb-2" /></div>
          ) : loans.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No loans pending MCC compliance review.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.id.slice(-8)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{l.user?.firstName} {l.user?.lastName}</div>
                    </TableCell>
                    <TableCell className="font-mono">₦{Number(l.amount || 0).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{l.currentStep}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setViewing(l)}>Review</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && (setViewing(null), setAction(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>MCC Compliance Review — {viewing?.user?.firstName} {viewing?.user?.lastName}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Loan Amount</p>
                  <p className="font-mono font-semibold">₦{Number(viewing.amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Step</p>
                  <p className="font-mono text-xs">{viewing.currentStep}</p>
                </div>
              </div>
              {action === 'reject' && (
                <div>
                  <Label className="text-xs">Rejection Reason *</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                    placeholder="e.g. Documentation incomplete for CBN compliance." />
                </div>
              )}
              <DialogFooter>
                {!action && (
                  <>
                    <Button variant="outline" onClick={() => setAction('reject')} className="text-red-600">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject (return to CFO)
                    </Button>
                    <Button onClick={() => setAction('approve')} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve (advance to MD/MCC)
                    </Button>
                  </>
                )}
                {action && (
                  <>
                    <Button variant="outline" onClick={() => setAction(null)}>Back</Button>
                    <Button onClick={submit} disabled={saving} className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
                      {saving ? 'Submitting…' : `Confirm ${action}`}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

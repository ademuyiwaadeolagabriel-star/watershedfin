'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle,
  RotateCcw, ArrowRight,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function HocConfirmationView() {
  const { setView } = useAppStore();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [action, setAction] = useState<'approve' | 'return_analyst' | 'return_bm' | null>(null);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/loans?step=HOC_CONFIRMATION');
      if (res.ok) {
        const d = await res.json();
        setLoans(d.loans || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!viewing) return;
    if (action !== 'approve' && !comments) {
      alert('Comments are required when returning for rework');
      return;
    }
    setSaving(true);
    try {
      let nextStep = '';
      if (action === 'approve') nextStep = 'CRO_REVIEW';
      else if (action === 'return_analyst') nextStep = 'ANALYST_STRUCTURING';
      else if (action === 'return_bm') nextStep = 'BM_VETTING';

      const res = await authFetch(`/api/loans/${viewing.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStep,
          notes: comments || (action === 'approve' ? 'HOC confirmed analyst work — approved' : ''),
          reworkReason: action !== 'approve' ? comments : undefined,
        }),
      });
      if (res.ok) {
        setViewing(null);
        setAction(null);
        setComments('');
        await load();
      }
    } catch (e: any) {
      console.error(e);
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
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> HOC Confirmation
            </h2>
            <p className="text-xs text-slate-500">
              Review analyst's structuring work. Approve to advance to CRO, or return with comments.
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
              <p className="text-sm text-slate-500">No loans pending HOC confirmation.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Analyst</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.id.slice(-8)}</TableCell>
                    <TableCell className="font-medium">{l.user?.firstName} {l.user?.lastName}</TableCell>
                    <TableCell className="font-mono">₦{Number(l.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{l.analystId ? 'Analyst' : '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(l.updatedAt).toLocaleString()}</TableCell>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>HOC Confirmation — {viewing?.user?.firstName} {viewing?.user?.lastName}</DialogTitle>
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

              {action && action !== 'approve' && (
                <div>
                  <Label className="text-xs">Rework Comments *</Label>
                  <Textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={4}
                    placeholder={action === 'return_analyst' ? 'Explain what the analyst needs to fix...' : 'Explain what the BM/LO needs to correct...'}
                    className="mt-1"
                  />
                </div>
              )}

              <DialogFooter>
                {!action && (
                  <div className="grid grid-cols-1 gap-2 w-full">
                    <Button onClick={() => setAction('approve')} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve — Advance to CRO
                    </Button>
                    <Button variant="outline" onClick={() => setAction('return_analyst')}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return to Analyst with Comments
                    </Button>
                    <Button variant="outline" onClick={() => setAction('return_bm')} className="text-amber-600">
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Return to BM/LO for Data Correction
                    </Button>
                  </div>
                )}
                {action && (
                  <>
                    <Button variant="outline" onClick={() => { setAction(null); setComments(''); }}>Back</Button>
                    <Button onClick={submit} disabled={saving} className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}>
                      {saving ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : 'Rework'}`}
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

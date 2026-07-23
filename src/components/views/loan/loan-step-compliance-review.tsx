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
  RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle, HelpCircle, ArrowRight,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function ComplianceReviewView() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'query_client' | null>(null);
  const [question, setQuestion] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/loans?step=COMPLIANCE_REVIEW');
      if (res.ok) {
        const d = await res.json();
        setLoans(d.loans || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!viewing) return;
    if (action === 'reject' && !rejectReason) { alert('Rejection reason required'); return; }
    if (action === 'query_client' && !question) { alert('Question is required'); return; }

    setSaving(true);
    try {
      if (action === 'approve') {
        await authFetch(`/api/loans/${viewing.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nextStep: 'HOC_SCHEDULING', notes: 'Compliance approved' }),
        });
      } else if (action === 'reject') {
        await authFetch(`/api/loans/${viewing.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nextStep: 'HOC_ASSIGNMENT', notes: `Compliance rejected: ${rejectReason}` }),
        });
      } else if (action === 'query_client') {
        // Create a compliance query
        await authFetch('/api/compliance/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanId: viewing.id, question }),
        });
      }
      setViewing(null);
      setAction(null);
      setQuestion('');
      setRejectReason('');
      await load();
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
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Compliance Review
            </h2>
            <p className="text-xs text-slate-500">
              Review MCC decisions and conditions. Approve, reject back to HOC, or request client clarity.
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
              <p className="text-sm text-slate-500">No loans pending compliance review.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.id.slice(-8)}</TableCell>
                    <TableCell className="font-medium">{l.user?.firstName} {l.user?.lastName}</TableCell>
                    <TableCell className="font-mono">₦{Number(l.amount || 0).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{l.currentStep}</Badge></TableCell>
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
            <DialogTitle>Compliance Review — {viewing?.user?.firstName} {viewing?.user?.lastName}</DialogTitle>
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

              {action === 'query_client' && (
                <div>
                  <Label className="text-xs">Question for Client *</Label>
                  <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
                    placeholder="e.g. Please provide evidence of your business address." className="mt-1" />
                  <p className="text-[10px] text-slate-400 mt-1">The customer will see this question on their dashboard.</p>
                </div>
              )}
              {action === 'reject' && (
                <div>
                  <Label className="text-xs">Rejection Reason *</Label>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
                    placeholder="e.g. MCC conditions not met — collateral documentation incomplete." className="mt-1" />
                </div>
              )}

              <DialogFooter>
                {!action && (
                  <div className="grid grid-cols-1 gap-2 w-full">
                    <Button onClick={() => setAction('approve')} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve — Advance to HOC Scheduling
                    </Button>
                    <Button variant="outline" onClick={() => setAction('query_client')}>
                      <HelpCircle className="h-3.5 w-3.5 mr-1" /> Request Client Clarity
                    </Button>
                    <Button variant="outline" onClick={() => setAction('reject')} className="text-red-600">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject — Return to HOC
                    </Button>
                  </div>
                )}
                {action && (
                  <>
                    <Button variant="outline" onClick={() => { setAction(null); setQuestion(''); setRejectReason(''); }}>Back</Button>
                    <Button onClick={submit} disabled={saving} className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}>
                      {saving ? 'Submitting…' : `Confirm ${action === 'approve' ? 'Approval' : action === 'reject' ? 'Rejection' : 'Query'}`}
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

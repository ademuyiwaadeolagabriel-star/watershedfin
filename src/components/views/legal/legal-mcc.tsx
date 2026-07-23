'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  FileCheck, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle,
  ShieldCheck, Scale, FileText, Upload,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ComplianceCheck {
  key: string;
  label: string;
  description: string;
  checked: boolean;
  notes: string;
}

const DEFAULT_CHECKS: ComplianceCheck[] = [
  { key: 'loan_agreement', label: 'Loan Agreement Signed', description: 'Loan agreement has been signed by all parties', checked: false, notes: '' },
  { key: 'offer_letter', label: 'Offer Letter Accepted', description: 'Customer has accepted the offer letter', checked: false, notes: '' },
  { key: 'cac_docs', label: 'CAC Documents Verified', description: 'CAC registration documents are valid and current', checked: false, notes: '' },
  { key: 'id_verification', label: 'Identity Verified', description: 'Customer identity (NIN/BVN) has been verified', checked: false, notes: '' },
  { key: 'address_verification', label: 'Address Verified', description: 'Customer business address has been verified', checked: false, notes: '' },
  { key: 'collateral_docs', label: 'Collateral Documentation', description: 'Collateral documents (if applicable) are in order', checked: false, notes: '' },
  { key: 'insurance', label: 'Insurance Policy', description: 'Required insurance policies are in place (if applicable)', checked: false, notes: '' },
  { key: 'regulatory_compliance', label: 'Regulatory Compliance', description: 'Loan complies with CBN prudential guidelines', checked: false, notes: '' },
  { key: 'aml_check', label: 'AML Screening', description: 'Anti-Money Laundering screening completed', checked: false, notes: '' },
  { key: 'sanctions_check', label: 'Sanctions Screening', description: 'Customer is not on any sanctions list', checked: false, notes: '' },
];

export function LegalMccView() {
  const { toast } = useToast();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [checks, setChecks] = useState<ComplianceCheck[]>(DEFAULT_CHECKS);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [mccNotes, setMccNotes] = useState('');
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

  const toggleCheck = (key: string) => {
    setChecks(checks.map(c => c.key === key ? { ...c, checked: !c.checked } : c));
  };

  const updateCheckNotes = (key: string, notes: string) => {
    setChecks(checks.map(c => c.key === key ? { ...c, notes } : c));
  };

  const allChecksPassed = checks.every(c => c.checked);
  const passedCount = checks.filter(c => c.checked).length;

  const submit = async () => {
    if (!viewing) return;
    if (action === 'reject' && !rejectReason) {
      toast({ title: 'Rejection reason required', variant: 'destructive' });
      return;
    }
    if (action === 'approve' && !allChecksPassed) {
      toast({ title: 'All compliance checks must pass', description: `${passedCount}/${checks.length} checks passed`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const complianceReport = {
        checks: checks.map(c => ({ key: c.key, label: c.label, checked: c.checked, notes: c.notes })),
        allPassed: allChecksPassed,
        mccNotes,
        decision: action,
      };

      const res = await authFetch(`/api/loans/${viewing.id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextStep: action === 'approve' ? 'MD_MCC_APPROVAL' : 'CFO_REVIEW',
          notes: action === 'approve'
            ? `Legal MCC approved — all ${checks.length} compliance checks passed. ${mccNotes}`
            : `Legal MCC rejected: ${rejectReason}`,
          mccDecision: complianceReport,
        }),
      });

      if (res.ok) {
        toast({
          title: action === 'approve' ? 'MCC Compliance Approved' : 'MCC Compliance Rejected',
          description: action === 'approve'
            ? 'Loan advanced to MD/MCC Executive Approval.'
            : 'Loan returned to CFO for correction.',
        });
        setViewing(null);
        setAction(null);
        setRejectReason('');
        setMccNotes('');
        setChecks(DEFAULT_CHECKS);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openReview = (loan: any) => {
    setViewing(loan);
    setChecks(DEFAULT_CHECKS);
    setAction(null);
    setRejectReason('');
    setMccNotes('');
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scale className="h-5 w-5 text-emerald-600" /> Legal — MCC Compliance Review
            </h2>
            <p className="text-xs text-slate-500">
              Review loans at the MCC compliance stage. Verify all documentation and regulatory requirements
              before approving to advance to MD/MCC Executive Approval.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Pending MCC Compliance Reviews</CardTitle>
          <CardDescription>Click "Review" to open the full compliance checklist.</CardDescription>
        </CardHeader>
        <CardContent>
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
                  <TableHead>Loan Ref</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>CRO Risk</TableHead>
                  <TableHead>CFO Review</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.applicationRef || l.id.slice(-8)}</TableCell>
                    <TableCell className="font-medium">{l.user?.firstName} {l.user?.lastName}</TableCell>
                    <TableCell className="font-mono">₦{Number(l.amount || 0).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{l.currentStep}</Badge></TableCell>
                    <TableCell className="text-xs text-slate-500">{l.appraisal?.croRiskRating || '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{l.appraisal?.cfoLiquidityNotes ? 'Reviewed' : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openReview(l)}>
                        <FileCheck className="h-3 w-3 mr-1" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Full compliance review dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && (setViewing(null), setAction(null))}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              MCC Compliance Review — {viewing?.user?.firstName} {viewing?.user?.lastName}
            </DialogTitle>
            <DialogDescription>
              Complete all {checks.length} compliance checks below. All checks must pass to approve.
            </DialogDescription>
          </DialogHeader>

          {viewing && (
            <div className="space-y-4 py-2">
              {/* Loan summary */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="text-[10px] text-slate-400 uppercase">Loan Amount</p>
                  <p className="font-mono font-semibold">₦{Number(viewing.amount || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="text-[10px] text-slate-400 uppercase">Duration</p>
                  <p className="font-mono font-semibold">{viewing.duration} months</p>
                </div>
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="text-[10px] text-slate-400 uppercase">Progress</p>
                  <p className={cn(
                    'font-semibold',
                    allChecksPassed ? 'text-emerald-600' : 'text-amber-600'
                  )}>
                    {passedCount}/{checks.length} checks passed
                  </p>
                </div>
              </div>

              {/* Compliance checklist */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Compliance Checklist</p>
                {checks.map((check) => (
                  <div
                    key={check.key}
                    className={cn(
                      'rounded-md border p-3 transition-colors',
                      check.checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Switch
                        checked={check.checked}
                        onCheckedChange={() => toggleCheck(check.key)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {check.checked ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-slate-400" />
                          )}
                          <p className={cn('text-sm font-medium', check.checked ? 'text-emerald-800' : 'text-slate-700')}>
                            {check.label}
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{check.description}</p>
                        {check.checked && (
                          <Input
                            placeholder="Optional notes..."
                            value={check.notes}
                            onChange={(e) => updateCheckNotes(check.key, e.target.value)}
                            className="mt-2 text-xs h-7"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* MCC notes */}
              <div>
                <Label className="text-xs">MCC Compliance Notes</Label>
                <Textarea
                  value={mccNotes}
                  onChange={(e) => setMccNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional compliance observations or conditions..."
                  className="mt-1"
                />
              </div>

              {/* Action buttons */}
              {action === 'reject' && (
                <div>
                  <Label className="text-xs">Rejection Reason *</Label>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. CAC documents expired — customer needs to renew registration."
                    className="mt-1"
                  />
                </div>
              )}

              <DialogFooter>
                {!action && (
                  <div className="grid grid-cols-1 gap-2 w-full">
                    <Button
                      onClick={() => setAction('approve')}
                      disabled={!allChecksPassed}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {allChecksPassed ? 'Approve — Advance to MD/MCC' : `Complete all ${checks.length} checks to approve`}
                    </Button>
                    <Button variant="outline" onClick={() => setAction('reject')} className="text-red-600">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject — Return to CFO
                    </Button>
                  </div>
                )}
                {action && (
                  <>
                    <Button variant="outline" onClick={() => { setAction(null); setRejectReason(''); }}>
                      Back
                    </Button>
                    <Button
                      onClick={submit}
                      disabled={saving}
                      className={action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Confirm {action === 'approve' ? 'Approval' : 'Rejection'}
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

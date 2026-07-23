'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle, FileCheck,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function InternalControlView() {
  const { toast } = useToast();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/loans?step=INTERNAL_CONTROL');
      if (res.ok) {
        const d = await res.json();
        setLoans(d.loans || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const approve = async (loanId: string) => {
    setSaving(loanId);
    try {
      const res = await authFetch(`/api/loans/${loanId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStep: 'COMPLIANCE_REVIEW', notes: 'Internal Control — documentation confirmed' }),
      });
      if (res.ok) {
        toast({ title: 'Approved', description: 'Loan advanced to Compliance Review' });
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const reject = async (loanId: string) => {
    const reason = prompt('Reason for returning to MD/MCC:');
    if (!reason) return;
    setSaving(loanId);
    try {
      const res = await authFetch(`/api/loans/${loanId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextStep: 'MD_MCC_APPROVAL', notes: `IC rejected: ${reason}` }),
      });
      if (res.ok) {
        toast({ title: 'Returned', description: 'Loan returned to MD/MCC' });
        await load();
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-emerald-600" /> Internal Control
            </h2>
            <p className="text-xs text-slate-500">
              Confirm documentation and conditions precedent before compliance review.
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
              <p className="text-sm text-slate-500">No loans pending internal control review.</p>
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
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => reject(l.id)} disabled={saving === l.id} className="text-red-600">
                          <XCircle className="h-3 w-3 mr-1" /> Return
                        </Button>
                        <Button size="sm" onClick={() => approve(l.id)} disabled={saving === l.id} className="bg-emerald-600 hover:bg-emerald-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

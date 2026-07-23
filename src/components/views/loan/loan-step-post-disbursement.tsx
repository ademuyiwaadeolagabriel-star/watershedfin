'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  RefreshCw, AlertTriangle, Loader2, CheckCircle2, Wallet,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAppStore } from '@/lib/store';

export function PostDisbursementHandoffView() {
  const { toast } = useToast();
  const { setView } = useAppStore();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch running loans where monitoringOwnerId is set
      const res = await authFetch('/api/loans?status=running&hasMonitoringOwner=true');
      if (res.ok) {
        const d = await res.json();
        setLoans(d.loans || []);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" /> Post-Disbursement Handoff
            </h2>
            <p className="text-xs text-slate-500">
              Loans disbursed and assigned to you for repayment monitoring.
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
              <p className="text-sm text-slate-500">No loans assigned to you for monitoring.</p>
              <p className="text-xs text-slate-400 mt-1">Disbursed loans will appear here for repayment tracking.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Disbursed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => (
                  <TableRow key={l.id} className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setView('loan-detail', { loanId: l.id })}
                  >
                    <TableCell className="font-mono text-xs">{l.id.slice(-8)}</TableCell>
                    <TableCell className="font-medium">{l.user?.firstName} {l.user?.lastName}</TableCell>
                    <TableCell className="font-mono">₦{Number(l.finalAmount || l.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {l.disbursedAt ? new Date(l.disbursedAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                        Running
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
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

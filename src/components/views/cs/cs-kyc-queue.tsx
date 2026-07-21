'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Headphones, RefreshCw, AlertTriangle, Loader2, ShieldCheck, ArrowRight,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export function CsKycQueueView() {
  const { setView } = useAppStore();
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Headphones className="h-5 w-5 text-emerald-600" /> Customer Service — KYC Verification Queue
            </h2>
            <p className="text-xs text-slate-500">
              Review and verify customer KYC submissions. Approve, reject per-field, or request re-upload.
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
          <CardDescription>Click a customer to review their documents.</CardDescription>
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
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setView('customer-detail', { userId: u.id })}
                  >
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
                    <TableCell className="text-xs text-slate-500">
                      {new Date(u.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline">
                        Review <ArrowRight className="h-3 w-3 ml-1" />
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

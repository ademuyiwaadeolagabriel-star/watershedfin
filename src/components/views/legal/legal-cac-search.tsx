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
  Search as SearchIcon, RefreshCw, AlertTriangle, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function LegalCacSearchView() {
  const { toast } = useToast();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<any | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [searchResult, setSearchResult] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/legal/cac-search');
      if (res.ok) {
        const d = await res.json();
        setCases(d.cases || []);
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
      const res = await authFetch('/api/legal/cac-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: viewing.id,
          action,
          reason,
          searchResult,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        toast({
          title: action === 'approve' ? 'CAC Search Approved' : 'CAC Search Rejected',
          description: action === 'approve' && d.accountNumber
            ? `Account number ${d.accountNumber} assigned to customer.`
            : 'Customer has been notified.',
        });
        setViewing(null);
        setAction(null);
        setReason('');
        setSearchResult('');
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
              <SearchIcon className="h-5 w-5 text-emerald-600" /> Legal — CAC Name Search Queue
            </h2>
            <p className="text-xs text-slate-500">
              Perform CAC name search for onboarding customers. Approval assigns account number.
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
          ) : cases.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No pending CAC search cases.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Business Name</TableHead>
                  <TableHead>RC/BN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.user?.firstName} {c.user?.lastName}</div>
                      <div className="text-[10px] text-slate-400">{c.user?.email}</div>
                    </TableCell>
                    <TableCell>{c.user?.business?.name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{c.user?.business?.rcBnNumber || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[10px] capitalize',
                        c.status === 'pending' && 'bg-amber-50 text-amber-700',
                        c.status === 'in_review' && 'bg-blue-50 text-blue-700',
                        c.status === 'customer_responded' && 'bg-purple-50 text-purple-700',
                      )}>
                        {c.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setViewing(c)}>
                        Review
                      </Button>
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
            <DialogTitle>CAC Name Search — {viewing?.user?.firstName} {viewing?.user?.lastName}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Business Name</p>
                  <p className="font-medium">{viewing.user?.business?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">RC/BN Number</p>
                  <p className="font-mono">{viewing.user?.business?.rcBnNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Business Type</p>
                  <p className="capitalize">{viewing.user?.business?.businessType || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Customer Email</p>
                  <p className="text-xs">{viewing.user?.email}</p>
                </div>
              </div>
              {viewing.rejectionReason && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[11px] text-amber-700">Previous rejection: {viewing.rejectionReason}</p>
                  {viewing.customerResponse && (
                    <p className="text-[11px] text-amber-800 mt-1">Customer response: {viewing.customerResponse}</p>
                  )}
                </div>
              )}
              {action === 'approve' && (
                <div>
                  <Label className="text-xs">Search Result / Notes</Label>
                  <Textarea value={searchResult} onChange={(e) => setSearchResult(e.target.value)} rows={3}
                    placeholder="e.g. CAC search completed — name available and registered." />
                </div>
              )}
              {action === 'reject' && (
                <div>
                  <Label className="text-xs">Rejection Reason *</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                    placeholder="e.g. Business name does not match CAC records." />
                </div>
              )}
              <DialogFooter>
                {!action && (
                  <>
                    <Button variant="outline" onClick={() => setAction('reject')} className="text-red-600">
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                    <Button onClick={() => setAction('approve')} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve & Assign Account Number
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

'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Scale, AlertTriangle, Loader2, Send, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';

export function RespondToLegalView() {
  const { currentUser, setView } = useAppStore();
  const { toast } = useToast();
  const [legalCase, setLegalCase] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      // Fetch the user's legal case (if any)
      const res = await authFetch(`/api/legal/cac-search?userId=${currentUser.id}`);
      if (res.ok) {
        const d = await res.json();
        setLegalCase(d.case || null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentUser?.id]);

  const submit = async () => {
    if (!response.trim()) {
      toast({ title: 'Response required', variant: 'destructive' });
      return;
    }
    if (!legalCase) return;
    setSubmitting(true);
    try {
      const res = await authFetch('/api/legal/cac-search/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: legalCase.id,
          customerResponse: response,
        }),
      });
      if (res.ok) {
        toast({
          title: 'Response submitted',
          description: 'Legal will review your response and get back to you.',
        });
        setResponse('');
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-slate-50 min-h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Dashboard
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-emerald-600" /> Legal CAC Name Search — Response
          </CardTitle>
          <CardDescription>
            Legal has requested additional information regarding your CAC name search.
            Please review their observations and provide your response below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!legalCase ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600">No pending Legal response required.</p>
              <p className="text-xs text-slate-400 mt-1">Your application is either not yet at the Legal stage or has been approved.</p>
            </div>
          ) : (
            <>
              {/* Legal's rejection reason */}
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Legal Observations</p>
                    <p className="text-sm text-amber-800 mt-1">{legalCase.rejectionReason || 'No specific reason provided.'}</p>
                  </div>
                </div>
              </div>

              {/* Case status */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Status</p>
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    {legalCase.status?.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 uppercase">Submitted</p>
                  <p className="text-xs text-slate-500">{new Date(legalCase.createdAt).toLocaleString()}</p>
                </div>
              </div>

              {/* Customer's previous response (if any) */}
              {legalCase.customerResponse && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-[11px] text-blue-600 uppercase font-semibold">Your Previous Response</p>
                  <p className="text-sm text-blue-800 mt-1">{legalCase.customerResponse}</p>
                </div>
              )}

              {/* Response form */}
              <div>
                <Label className="text-xs">Your Response *</Label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={5}
                  placeholder="Provide additional information or clarification for Legal's observations..."
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                  {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Submit Response to Legal
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

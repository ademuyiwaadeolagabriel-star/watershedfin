'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, CreditCard, Upload, Loader2, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function OnboardingPaymentView() {
  const { currentUser } = useAppStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/customer/onboarding-payment/status?userId=${currentUser.id}`);
      const d = await res.json();
      if (res.ok) setData(d);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [currentUser?.id]);

  const initiatePaystack = async () => {
    setPaying(true);
    try {
      const res = await authFetch('/api/customer/onboarding-payment/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id }),
      });
      const d = await res.json();
      if (res.ok) {
        // Redirect to Paystack checkout
        if (d.publicKey && d.reference) {
          // Use Paystack inline checkout
          const paystackUrl = `https://checkout.paystack.com/${d.reference}`;
          window.open(paystackUrl, '_blank');
          toast({
            title: 'Payment initiated',
            description: 'Complete your payment in the Paystack window. After payment, click "I have paid" to refresh.',
          });
        } else {
          toast({
            title: 'Paystack not configured',
            description: 'Please use manual bank transfer instead.',
            variant: 'destructive',
          });
        }
      } else {
        toast({ title: 'Failed', description: d.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  const uploadProof = async () => {
    if (!file) {
      toast({ title: 'Select a file', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('userId', currentUser?.id || '');
      fd.set('reference', reference || `WAT-TRF-${Date.now()}`);
      fd.set('file', file);
      const res = await authFetch('/api/customer/onboarding-payment/upload-proof', {
        method: 'POST',
        body: fd,
      });
      const d = await res.json();
      if (res.ok) {
        toast({
          title: 'Proof uploaded',
          description: 'Customer Service will verify your payment shortly.',
        });
        setFile(null);
        setReference('');
        await load();
      } else {
        toast({ title: 'Failed', description: d.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Unable to load payment information.</p>
      </Card>
    );
  }

  // If payment is not needed, don't show this component
  if (!data.needsPayment && data.hasConfirmedPayment) {
    return (
      <Card className="p-6 border-emerald-200 bg-emerald-50">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-900">Payment Confirmed</p>
            <p className="text-xs text-emerald-700">Your CAC search fee has been paid. Your application is being processed.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" /> CAC Name Search Fee
        </CardTitle>
        <CardDescription>
          Your KYC has been approved. Please pay the CAC search fee to continue with your account setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fee amount */}
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold">{data.fee.label}</p>
          <p className="text-3xl font-bold text-emerald-800">₦{data.fee.amount.toLocaleString()}</p>
        </div>

        {/* Payment status */}
        {data.hasPendingPayment && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              You have a pending payment verification. Customer Service will confirm shortly.
            </p>
          </div>
        )}

        {/* Payment methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Paystack */}
          <div className="rounded-md border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold">Pay with Card (Paystack)</p>
            </div>
            <p className="text-xs text-slate-500">Pay instantly with your debit/credit card via Paystack.</p>
            <Button
              onClick={initiatePaystack}
              disabled={paying || data.hasPendingPayment}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {paying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CreditCard className="h-3.5 w-3.5 mr-1" />}
              Pay ₦{data.fee.amount.toLocaleString()} with Card
            </Button>
          </div>

          {/* Manual Transfer */}
          <div className="rounded-md border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold">Manual Bank Transfer</p>
            </div>
            <p className="text-xs text-slate-500">Transfer to our bank account and upload proof of payment.</p>
            <div className="text-xs bg-slate-50 rounded p-2 border border-slate-200">
              <p><strong>Bank:</strong> Watershed Capital Bank</p>
              <p><strong>Account:</strong> 0123456789</p>
              <p><strong>Name:</strong> Watershed Capital Ltd</p>
            </div>
            <div className="space-y-2">
              <Input
                placeholder="Transfer reference (optional)"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="text-xs"
              />
              <Input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
              <Button
                onClick={uploadProof}
                disabled={uploading || !file || data.hasPendingPayment}
                variant="outline"
                className="w-full"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Upload Proof of Payment
              </Button>
            </div>
          </div>
        </div>

        {/* Payment history */}
        {data.paymentHistory?.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold text-slate-600 mb-2">Payment History</p>
            <div className="space-y-1">
              {data.paymentHistory.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="font-mono">{p.reference}</span>
                  <span className="font-mono">₦{Number(p.amount).toLocaleString()}</span>
                  <Badge variant="outline" className={cn(
                    'text-[9px]',
                    p.status === 'confirmed' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    p.status === 'pending' && 'bg-amber-50 text-amber-700 border-amber-200',
                    p.status === 'rejected' && 'bg-red-50 text-red-700 border-red-200',
                  )}>
                    {p.status}
                  </Badge>
                  <span className="text-slate-400">{new Date(p.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

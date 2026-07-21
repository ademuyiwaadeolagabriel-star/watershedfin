'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Mail, CheckCircle2, AlertCircle, Loader2, Send, ArrowLeft, RefreshCw,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';

export function CustomerVerifyEmailView() {
  const { currentUser, setView } = useAppStore();
  const { toast } = useToast();
  const [email, setEmail] = useState(currentUser?.email || '');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);

  const sendCode = async () => {
    if (!email) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await authFetch('/api/customer/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id, email }),
      });
      if (res.ok) {
        setSent(true);
        toast({ title: 'Verification code sent', description: `Check ${email} for your 6-digit code` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!otp || otp.length !== 6) {
      toast({ title: 'Invalid code', description: 'Enter the 6-digit code', variant: 'destructive' });
      return;
    }
    setVerifying(true);
    try {
      const res = await authFetch('/api/customer/verify-email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id, code: otp }),
      });
      if (res.ok) {
        toast({ title: 'Email verified', description: 'Your email has been confirmed' });
        setView('customer-dashboard');
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Verification failed', description: err.error, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
      </Button>
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600" /> Verify Email Address
          </CardTitle>
          <CardDescription>
            Confirm your email address to receive loan updates, statements, and security alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentUser?.emailVerify === 1 && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm text-emerald-800">Your email is already verified.</p>
            </div>
          )}

          <div>
            <Label className="text-xs">Email Address</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sent}
              className="mt-1"
            />
          </div>

          {!sent ? (
            <Button onClick={sendCode} disabled={sending} className="w-full">
              {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Send Verification Code
            </Button>
          ) : (
            <>
              <div>
                <Label className="text-xs">6-Digit Code</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-1 font-mono text-lg tracking-widest text-center"
                />
              </div>
              <Button onClick={verify} disabled={verifying} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {verifying ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Verify Code
              </Button>
              <Button variant="outline" onClick={sendCode} disabled={sending} className="w-full text-xs">
                <RefreshCw className="h-3 w-3 mr-1" /> Resend code
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

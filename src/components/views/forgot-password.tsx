'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Loader2, ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ForgotPasswordView() {
  const { setView } = useAppStore();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email) {
      toast({ title: 'Email required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSent(true);
        toast({ title: 'Reset link sent', description: 'Check your email for a reset link' });
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-600" /> Forgot Password
          </CardTitle>
          <CardDescription>
            Enter your email address and we will send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-900">Reset link sent</p>
              <p className="text-xs text-emerald-700 mt-1">
                If an account with that email exists, you will receive a reset link shortly.
                Check your spam folder if you don&apos;t see it.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setView('login')}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Login
              </Button>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Email Address</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@watershedcapital.com"
                  className="mt-1"
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </div>
              <Button onClick={submit} disabled={sending} className="w-full">
                {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Send Reset Link
              </Button>
              <Button variant="outline" onClick={() => setView('login')} className="w-full">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

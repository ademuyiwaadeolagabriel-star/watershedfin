'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// v41: ResetPasswordView
// Consumed by the email reset link: /reset-password?token=xxx
// The app uses a single-page shell (src/app/page.tsx) with view-based routing,
// so this component reads the token from window.location.search on mount and
// posts to the existing /api/auth/reset-password API.
// ============================================================================

export function ResetPasswordView() {
  const { setView } = useAppStore();
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Extract token from URL query string on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) {
        setToken(t);
      } else {
        setError('No reset token found in the URL. Please request a new reset link.');
      }
    }
  }, []);

  const submit = async () => {
    setError('');
    if (!token) {
      setError('No reset token. Please request a new reset link.');
      return;
    }
    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        toast({ title: 'Password reset successful', description: 'You can now log in with your new password.' });
      } else {
        setError(data.error || 'Reset failed. The token may be expired or invalid.');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-600" /> Reset Password
          </CardTitle>
          <CardDescription>
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {done ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-900">Password reset successfully</p>
              <p className="text-xs text-emerald-700 mt-1">
                Your password has been updated. You can now log in with your new credentials.
              </p>
              <Button variant="outline" className="mt-4" onClick={() => setView('login')}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Login
              </Button>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="pr-10"
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Minimum 8 characters. Use a mix of letters, numbers, and symbols.</p>
              </div>
              <div>
                <Label className="text-xs">Confirm New Password</Label>
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="mt-1"
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </div>
              <Button onClick={submit} disabled={submitting || !token} className="w-full">
                {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Lock className="h-3.5 w-3.5 mr-1" />}
                Reset Password
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

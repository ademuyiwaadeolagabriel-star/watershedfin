'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useBranding } from '@/lib/branding';
import {
  ShieldCheck, Lock, ArrowRight, ArrowLeft, Eye, EyeOff, KeyRound,
  Fingerprint, AlertTriangle, ShieldAlert, User as UserIcon,
} from 'lucide-react';

export function SuperAdminLoginView() {
  const { loginAs, setView } = useAppStore();
  const { config, load: loadBranding } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!useBranding.getState().loaded) loadBranding();
  }, [loadBranding]);

  const handleAuthenticate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAttempts((a) => a + 1);
        setError(data.error || 'Authentication failed.');
        setLoading(false);
        return;
      }

      // SUPER-ONLY: this login is reserved for super admins
      if (data.admin?.role !== 'super') {
        setError(
          'This login is for Super Admins only. Use the regular staff login.'
        );
        setLoading(false);
        return;
      }

      loginAs(data.admin.id, data.admin);
      setView('dashboard');
    } catch (err: any) {
      setAttempts((a) => a + 1);
      setError(err.message || 'Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-white relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-emerald-700/10 blur-3xl" />

      {/* ───────────────────────── LEFT PANEL ───────────────────────── */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-black via-slate-950 to-slate-900 p-12 flex-col justify-between relative overflow-hidden border-r border-slate-800">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Scanline */}
        <div
          className="absolute inset-x-0 top-0 h-px opacity-30"
          style={{
            background:
              'linear-gradient(90deg, transparent, #10b981, transparent)',
          }}
        />

        <div className="relative">
          <button
            onClick={() => setView('public-home')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors mb-12"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Website
          </button>

          <div className="flex items-center gap-3 mb-10">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/30">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500" />
              </span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-semibold">
                Restricted Access
              </p>
              <p className="text-base font-bold text-white">
                {config.siteName}
              </p>
            </div>
          </div>

          <h1 className="text-4xl font-black leading-tight mb-3 tracking-tight">
            SUPER ADMIN
            <br />
            <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
              ACCESS
            </span>
          </h1>
          <p className="text-slate-400 text-sm max-w-md leading-relaxed mb-8">
            Root-level control plane for the banking platform. Authorised
            personnel only — every action is logged, audited, and traced.
          </p>

          {/* Warning callout */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-8 max-w-md">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                  Authorized personnel only
                </p>
                <p className="text-[11px] text-amber-200/70 mt-0.5 leading-relaxed">
                  Unauthorised access attempts are recorded and may be
                  prosecuted under the Nigeria Cybercrimes Act 2015.
                </p>
              </div>
            </div>
          </div>

          {/* Security badges */}
          <div className="grid grid-cols-2 gap-2.5 max-w-md">
            {[
              { icon: Lock, label: '2FA Required' },
              { icon: Fingerprint, label: 'Session Audited' },
              { icon: ShieldCheck, label: 'Encrypted Tunnel' },
              { icon: KeyRound, label: 'Privileged Tokens' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2.5 backdrop-blur"
              >
                <Icon className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-[11px] font-medium text-slate-300">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-mono">
            SEC-LEVEL: ROOT · BUILD 4.2.0 · {config.cbnLicense}
          </span>
          <span className="font-mono text-emerald-500/60">
            ● SECURE CHANNEL
          </span>
        </div>
      </div>

      {/* ───────────────────────── RIGHT PANEL ───────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative">
        {/* Mobile top "Back to website" link */}
        <button
          onClick={() => setView('public-home')}
          className="lg:hidden absolute top-5 left-5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-400 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Website
        </button>

        <div className="w-full max-w-md">
          {/* Mobile-only header */}
          <div className="lg:hidden flex flex-col items-center text-center mb-8 mt-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/30 mb-3">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-semibold">
              Restricted Access
            </p>
            <h1 className="text-xl font-bold text-white mt-1">Super Admin Login</h1>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block mb-8">
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400 font-semibold mb-2">
              Authentication Required
            </p>
            <h2 className="text-2xl font-bold text-white">Secure Sign-In</h2>
            <p className="text-sm text-slate-400 mt-1">
              Enter your root credentials to continue.
            </p>
          </div>

          <form onSubmit={handleAuthenticate} className="space-y-4">
            <div>
              <label className="text-[11px] font-medium text-slate-300 mb-1.5 block uppercase tracking-wider">
                Username
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-md border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                  placeholder="super.admin"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 mb-1.5 block uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-800 bg-slate-900/80 pl-9 pr-10 py-2.5 text-sm text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-300 mb-1.5 block uppercase tracking-wider">
                2FA Code <span className="text-slate-600 normal-case tracking-normal">(optional for demo)</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="w-full rounded-md border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2.5 text-sm text-white tracking-[0.5em] font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-sans"
                  placeholder="000000"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-950/50 border border-red-800/60 px-3 py-2.5 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {attempts > 0 && (
              <p className="text-[10px] text-amber-500/70 font-mono">
                Failed attempts: {attempts} · session is being recorded
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-700/30 transition-all"
            >
              {loading ? 'Authenticating…' : 'Authenticate'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Security notice */}
          <div className="mt-6 rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                This area is restricted. All actions are logged and audited.
                Unauthorized access is a criminal offense.
              </p>
            </div>
          </div>

          {/* Footer links */}
          <div className="mt-6 pt-6 border-t border-slate-800 space-y-3 text-center text-sm">
            <p className="text-slate-500">
              Not a Super Admin?{' '}
              <button
                onClick={() => setView('login')}
                className="font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Regular staff login →
              </button>
            </p>
            <p className="text-[10px] text-slate-600 font-mono">
              {config.footerNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useAppStore } from '@/lib/store';
import { useBranding } from '@/lib/branding';
import { setAuthToken } from '@/lib/auth-client';
import { Lock, ArrowRight, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

export function LoginView() {
  const { loginAs, setView } = useAppStore();
  const { config, load: loadBranding } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!useBranding.getState().loaded) loadBranding();
  }, [loadBranding]);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }
      // A1 FIX: Save JWT token for authenticated API calls
      if (data.token) {
        setAuthToken(data.token);
      }
      loginAs(data.admin.id, data.admin);
      setView('dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/95 backdrop-blur overflow-hidden p-1">
              <img
                src={config.logoUrl}
                alt={config.siteName}
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <p className="text-xl font-bold">{config.siteName}</p>
              <p className="text-emerald-200 text-xs uppercase tracking-widest">{config.tagline}</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold leading-tight mb-4">
            Enterprise Banking<br />
            <span className="text-emerald-300">Governance Platform</span>
          </h2>
          <p className="text-emerald-100 text-sm max-w-md leading-relaxed">
            Full 20-state loan lifecycle, 8-snapshot audit trail, 30+ financial formulas,
            8-level MCC approval chain, double-entry accounting, and treasury — all in one platform.
          </p>

          <div className="grid grid-cols-2 gap-3 mt-8 max-w-md">
            {[
              { k: '20', l: 'Workflow States' },
              { k: '8', l: 'Governance Snapshots' },
              { k: '30+', l: 'Financial Formulas' },
              { k: '8', l: 'MCC Approval Levels' },
              { k: '15', l: 'Banking Modules' },
              { k: '60+', l: 'Permission Flags' },
            ].map((s) => (
              <div key={s.l} className="rounded-lg bg-white/10 backdrop-blur p-3 border border-white/10">
                <p className="text-2xl font-bold text-emerald-300">{s.k}</p>
                <p className="text-xs text-emerald-100">{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between">
          <button
            onClick={() => setView('public-home')}
            className="inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Website
          </button>
          <p className="text-xs text-emerald-200/70">
            {config.address} · {config.cbnLicense}
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-50 relative">
        {/* Mobile / top "Back to website" link */}
        <button
          onClick={() => setView('public-home')}
          className="absolute top-5 left-5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Website
        </button>

        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200 overflow-hidden p-1">
              <img
                src={config.logoUrl}
                alt={config.siteName}
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <p className="text-lg font-bold text-slate-900">{config.siteShortName}</p>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-8">Sign in to your staff account</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Enter your username"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-10 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Security notice */}
          <div className="mt-6 rounded-md bg-slate-100 border border-slate-200 px-4 py-3">
            <p className="text-[11px] text-slate-600 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
              <span>
                Authorized personnel only. All access is logged and monitored. 
                Contact your system administrator if you've forgotten your credentials.
              </span>
            </p>
          </div>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3 text-center text-sm">
            <p className="text-slate-600">
              Are you a customer?{' '}
              <button
                onClick={() => setView('customer-login')}
                className="font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Customer Login →
              </button>
            </p>
            <button
              onClick={() => setView('super-admin-login')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-emerald-700 transition-colors"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Super Admin Login →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import {
  Landmark,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  User,
  Sparkles,
  ShieldCheck,
  Clock,
  Users,
} from 'lucide-react';

// No demo customers — real accounts only. Customers must be onboarded by staff or self-register.
const DEMO_CUSTOMERS: never[] = [];

export function CustomerLoginView() {
  const { loginAsCustomer, setView } = useAppStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, id?: string) => {
    e?.preventDefault();
    const finalId = id ?? identifier;
    if (!finalId.trim()) {
      setError('Please enter your email or phone number.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: finalId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }
      loginAsCustomer(data.user.id, data.user);
      setView('customer-dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (id: string) => {
    setIdentifier(id);
    handleLogin(undefined, id);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
            backgroundSize: '32px 32px, 48px 48px',
          }}
        />
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />

        <div className="relative">
          {/* Logo */}
          <button
            onClick={() => setView('public-home')}
            className="flex items-center gap-3 mb-12 group"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Landmark className="h-7 w-7" />
            </div>
            <div className="text-left">
              <p className="text-xl font-bold">Watershed Finance</p>
              <p className="text-emerald-200 text-xs uppercase tracking-widest">Banking · Credit · Treasury</p>
            </div>
          </button>

          <h2 className="text-4xl font-bold leading-tight mb-4">
            Welcome back to your<br />
            <span className="text-emerald-300">business banking</span>
          </h2>
          <p className="text-emerald-100 text-sm max-w-md leading-relaxed mb-8">
            Sign in to apply for loans, check your savings, manage your treasury investments,
            and chat with your dedicated relationship manager.
          </p>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {[
              { icon: ShieldCheck, label: 'Licensed Lender' },
              { icon: Users, label: '12,000+ Customers' },
              { icon: Clock, label: '48hr Funding' },
            ].map((b) => (
              <div
                key={b.label}
                className="rounded-lg bg-white/10 backdrop-blur p-3 border border-white/10 text-center"
              >
                <b.icon className="h-5 w-5 text-emerald-300 mx-auto mb-1.5" />
                <p className="text-[11px] text-emerald-100 leading-tight">{b.label}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setView('public-home')}
          className="relative inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white transition-colors self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to website
        </button>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-between mb-8">
            <button onClick={() => setView('public-home')} className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <Landmark className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-slate-900">Watershed Finance</p>
            </button>
            <button
              onClick={() => setView('public-home')}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-emerald-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Home
            </button>
          </div>

          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-700 mb-3">
              <Sparkles className="h-3 w-3" />
              Customer Portal
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Sign in to your account</h1>
            <p className="text-sm text-slate-500">
              Use your email or phone number to access your dashboard.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                Email or Phone
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="you@example.com or +234 803..."
                />
              </div>
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
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
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

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer">
                <input type="checkbox" className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Remember me
              </label>
              <button type="button" className="font-medium text-emerald-700 hover:text-emerald-800">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Quick demo login */}
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-slate-200" />
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Quick demo login
              </p>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="space-y-1.5">
              {DEMO_CUSTOMERS.map((c) => (
                <button
                  key={c.email}
                  onClick={() => quickLogin(c.email)}
                  disabled={loading}
                  className="w-full flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:border-emerald-400 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0">
                      {c.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{c.desc}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-slate-400">
              Password for all demo customers:{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">customer123</code>
            </p>
          </div>

          {/* Footer links */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-3 text-center text-sm">
            <p className="text-slate-600">
              Don&apos;t have an account?{' '}
              <button
                onClick={() => setView('onboarding')}
                className="font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Open one now →
              </button>
            </p>
            <p>
              <button
                onClick={() => setView('login')}
                className="text-xs text-slate-500 hover:text-emerald-700"
              >
                Are you a staff member? Staff Login →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

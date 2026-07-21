'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { setAuthToken } from '@/lib/auth-client';
import { Lock, Building2, User, Mail, Key, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

export function SetupView() {
  const { loginAs, setView } = useAppStore();
  const [step, setStep] = useState<'form' | 'loading' | 'success'>('form');
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('Watershed Capital');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stats, setStats] = useState<any>(null);

  // Password strength
  const [strength, setStrength] = useState(0);
  useEffect(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    // Defer to avoid synchronous setState in effect
    const id = setTimeout(() => setStrength(s), 0);
    return () => clearTimeout(id);
  }, [password]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (strength < 3) {
      setError('Password is too weak. Use uppercase, numbers, and special characters.');
      return;
    }

    setStep('loading');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: orgName,
          firstName,
          lastName,
          username,
          email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Setup failed');
        setStep('form');
        return;
      }

      if (data.token) {
        setAuthToken(data.token);
      }
      setStats(data.stats);
      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Setup failed');
      setStep('form');
    }
  };

  const handleGoToDashboard = () => {
    // We need to fetch the admin object to login
    // Since setup returned the token, we can use it
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${localStorage.getItem('watershed_auth_token')}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.admin) {
          loginAs(data.admin.id, data.admin);
          setView('dashboard');
        } else {
          setView('login');
        }
      })
      .catch(() => setView('login'));
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-700 via-emerald-800 to-slate-900">
        <div className="text-center text-white">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Setting up your system...</h2>
          <p className="text-emerald-200 text-sm">Creating super admin, seeding sectors, branches, and chart of accounts.</p>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Setup Complete!</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your banking platform is ready. The following infrastructure data has been seeded:
          </p>
          {stats && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-emerald-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-emerald-700">{stats.sectorsCreated}</p>
                <p className="text-xs text-slate-500">Business Sectors</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-blue-700">{stats.branchesCreated}</p>
                <p className="text-xs text-slate-500">Branches</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-purple-700">{stats.accountsCreated}</p>
                <p className="text-xs text-slate-500">GL Accounts</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3">
                <p className="text-2xl font-bold text-amber-700">{stats.productsCreated}</p>
                <p className="text-xs text-slate-500">Loan Products</p>
              </div>
            </div>
          )}
          <button
            onClick={handleGoToDashboard}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Go to Dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-emerald-50 p-6">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-700 p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">First-Run System Setup</h1>
              <p className="text-emerald-100 text-xs">Create your Super Admin account to get started</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSetup} className="p-6 space-y-5">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Organization Name */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Organization Name</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Watershed Capital"
                required
              />
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Super Admin Account</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">First Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="John"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="super.admin"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="admin@watershedcapital.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Password</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Minimum 8 characters"
                required
              />
            </div>
            {/* Strength bar */}
            {password.length > 0 && (
              <div className="mt-1.5 flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      strength >= i
                        ? strength <= 2
                          ? 'bg-red-400'
                          : strength <= 3
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Use 8+ chars with uppercase, numbers, and special characters</p>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full rounded-md border bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-red-300 focus:border-red-500'
                    : 'border-slate-300 focus:border-emerald-500'
                }`}
                placeholder="Re-enter password"
                required
              />
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="text-[10px] text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!firstName || !lastName || !username || !email || !password || password !== confirmPassword}
            className="w-full flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock className="h-4 w-4" />
            Create Super Admin & Initialize System
          </button>

          <p className="text-[10px] text-center text-slate-400">
            This setup page will be permanently locked after the first admin is created.
          </p>
        </form>
      </div>
    </div>
  );
}

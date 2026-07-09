'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Wallet, FileText, ArrowRight, ArrowLeft, Bell, Landmark, LogOut, Home, Receipt,
  Calculator, CheckCircle2, Clock, AlertCircle, AlertTriangle, Copy, TrendingDown,
  Calendar, Phone, Mail, User, CreditCard, ChevronRight, LifeBuoy, PenTool,
  Wallet as WalletIcon, TrendingUp, XCircle, Info, Gift, BookOpen, MessagesSquare,
  HelpCircle, FileCheck, Sparkles, Menu, Flame, Trophy, Award, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOAN_STATUS_BADGES, LOAN_STATUS_LABELS } from '@/lib/constants';
import { fmtNaira, fmtDate, fmtDateTime } from '@/lib/loan-calc';
import { CustomerSidebar } from './customer-sidebar';
import { DashboardSkeleton } from '@/components/ui/skeleton';
import { NotificationBell } from '@/components/notification-bell';
import { authFetch } from '@/lib/auth-client';

const ICON_MAP: Record<string, any> = {
  CheckCircle2, XCircle, AlertCircle, ArrowRight, ArrowLeft, Wallet, PenTool, FileText, CreditCard,
};

export function CustomerDashboard() {
  const { currentUser, setView, currentView } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gamification, setGamification] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!currentUser) return;
      try {
        const res = await authFetch(`/api/customer/dashboard?userId=${currentUser.id}`);
        const d = await res.json();
        setData(d);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [currentUser]);

  // Fetch gamification profile separately so a slow gamification response
  // never blocks the dashboard from rendering.
  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/gamification?userId=${currentUser.id}`)
      .then((r) => r.json())
      .then((g) => setGamification(g))
      .catch(() => {});
  }, [currentUser]);

  const copyAccount = () => {
    if (data?.user?.accountNumber) {
      navigator.clipboard.writeText(data.user.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <div className="min-h-screen bg-slate-50"><DashboardSkeleton /></div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-red-500">Failed to load</div>;

  const u = data.user;
  const stats = data.stats;
  const activeLoans = data.activeLoans || [];
  const upcomingPayments = data.upcomingPayments || [];
  const alerts = data.alerts || [];
  const activityFeed = data.activityFeed || [];
  const allLoans = data.loans || [];
  const liveLoan = data.liveLoan;
  const preQualified = data.preQualifiedOffer;
  const rm = data.relationshipManager;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      {/* Mobile sidebar */}
      <div className={cn(
        'fixed lg:hidden left-0 top-0 z-40 h-screen transition-transform',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <CustomerSidebar />
      </div>
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <CustomerSidebar />
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-xs text-slate-500">Welcome back,</p>
            <h1 className="text-base font-bold text-slate-900">{u?.firstName} {u?.lastName} 👋</h1>
          </div>
          {u?.kycStatus === 'APPROVED' ? (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> KYC Verified</Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 text-[10px]">KYC: {u?.kycStatus || 'Pending'}</Badge>
          )}
          <NotificationBell userId={currentUser?.id} />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
          {/* ════════════════════════════════════════════════════════════════
              1. HERO BANNER — Account + Outstanding + Next Payment + Credit Standing
          ════════════════════════════════════════════════════════════════ */}
          <Card className="overflow-hidden border-0">
            <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-slate-900 text-white p-6 relative">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 30%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              <div className="relative grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-emerald-200 text-[10px] uppercase tracking-wider mb-1">Account Number</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-mono font-bold">{u?.accountNumber || '—'}</p>
                    {u?.accountNumber && (
                      <button onClick={copyAccount} className="text-emerald-300 hover:text-white">
                        {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                  <p className="text-emerald-200 text-xs mt-0.5">{u?.business?.name || 'Personal Account'}</p>
                </div>
                <div>
                  <p className="text-emerald-200 text-[10px] uppercase tracking-wider mb-1">Outstanding Balance</p>
                  <p className="text-2xl font-bold">{fmtNaira(stats.totalOutstanding)}</p>
                  <p className="text-emerald-200 text-xs">{stats.activeLoansCount} active loan{stats.activeLoansCount !== 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-emerald-200 text-[10px] uppercase tracking-wider mb-1">Next Payment</p>
                  <p className="text-2xl font-bold">{stats.nextPayment ? fmtNaira(stats.nextPayment.installment) : '—'}</p>
                  <p className="text-emerald-200 text-xs">
                    {stats.nextPayment ? (
                      stats.nextPayment.isOverdue ? <span className="text-red-300">Overdue by {Math.abs(stats.nextPayment.daysUntilDue)} days</span> :
                      `Due in ${stats.nextPayment.daysUntilDue} days`
                    ) : 'No upcoming payment'}
                  </p>
                </div>
                <div>
                  <p className="text-emerald-200 text-[10px] uppercase tracking-wider mb-1">Credit Standing</p>
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      'text-2xl font-bold',
                      stats.creditStandingColor === 'emerald' && 'text-emerald-300',
                      stats.creditStandingColor === 'amber' && 'text-amber-300',
                      stats.creditStandingColor === 'red' && 'text-red-300',
                    )}>{stats.creditStanding}</p>
                    {stats.creditStanding === 'GOOD' || stats.creditStanding === 'EXCELLENT' ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> :
                     stats.creditStanding === 'DUE SOON' ? <Clock className="h-5 w-5 text-amber-300" /> :
                     <AlertTriangle className="h-5 w-5 text-red-300" />}
                  </div>
                  <p className="text-emerald-200 text-xs">{stats.paidLoansCount} closed loan(s)</p>
                </div>
              </div>
              {stats.nextPayment && (
                <div className="relative mt-4 pt-4 border-t border-white/20 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm text-emerald-100">
                    {stats.nextPayment.isOverdue
                      ? `⚠️ Payment overdue — pay ${fmtNaira(stats.nextPayment.installment)} now to avoid penalties`
                      : `Next payment of ${fmtNaira(stats.nextPayment.installment)} due ${fmtDate(stats.nextPayment.dueDate)}`
                    }
                  </p>
                  <Button
                    onClick={() => setView('customer-pay-back' as any, { loanId: stats.nextPayment.loanId })}
                    className={cn(
                      'text-white border-0',
                      stats.nextPayment.isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-white/20 hover:bg-white/30'
                    )}
                    size="sm"
                  >
                    <CreditCard className="h-4 w-4 mr-1" /> Pay Now
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* ════════════════════════════════════════════════════════════════
              2. ALERTS — Overdue, Offer Ready, Payment Due, KYC, In Review
          ════════════════════════════════════════════════════════════════ */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert, idx) => (
                <Card key={idx} className={cn(
                  'p-4 border-l-4',
                  alert.severity === 'critical' && 'bg-red-50 border-red-500',
                  alert.severity === 'warning' && 'bg-amber-50 border-amber-500',
                  alert.severity === 'success' && 'bg-emerald-50 border-emerald-500',
                  alert.severity === 'info' && 'bg-blue-50 border-blue-500',
                )}>
                  <div className="flex items-start gap-3">
                    {alert.severity === 'critical' && <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
                    {alert.severity === 'warning' && <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                    {alert.severity === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />}
                    {alert.severity === 'info' && <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-sm font-semibold',
                        alert.severity === 'critical' && 'text-red-900',
                        alert.severity === 'warning' && 'text-amber-900',
                        alert.severity === 'success' && 'text-emerald-900',
                        alert.severity === 'info' && 'text-blue-900',
                      )}>{alert.title}</p>
                      <p className={cn(
                        'text-xs mt-0.5',
                        alert.severity === 'critical' && 'text-red-700',
                        alert.severity === 'warning' && 'text-amber-700',
                        alert.severity === 'success' && 'text-emerald-700',
                        alert.severity === 'info' && 'text-blue-700',
                      )}>{alert.message}</p>
                    </div>
                    {alert.action && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          'shrink-0 text-xs',
                          alert.severity === 'critical' && 'border-red-300 text-red-700 hover:bg-red-100',
                          alert.severity === 'warning' && 'border-amber-300 text-amber-700 hover:bg-amber-100',
                          alert.severity === 'success' && 'border-emerald-300 text-emerald-700 hover:bg-emerald-100',
                          alert.severity === 'info' && 'border-blue-300 text-blue-700 hover:bg-blue-100',
                        )}
                        onClick={() => setView(alert.actionView as any, alert.actionParams)}
                      >
                        {alert.action} <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              3. STATS GRID — 4 cards
          ════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={Wallet}
              label="Total Borrowed"
              value={fmtNaira(stats.totalBorrowed)}
              sub={`${stats.totalLoansCount} loan(s) lifetime`}
              color="emerald"
              onClick={() => setView('customer-loans' as any)}
            />
            <StatCard
              icon={CheckCircle2}
              label="Total Repaid"
              value={fmtNaira(stats.totalRepaid)}
              sub={`${stats.paidLoansCount} fully paid`}
              color="blue"
              onClick={() => setView('customer-transactions' as any)}
            />
            <StatCard
              icon={TrendingDown}
              label="Outstanding"
              value={fmtNaira(stats.totalOutstanding)}
              sub={`${stats.activeLoansCount} active loan(s)`}
              color="amber"
              onClick={() => setView('customer-loans' as any)}
            />
            <StatCard
              icon={Calendar}
              label="Next Payment"
              value={stats.nextPayment ? fmtNaira(stats.nextPayment.installment) : '—'}
              sub={stats.nextPayment ? (stats.nextPayment.isOverdue ? 'OVERDUE' : `Due in ${stats.nextPayment.daysUntilDue} days`) : 'No upcoming'}
              color={stats.nextPayment?.isOverdue ? 'red' : 'purple'}
              onClick={() => stats.nextPayment && setView('customer-pay-back' as any, { loanId: stats.nextPayment.loanId })}
            />
          </div>

          {/* ════════════════════════════════════════════════════════════════
              4. ACTIVE LOAN HERO + UPCOMING PAYMENTS (side by side)
          ════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Active loan hero */}
            <div className="lg:col-span-2">
              {activeLoans.length > 0 ? (
                <ActiveLoanHero loan={activeLoans[0]} setView={setView} />
              ) : liveLoan ? (
                <LiveApplicationTracker loan={liveLoan} setView={setView} />
              ) : (
                <Card className="p-8 text-center h-full flex flex-col justify-center">
                  <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 mb-4 mx-auto">
                    <Wallet className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">No Active Loans</h2>
                  <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                    You don't have any active loans right now. Apply for a loan and get funded in 48 hours.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => setView('customer-apply' as any)} className="bg-emerald-600 hover:bg-emerald-700">
                      <ArrowRight className="h-4 w-4 mr-1" /> Apply for a Loan
                    </Button>
                    <Button onClick={() => setView('customer-loan-calculator' as any)} variant="outline">
                      <Calculator className="h-4 w-4 mr-1" /> Calculate Payments
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            {/* Upcoming payments calendar */}
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Upcoming Payments</h3>
              </div>
              {upcomingPayments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No upcoming payments</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingPayments.slice(0, 5).map((pmt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setView('customer-pay-back' as any, { loanId: pmt.loanId })}
                      className={cn(
                        'w-full flex items-center gap-2 p-2 rounded-md border text-left hover:shadow-sm transition-all',
                        pmt.isOverdue ? 'border-red-200 bg-red-50' :
                        pmt.isUrgent ? 'border-amber-200 bg-amber-50' :
                        'border-slate-200 bg-white hover:border-emerald-300'
                      )}
                    >
                      <div className={cn(
                        'h-9 w-9 rounded-md flex flex-col items-center justify-center shrink-0',
                        pmt.isOverdue ? 'bg-red-100 text-red-700' :
                        pmt.isUrgent ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      )}>
                        <span className="text-[9px] font-bold leading-none">{new Date(pmt.dueDate).toLocaleDateString('en-NG', { month: 'short' }).toUpperCase()}</span>
                        <span className="text-xs font-bold leading-none">{new Date(pmt.dueDate).getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900">{fmtNaira(pmt.installment)}</p>
                        <p className="text-[10px] text-slate-500 truncate">{pmt.loanRef}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {pmt.isOverdue ? (
                          <Badge className="bg-red-100 text-red-700 text-[8px]">OVERDUE</Badge>
                        ) : pmt.isUrgent ? (
                          <Badge className="bg-amber-100 text-amber-700 text-[8px]">{pmt.daysUntilDue}d</Badge>
                        ) : (
                          <span className="text-[10px] text-slate-500">{pmt.daysUntilDue}d</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {upcomingPayments.length > 0 && (
                <Button
                  onClick={() => setView('customer-pay-back' as any, { loanId: upcomingPayments[0].loanId })}
                  className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700"
                  size="sm"
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1" /> Make a Payment
                </Button>
              )}
            </Card>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              4.5. GAMIFICATION CARD — Loyalty tier, points, streak, badges
          ════════════════════════════════════════════════════════════════ */}
          <GamificationCard gamification={gamification} setView={setView} />

          {/* ════════════════════════════════════════════════════════════════
              5. RECENT ACTIVITY FEED + ALL LOANS (side by side)
          ════════════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Activity feed */}
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setView('customer-transactions' as any)}>
                  View All <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
              {activityFeed.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {activityFeed.slice(0, 8).map((activity) => {
                    const Icon = ICON_MAP[activity.icon] || FileText;
                    return (
                      <div key={activity.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                        <div className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                          activity.color === 'emerald' && 'bg-emerald-100 text-emerald-600',
                          activity.color === 'red' && 'bg-red-100 text-red-600',
                          activity.color === 'amber' && 'bg-amber-100 text-amber-600',
                          activity.color === 'blue' && 'bg-blue-100 text-blue-600',
                          activity.color === 'purple' && 'bg-purple-100 text-purple-600',
                          activity.color === 'slate' && 'bg-slate-100 text-slate-600',
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900">{activity.title}</p>
                          <p className="text-[11px] text-slate-600 truncate">{activity.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-slate-400">{fmtDateTime(activity.timestamp)}</p>
                            <span className="text-[10px] text-slate-400">·</span>
                            <p className="text-[10px] text-slate-500">{activity.actor}</p>
                          </div>
                        </div>
                        {activity.loanRef && (
                          <Badge variant="outline" className="text-[9px] font-mono shrink-0">{activity.loanRef}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* All loans compact + Relationship manager */}
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-900">My Loans</h3>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setView('customer-loans' as any)}>
                    All <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
                {allLoans.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No loans yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {allLoans.slice(0, 4).map((loan: any) => (
                      <button
                        key={loan.id}
                        onClick={() => setView('customer-loan-breakdown' as any, { loanId: loan.id })}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 text-left"
                      >
                        <div className={cn(
                          'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                          loan.status === 'running' ? 'bg-emerald-100 text-emerald-600' :
                          loan.status === 'paid' ? 'bg-green-100 text-green-600' :
                          loan.status === 'declined' ? 'bg-red-100 text-red-600' :
                          'bg-blue-100 text-blue-600'
                        )}>
                          {loan.status === 'running' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                           loan.status === 'paid' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                           loan.status === 'declined' ? <XCircle className="h-3.5 w-3.5" /> :
                           <Clock className="h-3.5 w-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-900 truncate">{loan.applicationRef}</p>
                          <p className="text-[9px] text-slate-500">{fmtNaira(loan.approvedAmount || loan.amount)}</p>
                        </div>
                        <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Relationship Manager */}
              {rm && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-purple-600" />
                    <h3 className="text-sm font-bold text-slate-900">Your Loan Officer</h3>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-sm font-bold">
                      {rm.firstName?.[0]}{rm.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{rm.firstName} {rm.lastName}</p>
                      <p className="text-[10px] text-slate-500">Loan Officer · {rm.branch?.name || u?.branch?.name || '—'}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <a href={`tel:${rm.phone || ''}`} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 text-xs text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{rm.phone || 'Not available'}</span>
                    </a>
                    <a href={`mailto:${rm.email || ''}`} className="flex items-center gap-2 p-2 rounded-md hover:bg-slate-50 text-xs text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-blue-600" />
                      <span className="truncate">{rm.email || 'Not available'}</span>
                    </a>
                  </div>
                  <Button
                    onClick={() => setView('customer-support' as any)}
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                  >
                    <MessagesSquare className="h-3.5 w-3.5 mr-1" /> Contact Support
                  </Button>
                </Card>
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              6. QUICK ACTIONS — 8 action grid
          ════════════════════════════════════════════════════════════════ */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <QuickAction icon={ArrowRight} label="Apply for Loan" desc="Get funded in 48hrs" color="emerald" onClick={() => setView('customer-apply' as any)} />
              <QuickAction icon={Calculator} label="Loan Calculator" desc="Estimate payments" color="blue" onClick={() => setView('customer-loan-calculator' as any)} />
              <QuickAction icon={CreditCard} label="Make Payment" desc="Pay your loan" color="purple" onClick={() => activeLoans[0] && setView('customer-pay-back' as any, { loanId: activeLoans[0].id })} />
              <QuickAction icon={Receipt} label="Payment History" desc="All transactions" color="amber" onClick={() => setView('customer-transactions' as any)} />
              {liveLoan && (
                <QuickAction icon={FileCheck} label="Decision Status" desc="Track approval" color="blue" onClick={() => setView('customer-decision' as any, { loanId: liveLoan.id })} />
              )}
              {activeLoans[0] && (
                <QuickAction icon={FileText} label="Loan Details" desc="View breakdown" color="emerald" onClick={() => setView('customer-loan-breakdown' as any, { loanId: activeLoans[0].id })} />
              )}
              <QuickAction icon={LifeBuoy} label="Get Help" desc="Support & FAQ" color="amber" onClick={() => setView('customer-support' as any)} />
              <QuickAction icon={User} label="Profile" desc="Account settings" color="slate" onClick={() => setView('customer-profile' as any)} />
            </div>
          </Card>

          {/* ════════════════════════════════════════════════════════════════
              7. PRE-QUALIFIED OFFER (if eligible)
          ════════════════════════════════════════════════════════════════ */}
          {preQualified && (
            <Card className="p-5 bg-gradient-to-r from-purple-600 to-purple-800 text-white border-0 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 90% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              <div className="relative flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                    <Sparkles className="h-6 w-6 text-yellow-300" />
                  </div>
                  <div>
                    <p className="text-purple-200 text-[10px] uppercase tracking-wider">Pre-Qualified Offer</p>
                    <p className="text-lg font-bold">You're eligible for a {fmtNaira(preQualified.amount)} {preQualified.type}!</p>
                    <p className="text-purple-200 text-xs">
                      {preQualified.rate}% p.a. · {preQualified.tenor} months · Valid until {fmtDate(preQualified.validUntil)}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => setView('customer-apply' as any)}
                  className="bg-white text-purple-700 hover:bg-purple-50"
                >
                  Apply Now <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </Card>
          )}

          {/* ════════════════════════════════════════════════════════════════
              8. HELP & RESOURCES
          ════════════════════════════════════════════════════════════════ */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Help & Resources</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ResourceLink icon={HelpCircle} label="FAQ" desc="Common questions" onClick={() => setView('customer-support' as any)} />
              <ResourceLink icon={MessagesSquare} label="Contact Support" desc="Talk to us" onClick={() => setView('customer-support' as any)} />
              <ResourceLink icon={BookOpen} label="Loan Guide" desc="How loans work" onClick={() => setView('customer-support' as any)} />
              <ResourceLink icon={CreditCard} label="Payment Methods" desc="How to repay" onClick={() => setView('customer-pay-back' as any, activeLoans[0] ? { loanId: activeLoans[0].id } : {})} />
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE LOAN HERO COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
function ActiveLoanHero({ loan, setView }: { loan: any; setView: (v: any, p?: any) => void }) {
  const b = loan.breakdown || {};
  const principal = b.principal || loan.approvedAmount || loan.amount;
  const monthlyInstallment = b.monthlyInstallment || 0;
  const outstanding = b.outstandingBalance || principal;
  const progressPct = b.progressPercent || 0;
  const nextDue = b.nextDue;

  return (
    <Card className="overflow-hidden border-0 h-full">
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-emerald-100 text-xs uppercase tracking-wider">Active Loan</p>
            <p className="text-lg font-bold">{loan.applicationRef}</p>
          </div>
          <Badge className="bg-white/20 text-white">{loan.plan?.name || 'Loan'}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-emerald-100 text-[10px] uppercase">Loan Amount</p>
            <p className="text-xl font-bold">{fmtNaira(principal)}</p>
          </div>
          <div>
            <p className="text-emerald-100 text-[10px] uppercase">Monthly Payment</p>
            <p className="text-xl font-bold">{fmtNaira(monthlyInstallment)}</p>
          </div>
          <div>
            <p className="text-emerald-100 text-[10px] uppercase">Outstanding</p>
            <p className="text-xl font-bold">{fmtNaira(outstanding)}</p>
          </div>
          <div>
            <p className="text-emerald-100 text-[10px] uppercase">Next Due</p>
            <p className="text-xl font-bold">{nextDue ? fmtDate(nextDue.dueDate) : '—'}</p>
            <p className="text-emerald-100 text-[10px]">{nextDue ? fmtNaira(nextDue.installment) : ''}</p>
          </div>
        </div>
      </div>
      <div className="p-5 bg-white">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700">Repayment Progress</p>
          <p className="text-xs font-bold text-emerald-600">{progressPct.toFixed(0)}%</p>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          <span>{b.paidCount || 0} of {b.totalCount || 0} payments made</span>
          {b.overdueCount > 0 && <span className="text-red-600 font-semibold">{b.overdueCount} overdue</span>}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={() => setView('customer-loan-breakdown' as any, { loanId: loan.id })} variant="outline" size="sm" className="flex-1">
            <FileText className="h-4 w-4 mr-1" /> View Breakdown
          </Button>
          <Button onClick={() => setView('customer-pay-back' as any, { loanId: loan.id })} className="flex-1 bg-emerald-600 hover:bg-emerald-700" size="sm">
            <CreditCard className="h-4 w-4 mr-1" /> Make Payment
          </Button>
          <Button onClick={() => setView('customer-decision' as any, { loanId: loan.id })} variant="outline" size="sm" className="flex-1">
            <FileCheck className="h-4 w-4 mr-1" /> Decision
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE APPLICATION TRACKER (for in-review loans)
// ═══════════════════════════════════════════════════════════════════════════
function LiveApplicationTracker({ loan, setView }: { loan: any; setView: (v: any, p?: any) => void }) {
  const customerStep = loan.customerStep || 1;
  const customerStepLabel = loan.customerStepLabel || 'Submitted';
  const isOfferReady = customerStep === 4;

  return (
    <Card className="p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Application Status</h3>
          <p className="text-xs text-slate-500">Ref: {loan.applicationRef} · Applied {fmtDate(loan.createdAt)}</p>
        </div>
        <Badge className="bg-blue-100 text-blue-700">In Review</Badge>
      </div>

      {isOfferReady ? (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-900">Your Offer Letter is Ready! 🎉</p>
          <p className="text-xs text-emerald-700 mt-1 mb-3">Review and accept your loan offer to proceed.</p>
          <Button onClick={() => setView('customer-accept-offer' as any, { loanId: loan.id })} className="bg-emerald-600 hover:bg-emerald-700">
            Review & Sign Offer <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : (
        <div>
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4, 5].map((s) => {
              const labels = ['Submitted', 'Under Review', 'Final Decision', 'Offer Ready', 'Disbursement'];
              return (
                <div key={s} className={cn(
                  'flex flex-col items-center gap-1 flex-1',
                  customerStep >= s ? 'text-emerald-600' : 'text-slate-400'
                )}>
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                    customerStep > s ? 'bg-emerald-500 text-white' :
                    customerStep === s ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' :
                    'bg-slate-200 text-slate-400'
                  )}>
                    {customerStep > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                  </div>
                  <span className="text-[10px] text-center hidden md:block">{labels[s - 1]}</span>
                </div>
              );
            })}
          </div>
          <Progress value={(customerStep / 5) * 100} className="mt-2" />
          <p className="text-xs text-slate-600 mt-2 text-center">
            Current stage: <strong>{customerStepLabel}</strong>
          </p>
          <div className="flex gap-2 mt-3">
            <Button onClick={() => setView('customer-decision' as any, { loanId: loan.id })} variant="outline" size="sm" className="flex-1">
              <FileCheck className="h-4 w-4 mr-1" /> View Decision Timeline
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT CARD
// ═══════════════════════════════════════════════════════════════════════════
function StatCard({ icon: Icon, label, value, sub, color, onClick }: any) {
  const colors: any = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <div className={cn('rounded-md p-2 w-fit mb-2', colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-[10px] text-slate-500 truncate">{sub}</p>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTION
// ═══════════════════════════════════════════════════════════════════════════
function QuickAction({ icon: Icon, label, desc, color, onClick }: any) {
  const colors: any = {
    emerald: 'bg-emerald-100 text-emerald-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <button onClick={onClick} className="text-left p-3 rounded-md border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-md transition-all">
      <div className={cn('rounded-md p-2 w-fit mb-2', colors[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-bold text-slate-900">{label}</p>
      <p className="text-[10px] text-slate-500">{desc}</p>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE LINK
// ═══════════════════════════════════════════════════════════════════════════
function ResourceLink({ icon: Icon, label, desc, onClick }: any) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 p-3 rounded-md border border-slate-200 hover:bg-slate-50 text-left">
      <div className="rounded-md bg-slate-100 p-2 shrink-0">
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-900">{label}</p>
        <p className="text-[10px] text-slate-500">{desc}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GAMIFICATION CARD — Loyalty tier, points, streak, badges
// Shows the customer's current tier (Bronze/Silver/Gold/Platinum), total
// loyalty points, on-time payment streak, earned badges, and progress
// toward the next tier.
// ═══════════════════════════════════════════════════════════════════════════
function GamificationCard({
  gamification,
  setView,
}: {
  gamification: any;
  setView: (v: any, p?: any) => void;
}) {
  // Tier → accent colors
  const TIER_COLORS: Record<string, { ring: string; bg: string; text: string; chip: string; gradient: string }> = {
    BRONZE: {
      ring: 'ring-amber-700/30',
      bg: 'bg-amber-100',
      text: 'text-amber-800',
      chip: 'bg-amber-100 text-amber-800',
      gradient: 'from-amber-600 to-amber-800',
    },
    SILVER: {
      ring: 'ring-slate-400/40',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      chip: 'bg-slate-200 text-slate-700',
      gradient: 'from-slate-500 to-slate-700',
    },
    GOLD: {
      ring: 'ring-yellow-500/40',
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      chip: 'bg-yellow-100 text-yellow-800',
      gradient: 'from-yellow-500 to-yellow-700',
    },
    PLATINUM: {
      ring: 'ring-cyan-400/40',
      bg: 'bg-cyan-100',
      text: 'text-cyan-800',
      chip: 'bg-cyan-100 text-cyan-800',
      gradient: 'from-cyan-500 to-cyan-700',
    },
  };

  // ---------- Skeleton while gamification profile loads ----------
  if (!gamification) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-amber-500 animate-pulse" />
          <h3 className="text-sm font-bold text-slate-900">Loyalty & Rewards</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="h-32 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-32 rounded-lg bg-slate-100 animate-pulse lg:col-span-3" />
        </div>
      </Card>
    );
  }

  const tier = (gamification.tier || 'BRONZE') as keyof typeof TIER_COLORS;
  const colors = TIER_COLORS[tier] || TIER_COLORS.BRONZE;
  const tierIcon = gamification.tierIcon || '🥉';
  const tierLabel = gamification.tierLabel || 'Bronze';
  const totalPoints = gamification.totalPoints || 0;
  const streak = gamification.streak || 0;
  const bestStreak = gamification.bestStreak || 0;
  const interestDiscount = (gamification.interestDiscount || 0) * 100;
  const badges = gamification.badges || [];
  const badgeCatalog = gamification.badgeCatalog || [];
  const nextTier = gamification.nextTier;
  const pointsToNext = gamification.pointsToNextTier;

  // Progress toward next tier
  const progressPct = (() => {
    if (!pointsToNext) return 100;
    const thresholds: Record<string, number> = { BRONZE: 0, SILVER: 100, GOLD: 500, PLATINUM: 1000 };
    const currentMin = thresholds[tier] || 0;
    const nextMin = pointsToNext ? thresholds[pointsToNext.nextTier] : currentMin;
    if (nextMin <= currentMin) return 100;
    return Math.min(100, Math.max(0, ((totalPoints - currentMin) / (nextMin - currentMin)) * 100));
  })();

  return (
    <Card className="overflow-hidden border-0">
      {/* Header */}
      <div className={cn('bg-gradient-to-r text-white p-5', colors.gradient)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            <h3 className="text-base font-bold">Loyalty & Rewards</h3>
          </div>
          {interestDiscount > 0 && (
            <Badge className="bg-white/20 text-white text-[10px] border-0">
              {interestDiscount.toFixed(1)}% interest discount
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-center">
          {/* Tier badge (circular) */}
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                'h-20 w-20 rounded-full flex items-center justify-center text-4xl ring-4 bg-white shadow-lg',
                colors.ring,
              )}
            >
              <span aria-hidden>{tierIcon}</span>
            </div>
            <p className="mt-2 text-sm font-bold uppercase tracking-wider">{tierLabel}</p>
            <p className="text-[10px] text-white/80">Credit Tier</p>
          </div>

          {/* Points + progress to next tier */}
          <div className="lg:col-span-2">
            <div className="flex items-end gap-2 mb-1">
              <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
              <p className="text-xs text-white/80 mb-1">loyalty points</p>
            </div>
            <Progress value={progressPct} className="h-2 bg-white/30" />
            <p className="text-[11px] text-white/90 mt-1.5">
              {nextTier && pointsToNext ? (
                <>
                  <strong>{pointsToNext.needed.toLocaleString()}</strong> pts to {pointsToNext.nextTier.toLowerCase()} tier
                </>
              ) : (
                <>Highest tier reached — you&apos;re a Platinum borrower! 💎</>
              )}
            </p>
          </div>

          {/* Streak counter */}
          <div className="rounded-md bg-white/15 p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className={cn('h-5 w-5', streak > 0 ? 'text-orange-300' : 'text-white/50')} />
              <p className="text-2xl font-bold">{streak}</p>
            </div>
            <p className="text-[10px] text-white/80 mt-0.5">
              {streak === 1 ? 'on-time payment' : 'on-time payments'}
            </p>
            <p className="text-[9px] text-white/60 mt-0.5">Best streak: {bestStreak}</p>
          </div>
        </div>
      </div>

      {/* Badges row */}
      <div className="p-5 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Achievement Badges
              <span className="ml-2 text-xs text-slate-500 font-normal">
                {badges.length} of {badgeCatalog.length} unlocked
              </span>
            </h4>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setView('customer-profile' as any)}
            className="text-[11px]"
          >
            View all <ChevronRight className="h-3 w-3 ml-0.5" />
          </Button>
        </div>

        {badgeCatalog.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">
            No badges available yet.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {badgeCatalog.map((b: any) => {
              const earned = b.earned;
              return (
                <div
                  key={b.type}
                  title={`${b.label} — ${b.condition}`}
                  className={cn(
                    'flex-shrink-0 w-24 rounded-lg border p-2.5 text-center transition-all',
                    earned
                      ? 'border-amber-300 bg-amber-50 hover:shadow-md'
                      : 'border-slate-200 bg-slate-50 opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'h-10 w-10 mx-auto rounded-full flex items-center justify-center text-2xl mb-1.5',
                      earned ? 'bg-white shadow-sm' : 'bg-slate-200 grayscale',
                    )}
                  >
                    <span aria-hidden>{earned ? b.icon : '🔒'}</span>
                  </div>
                  <p className={cn('text-[10px] font-semibold truncate', earned ? 'text-slate-900' : 'text-slate-500')}>
                    {b.label}
                  </p>
                  {earned && b.earnedAt && (
                    <p className="text-[8px] text-emerald-600 mt-0.5">Unlocked</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Recent points activity (compact) */}
        {(gamification.recentPoints || []).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Star className="h-3 w-3" /> Recent Points Earned
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(gamification.recentPoints || []).slice(0, 6).map((p: any) => (
                <div
                  key={p.id}
                  className="flex-shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                >
                  <p className={cn('text-xs font-bold', p.points >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {p.points >= 0 ? '+' : ''}{p.points} pts
                  </p>
                  <p className="text-[9px] text-slate-500 capitalize">
                    {p.reason.replace(/_/g, ' ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

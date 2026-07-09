'use client';

import { useAppStore, ViewKey } from '@/lib/store';
import { useBranding } from '@/lib/branding';
import { useEffect, useState } from 'react';
import {
  LogOut, Home, FileText, ArrowRight, Receipt, User, LifeBuoy,
  Calculator, CreditCard, FileCheck, Wallet, TrendingDown, Gift, Shield,
  Building2, Bell, ChevronRight, Sparkles, BookOpen, AlertTriangle,
  CheckCircle2, Clock, HelpCircle, Settings as SettingsIcon, Download,
  MessageCircle, MessagesSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtNaira } from '@/lib/loan-calc';
import { authFetch } from '@/lib/auth-client';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeColor?: 'red' | 'amber' | 'emerald' | 'blue';
  params?: Record<string, any>;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

interface DashboardData {
  stats: {
    activeLoansCount: number;
    pendingLoansCount: number;
    overdueCount?: number;
    kycStatus: string;
    totalOutstanding: number;
    creditStanding: string;
  };
  upcomingPayments?: any[];
  liveLoan?: any;
  activeLoans?: any[];
  alerts?: any[];
}

export function CustomerSidebar() {
  const { currentUser, logoutCustomer, setView, currentView, viewParams } = useAppStore();
  const { config, load: loadBranding } = useBranding();
  const [data, setData] = useState<DashboardData | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overview: true,
    borrowing: true,
    payments: true,
    account: false,
    support: false,
  });

  useEffect(() => {
    if (!useBranding.getState().loaded) loadBranding();
  }, [loadBranding]);

  useEffect(() => {
    if (!currentUser) return;
    authFetch(`/api/customer/dashboard?userId=${currentUser.id}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, [currentUser, currentView]);

  const toggleGroup = (id: string) => setExpandedGroups(s => ({ ...s, [id]: !s[id] }));

  if (!currentUser) return null;

  const u = currentUser;
  const stats = data?.stats;
  const overdueCount = stats?.overdueCount || (data?.upcomingPayments?.filter(p => p.isOverdue).length || 0);
  const upcomingCount = data?.upcomingPayments?.filter(p => !p.isOverdue).length || 0;
  const alertCount = data?.alerts?.length || 0;
  const activeLoanId = data?.activeLoans?.[0]?.id || data?.liveLoan?.id;
  const hasActiveLoan = (data?.activeLoans?.length || 0) > 0;

  const NAV_GROUPS: NavGroup[] = [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { key: 'customer-dashboard', label: 'Dashboard', icon: Home, badge: alertCount > 0 ? alertCount : undefined, badgeColor: 'red' },
        { key: 'customer-loans', label: 'My Loans', icon: FileText, badge: stats?.activeLoansCount || undefined, badgeColor: 'emerald' },
      ],
    },
    {
      id: 'borrowing',
      label: 'Borrowing',
      items: [
        { key: 'customer-apply', label: 'Apply for Loan', icon: ArrowRight },
        { key: 'customer-loan-calculator', label: 'Loan Calculator', icon: Calculator },
        { key: 'customer-loan-products', label: 'Loan Products', icon: BookOpen },
        { key: 'customer-offers', label: 'Pre-Qualified Offers', icon: Sparkles, badge: data?.stats?.pendingLoansCount === 0 && data?.stats?.kycStatus === 'APPROVED' ? 'NEW' : undefined, badgeColor: 'purple' as any },
      ],
    },
    {
      id: 'payments',
      label: 'Payments',
      items: [
        { key: 'customer-pay-back', label: 'Make a Payment', icon: CreditCard, params: activeLoanId ? { loanId: activeLoanId } : undefined, badge: overdueCount > 0 ? overdueCount : undefined, badgeColor: 'red' },
        { key: 'customer-transactions', label: 'Payment History', icon: Receipt },
      ],
    },
    {
      id: 'account',
      label: 'My Account',
      items: [
        { key: 'customer-profile', label: 'Profile & KYC', icon: User, badge: stats?.kycStatus !== 'APPROVED' ? '!' : undefined, badgeColor: 'amber' },
        { key: 'customer-documents', label: 'Documents', icon: Download },
        { key: 'customer-bank-accounts', label: 'Bank Accounts', icon: Building2 },
        { key: 'customer-security', label: 'Security', icon: Shield },
      ],
    },
    {
      id: 'support',
      label: 'Support',
      items: [
        { key: 'customer-faq', label: 'Knowledge Base', icon: HelpCircle },
        { key: 'customer-chat', label: 'Chat with Loan Officer', icon: MessageCircle },
        { key: 'customer-support', label: 'Help Center', icon: MessagesSquare },
        { key: 'customer-referral', label: 'Refer & Earn', icon: Gift },
      ],
    },
  ];

  const handleNavClick = (item: NavItem) => {
    setView(item.key, item.params);
  };

  return (
    <aside className="fixed lg:static left-0 top-0 z-40 h-screen w-64 bg-slate-900 text-slate-200 flex flex-col transition-transform lg:translate-x-0 shrink-0">
      {/* Brand header */}
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-4 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shrink-0 overflow-hidden p-0.5">
          <img
            src={config.logoUrl}
            alt={config.siteName}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{config.siteShortName}</p>
          <p className="text-[9px] text-slate-400 uppercase truncate">Borrower Portal</p>
        </div>
      </div>

      {/* Quick CTA — Apply for Loan */}
      <div className="p-3 border-b border-slate-800 shrink-0">
        <button
          onClick={() => setView('customer-apply')}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 px-3 py-2 text-xs font-bold text-white hover:from-emerald-500 hover:to-emerald-600 transition-all shadow-md"
        >
          <ArrowRight className="h-3.5 w-3.5" /> Apply for Loan
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => {
          const isExpanded = expandedGroups[group.id];
          return (
            <div key={group.id} className="mb-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center gap-1 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
              >
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronRight className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')} />
              </button>
              {isExpanded && (
                <div className="space-y-0.5 mt-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = currentView === item.key &&
                      (!item.params || JSON.stringify(item.params) === JSON.stringify(viewParams));
                    return (
                      <button
                        key={item.key}
                        onClick={() => handleNavClick(item)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors',
                          active
                            ? 'bg-emerald-600/20 text-emerald-400 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge !== 0 && (
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none',
                            item.badgeColor === 'red' && 'bg-red-500 text-white',
                            item.badgeColor === 'amber' && 'bg-amber-500 text-white',
                            item.badgeColor === 'emerald' && 'bg-emerald-500 text-white',
                            item.badgeColor === 'blue' && 'bg-blue-500 text-white',
                            (item.badgeColor as any) === 'purple' && 'bg-purple-500 text-white',
                          )}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mini active loan summary (if any) */}
      {hasActiveLoan && data?.activeLoans?.[0] && (
        <div className="px-3 py-2 border-t border-slate-800 shrink-0">
          <button
            onClick={() => setView('customer-loan-breakdown', { loanId: data.activeLoans[0].id })}
            className="w-full rounded-md bg-slate-800 p-2.5 text-left hover:bg-slate-700 transition-colors"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3 w-3 text-emerald-400" />
              <p className="text-[9px] uppercase tracking-wider text-slate-400">Active Loan</p>
            </div>
            <p className="text-xs font-mono font-semibold text-white truncate">{data.activeLoans[0].applicationRef}</p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-slate-400">Outstanding</p>
              <p className="text-xs font-bold text-emerald-400">{fmtNaira(data.activeLoans[0].breakdown?.outstandingBalance || 0)}</p>
            </div>
            {data.activeLoans[0].breakdown?.nextDue && (
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-[10px] text-slate-400">Next Due</p>
                <p className="text-[10px] text-amber-400">{fmtNaira(data.activeLoans[0].breakdown.nextDue.installment)}</p>
              </div>
            )}
          </button>
        </div>
      )}

      {/* User profile card */}
      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shrink-0">
            {u?.firstName?.[0]}{u?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{u?.firstName} {u?.lastName}</p>
            <p className="text-[10px] text-slate-400 font-mono truncate">{u?.accountNumber}</p>
          </div>
          <button onClick={logoutCustomer} className="text-slate-400 hover:text-red-400 shrink-0" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {/* KYC + Credit standing badges */}
        <div className="flex items-center gap-1 mt-2">
          {stats?.kycStatus === 'APPROVED' ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-2 w-2" /> KYC
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-semibold text-amber-400">
              <AlertTriangle className="h-2 w-2" /> KYC {stats?.kycStatus || 'PENDING'}
            </span>
          )}
          {stats?.creditStanding && (
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] font-semibold',
              stats.creditStanding === 'EXCELLENT' || stats.creditStanding === 'GOOD' ? 'bg-emerald-500/20 text-emerald-400' :
              stats.creditStanding === 'DUE SOON' ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'
            )}>
              {stats.creditStanding === 'EXCELLENT' || stats.creditStanding === 'GOOD' ? <CheckCircle2 className="h-2 w-2" /> :
               stats.creditStanding === 'DUE SOON' ? <Clock className="h-2 w-2" /> :
               <AlertTriangle className="h-2 w-2" />}
              {stats.creditStanding}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

// Mobile overlay wrapper — call this in the main layout
export function CustomerSidebarWithOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />
      <div className="fixed left-0 top-0 z-40 h-screen lg:hidden">
        <CustomerSidebar />
      </div>
    </>
  );
}

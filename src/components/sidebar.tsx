'use client';

import { useAppStore, ViewKey } from '@/lib/store';
import { hasPermission, hasAnyPermission } from '@/lib/constants';
import { useBranding } from '@/lib/branding';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, UserPlus, FileText, Gavel, Landmark, Calculator,
  ShieldCheck, Building2, Settings, ChevronDown, LogOut, User, Wallet,
  TrendingUp, PiggyBank, FileSearch, AlertTriangle, Scale, BookOpen,
  BarChart3, Bell, Search, Menu, X, Banknote, Receipt, FileCheck,
  GitBranch, Lock, Activity, ScrollText, Coins, ArrowRightLeft, Palette,
  Newspaper, CheckCircle2,
  Server, ToggleRight, Power, Clock, FormInput, PieChart, DollarSign,
  Headphones, Briefcase, Search as SearchIcon, Target,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string | string[];
  badge?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'core',
    label: 'Core Banking',
    icon: LayoutDashboard,
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        key: 'onboarding', label: 'New Application', icon: UserPlus,
        permission: ['onboarding', 'loanOrigination'],
      },
      { key: 'kyc', label: 'KYC Verification', icon: ShieldCheck, permission: 'kycVerify' },
      { key: 'kyc-field-manager', label: 'KYC Field Manager', icon: FormInput, permission: 'kycVerify' },
      { key: 'customers', label: 'Client Database', icon: Users },
    ],
  },
  {
    id: 'credit',
    label: 'Credit Governance',
    icon: FileText,
    items: [
      { key: 'loan-origination', label: '1. LO Origination', icon: FileText, permission: 'loanOrigination' },
      { key: 'loan-legal', label: '2. Legal KYC/CAC', icon: Scale, permission: 'loanLegal' },
      { key: 'loan-vetting', label: '3. BM Vetting', icon: UserCheck, permission: 'loanVetting' },
      { key: 'loan-structuring', label: '4. HOC Assignment', icon: GitBranch, permission: 'loanStructuring' },
      { key: 'loan-analyst', label: '6. Analyst Structuring', icon: FileSearch, permission: 'loanAnalyst' },
      { key: 'loan-hoc-confirmation', label: '7. HOC Confirmation', icon: CheckCircle2, permission: 'loanStructuring' },
      { key: 'loan-risk', label: '8. CRO Risk Assessment', icon: AlertTriangle, permission: 'loanRisk' },
      { key: 'loan-cfo', label: '9. CFO Liquidity Review', icon: Banknote, permission: 'loanCfoReview' },
      { key: 'loan-md', label: '11. MD/MCC Approval', icon: Gavel, permission: 'loanMcc' },
      { key: 'loan-internal-control', label: '12. Internal Control', icon: FileCheck, permission: 'internalControl' },
      { key: 'loan-compliance-review', label: '13. Compliance Review', icon: ShieldCheck, permission: 'compliance' },
      { key: 'loan-finalization', label: '14. HOC Go-Live', icon: FileCheck, permission: 'loanFinalization' },
      { key: 'loan-disbursement', label: '15. CFO Disbursement', icon: Wallet, permission: 'loanDisbursement' },
      { key: 'loan-post-disbursement', label: '16. Post-Disbursement Handoff', icon: Wallet, permission: 'loanPortfolio' },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio & Monitoring',
    icon: TrendingUp,
    items: [
      { key: 'loan-portfolio', label: 'Active Loans', icon: TrendingUp, permission: 'loanPortfolio' },
      { key: 'loan-repayments', label: 'Repayment Tracking', icon: Receipt, permission: 'loanPortfolio' },
      { key: 'loan-early-warning', label: 'Early Warning Signals', icon: AlertTriangle, permission: 'loanRisk' },
      { key: 'loan-collections', label: 'Collections', icon: Wallet, permission: 'loanPortfolio' },
      { key: 'loan-npl', label: 'NPL / Defaulters', icon: AlertTriangle, permission: 'loanPortfolio' },
      { key: 'loan-closure', label: 'Loan Closure', icon: CheckCircle2, permission: 'loanFinalization' },
      { key: 'loan-closed', label: 'Closed History', icon: BookOpen, permission: 'loanPortfolio' },
    ],
  },
  {
    id: 'mcc',
    label: 'MCC Committee',
    icon: Gavel,
    items: [
      { key: 'mcc', label: 'MCC Decisions', icon: Gavel, permission: 'loanMcc' },
    ],
  },
  {
    id: 'treasury',
    label: 'Treasury',
    icon: Landmark,
    items: [
      { key: 'treasury-dashboard', label: 'Treasury Dashboard', icon: LayoutDashboard, permission: ['treasuryOnboard', 'treasuryBook', 'treasuryAssets'] },
      { key: 'treasury-investors', label: 'Investor Onboarding', icon: UserPlus, permission: 'treasuryOnboard' },
      { key: 'treasury-products', label: 'Product Config', icon: Settings, permission: 'treasuryOnboard' },
      { key: 'treasury-book', label: 'Book Investment', icon: Banknote, permission: 'treasuryBook' },
      { key: 'treasury-redemptions', label: 'Redemptions', icon: ArrowRightLeft, permission: 'treasuryBook' },
      { key: 'treasury-assets', label: 'Bank Assets', icon: Coins, permission: 'treasuryAssets' },
      { key: 'treasury-reports', label: 'Profitability (NIM)', icon: BarChart3, permission: ['treasuryOnboard', 'treasuryBook', 'treasuryAssets'] },
    ],
  },
  {
    id: 'accounting',
    label: 'Accounting & GL',
    icon: Calculator,
    items: [
      { key: 'accounting-dashboard', label: 'Accounting Dashboard', icon: LayoutDashboard, permission: ['accountingView', 'accountingPost'] },
      { key: 'accounting-coa', label: 'Chart of Accounts', icon: BookOpen, permission: 'accountingView' },
      { key: 'accounting-journal', label: 'Journal Entries', icon: ArrowRightLeft, permission: 'accountingPost' },
      { key: 'accounting-statements', label: 'Financial Statements', icon: FileText, permission: 'accountingView' },
      { key: 'accounting-reconciliation', label: 'Bank Reconciliation', icon: GitBranch, permission: 'accountingPost' },
      { key: 'accounting-invoices', label: 'Invoicing & AR', icon: Receipt, permission: 'accountingView' },
      { key: 'accounting-expenses', label: 'Expense Tracking', icon: Receipt, permission: 'accountingPost' },
      { key: 'accounting-payroll', label: 'Payroll', icon: Users, permission: 'accountingPost' },
      { key: 'accounting-teller', label: 'Teller Operations', icon: Banknote, permission: 'accountingPost' },
      { key: 'accounting-tills', label: 'Till Management', icon: Wallet, permission: 'accountingPost' },
      { key: 'accounting-ap', label: 'Accounts Payable', icon: Receipt, permission: 'accountingView' },
      { key: 'accounting-ar', label: 'Accounts Receivable', icon: Receipt, permission: 'accountingView' },
      { key: 'accounting-reports', label: 'Reporting Hub', icon: BarChart3, permission: 'accountingView' },
    ],
  },
  {
    id: 'governance',
    label: 'Governance & Compliance',
    icon: ShieldCheck,
    items: [
      { key: 'audit-trail', label: 'Audit Trail', icon: ScrollText, permission: 'auditAccess' },
      { key: 'audit-logins', label: 'Login History', icon: Lock, permission: 'auditAccess' },
      { key: 'audit-activity', label: 'Activity Log', icon: Activity, permission: 'auditAccess' },
      { key: 'compliance-monitoring', label: 'Compliance Monitoring', icon: ShieldCheck, permission: 'compliance' },
      { key: 'compliance-policies', label: 'Policy Documents', icon: BookOpen, permission: 'compliance' },
      { key: 'compliance-conditions', label: 'Compliance Conditions', icon: FileCheck, permission: ['compliance', 'internalControl'] },
      { key: 'compliance-checklist', label: 'Pre-Disbursement', icon: FileCheck, permission: 'internalControl' },
      { key: 'ic-risk', label: 'Risk Assessment', icon: AlertTriangle, permission: 'internalControl' },
      { key: 'ic-exceptions', label: 'Exception Reports', icon: AlertTriangle, permission: 'internalControl' },
    ],
  },
  {
    id: 'system',
    label: 'System Administration',
    icon: Settings,
    items: [
      { key: 'staff-performance', label: 'Performance Dashboard', icon: PieChart, permission: 'generalSettings' },
      { key: 'branch-targets', label: 'Branch Targets', icon: Target },
      { key: 'staff', label: 'Staff List & Edit', icon: Users, permission: 'generalSettings' },
      { key: 'staff-create', label: 'Create New Staff', icon: UserPlus, permission: 'generalSettings' },
      { key: 'branches', label: 'Branch Network', icon: Building2, permission: 'branchManage' },
      { key: 'loan-products', label: 'Loan Products', icon: FileText, permission: 'generalSettings' },
      { key: 'sectors', label: 'Business Sectors', icon: TrendingUp, permission: 'generalSettings' },
      { key: 'branding-settings', label: 'Branding & Identity', icon: Palette },
      { key: 'change-password', label: 'Change Password', icon: Lock },
      { key: 'settings', label: 'Global Config', icon: Settings, permission: 'generalSettings' },
    ],
  },
  {
    id: 'cs',
    label: 'Customer Service',
    icon: Headphones,
    items: [
      { key: 'cs-kyc-queue', label: 'KYC Verification Queue', icon: ShieldCheck, permission: 'csKycVerify' },
      { key: 'kyc', label: 'Legacy KYC Queue', icon: ShieldCheck, permission: 'kycVerify' },
      { key: 'cs-payment-verification', label: 'Payment Verification', icon: DollarSign, permission: 'csPaymentVerify' },
    ],
  },
  {
    id: 'legal',
    label: 'Legal',
    icon: Scale,
    items: [
      { key: 'legal-cac-search', label: 'CAC Name Search', icon: SearchIcon, permission: 'legalCacSearch' },
      { key: 'legal-mcc', label: 'MCC Compliance', icon: FileCheck, permission: 'legalMcc' },
    ],
  },
  {
    id: 'portfolio',
    label: 'My Portfolio',
    icon: Briefcase,
    items: [
      { key: 'my-portfolio', label: 'Monitored Loans', icon: Wallet, permission: 'loanPortfolio' },
    ],
  },
  {
    id: 'communication',
    label: 'Communication',
    icon: Newspaper,
    items: [
      { key: 'blog-manager', label: 'Blog Manager', icon: Newspaper, permission: 'message' },
      { key: 'comm-announcements', label: 'Announcements', icon: Newspaper, permission: 'message' },
      { key: 'comm-message-center', label: 'Message Center', icon: FileText, permission: 'message' },
      { key: 'comm-notification-center', label: 'Notification Center', icon: Bell, permission: 'message' },
      { key: 'comm-email-templates', label: 'Email Templates', icon: FileText, permission: 'message' },
      { key: 'comm-sms-broadcast', label: 'SMS Broadcast', icon: FileText, permission: 'message' },
      { key: 'comm-email-campaigns', label: 'Email Campaigns', icon: Newspaper, permission: 'message' },
      { key: 'comm-customer-service', label: 'Customer Service', icon: Users, permission: 'message' },
    ],
  },
  {
    id: 'superadmin',
    label: 'SuperAdmin Control',
    icon: Server,
    items: [
      { key: 'superadmin-dashboard', label: 'Platform Dashboard', icon: LayoutDashboard },
      { key: 'superadmin-system-health', label: 'System Health', icon: Server },
      { key: 'superadmin-feature-flags', label: 'Feature Flags', icon: ToggleRight },
      { key: 'fee-manager', label: 'Fee Manager', icon: DollarSign },
      { key: 'superadmin-maintenance', label: 'Maintenance Mode', icon: Power },
      { key: 'superadmin-sessions', label: 'Active Sessions', icon: Lock },
      { key: 'superadmin-audit-retention', label: 'Audit Retention', icon: Clock },
    ],
  },
];

// Add missing import alias
import { UserCheck } from 'lucide-react';

export function Sidebar() {
  // Use selectors to prevent unnecessary re-renders
  const currentAdmin = useAppStore((s) => s.currentAdmin);
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebar = useAppStore((s) => s.setSidebar);
  const { config, load: loadBranding } = useBranding();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    core: true,
    credit: true,
    portfolio: true,
    mcc: true,
    treasury: true,
    accounting: true,
    governance: true,
    system: true,
    communication: true,
    superadmin: true,
    cs: true,
    legal: true,
  });

  useEffect(() => {
    if (!useBranding.getState().loaded) loadBranding();
  }, [loadBranding]);

  // v41: Fetch pending counts for sidebar badges (KYC queue, CS payments, Legal CAC)
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!currentAdmin) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const counts: Record<string, number> = {};
        // CS KYC queue count
        if (currentAdmin.role === 'super' || currentAdmin.role === 'cs' || currentAdmin.csKycVerify || currentAdmin.kycVerify) {
          try {
            const r = await authFetch('/api/admin/kyc').catch(() => null as any);
            if (r && r.ok) {
              const d = await r.json();
              const pending = (d.users || []).filter((u: any) =>
                u.kycStatus === 'PROCESSING' || u.kycStatus === 'PENDING' || u.kycStatus === 'RESUBMIT'
              ).length;
              if (pending > 0) counts['cs-kyc-queue'] = pending;
            }
          } catch {}
        }
        // CS payment verification count
        if (currentAdmin.role === 'super' || currentAdmin.role === 'cs' || currentAdmin.csPaymentVerify) {
          try {
            const r = await authFetch('/api/admin/cs/payments?status=pending').catch(() => null as any);
            if (r && r.ok) {
              const d = await r.json();
              const pending = (d.payments || []).length;
              if (pending > 0) counts['cs-payment-verification'] = pending;
            }
          } catch {}
        }
        // Legal CAC search count
        if (currentAdmin.role === 'super' || currentAdmin.legalCacSearch) {
          try {
            const r = await authFetch('/api/legal/cac-search').catch(() => null as any);
            if (r && r.ok) {
              const d = await r.json();
              const pending = (d.cases || []).filter((c: any) =>
                c.status === 'pending' || c.status === 'in_review' || c.status === 'customer_responded'
              ).length;
              if (pending > 0) counts['legal-cac-search'] = pending;
            }
          } catch {}
        }
        if (!cancelled) setPendingCounts(counts);
      } catch {}
    };
    fetchCounts();
    // Refresh every 60 seconds
    const interval = setInterval(fetchCounts, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentAdmin]);

  const toggleGroup = (id: string) =>
    setExpandedGroups((s) => ({ ...s, [id]: !s[id] }));

  const isVisible = (item: NavItem) => {
    // Branding is super-admin only
    if (item.key === 'branding-settings') return currentAdmin?.role === 'super';
    // All v24 SuperAdmin Control items are super-admin only
    if (item.key.startsWith('superadmin-')) return currentAdmin?.role === 'super';
    if (!item.permission) return true;
    if (currentAdmin?.role === 'super') return true;
    if (Array.isArray(item.permission)) {
      return hasAnyPermission(currentAdmin, item.permission);
    }
    return hasPermission(currentAdmin, item.permission);
  };

  const isGroupVisible = (group: NavGroup) => {
    if (group.id === 'superadmin') return currentAdmin?.role === 'super';
    return true;
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebar(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-72 bg-slate-900 dark:bg-slate-950 text-slate-200 transition-transform duration-300 lg:static lg:z-0 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shrink-0 overflow-hidden p-1">
            <img
              src={config.logoUrl}
              alt={config.siteName}
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                // Fallback to Landmark icon if logo fails to load
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{config.siteShortName}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate">{config.tagline}</p>
          </div>
          <button
            onClick={() => setSidebar(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="h-[calc(100vh-4rem-4rem)] overflow-y-auto py-4 px-3">
          {NAV_GROUPS.map((group) => {
            if (!isGroupVisible(group)) return null;
            const visibleItems = group.items.filter(isVisible);
            if (visibleItems.length === 0) return null;

            const isExpanded = expandedGroups[group.id];
            const GroupIcon = group.icon;

            return (
              <div key={group.id} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
                >
                  <GroupIcon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </button>

                {isExpanded && (
                  <div className="space-y-0.5 mt-1">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const active = currentView === item.key;
                      return (
                        <button
                          key={item.key}
                          onClick={() => setView(item.key)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                            active
                              ? 'bg-emerald-600/20 text-emerald-400 font-medium'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {/* v41: Dynamic pending count badge */}
                          {pendingCounts[item.key] && (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
                              {pendingCounts[item.key]}
                            </span>
                          )}
                          {item.badge && !pendingCounts[item.key] && (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
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

        {/* User card */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
              {currentAdmin?.firstName?.[0]}
              {currentAdmin?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {currentAdmin?.firstName} {currentAdmin?.lastName}
              </p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                {currentAdmin?.role}
              </p>
            </div>
            <button
              onClick={() => useAppStore.getState().logout()}
              className="text-slate-400 hover:text-red-400"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

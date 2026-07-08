'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Menu, Search, Sun, Moon, ChevronRight } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { NotificationBell } from '@/components/notification-bell';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  onboarding: 'Customer Onboarding',
  kyc: 'KYC Verification Queue',
  customers: 'Client Database',
  'loan-origination': 'Origination & Drafts',
  'loan-vetting': 'BM Vetting Queue',
  'loan-structuring': 'HOC Assignment & Structuring',
  'loan-analyst': 'Analyst Structuring',
  'loan-risk': 'CRO Risk Assessment',
  'loan-cfo': 'CFO Liquidity Review',
  'loan-legal': 'Legal KYC & Aggregation',
  'loan-md': 'MD Executive Approval',
  'loan-finalization': 'HOC Go-Live & Scheduling',
  'loan-disbursement': 'CFO Disbursement Queue',
  'loan-portfolio': 'Active Portfolio',
  'loan-repayments': 'Repayment Tracking',
  'loan-early-warning': 'Early Warning Signals',
  'loan-collections': 'Collections',
  'loan-closure': 'Loan Closure',
  'loan-npl': 'Non-Performing Loans',
  'loan-closed': 'Closed Loans',
  mcc: 'MCC Decision Ledger',
  'mcc-detail': 'MCC Decision Paper',
  cam: 'Universal CAM',
  'loan-detail': 'Loan Detail',
  'customer-detail': 'Customer Detail',
  'treasury-dashboard': 'Treasury Dashboard',
  'treasury-investors': 'Investor Onboarding',
  'treasury-products': 'Treasury Products',
  'treasury-book': 'Book Investment',
  'treasury-redemptions': 'Redemptions',
  'treasury-assets': 'Bank Assets',
  'treasury-reports': 'Profitability Report (NIM)',
  'accounting-dashboard': 'Accounting Dashboard',
  'accounting-coa': 'Chart of Accounts',
  'accounting-journal': 'Journal Entries',
  'accounting-statements': 'Financial Statements',
  'accounting-reconciliation': 'Bank Reconciliation',
  'accounting-invoices': 'Invoices & AR',
  'accounting-expenses': 'Expense Tracking',
  'accounting-payroll': 'Payroll',
  'accounting-teller': 'Teller Operations',
  'accounting-tills': 'Till Management',
  'accounting-ap': 'Accounts Payable',
  'accounting-ar': 'Accounts Receivable',
  'accounting-reports': 'Reporting Hub',
  'audit-trail': 'Audit Trail',
  'audit-logins': 'Login History',
  'audit-activity': 'Activity Log',
  'compliance-monitoring': 'Compliance Monitoring',
  'compliance-policies': 'Policy Documents',
  'compliance-conditions': 'Compliance Conditions',
  'compliance-checklist': 'Pre-Disbursement Checklist',
  'ic-risk': 'Risk Assessment',
  'ic-exceptions': 'Exception Reports',
  branches: 'Branch Network',
  staff: 'Staff & Access Control',
  'loan-products': 'Loan Products',
  sectors: 'Business Sectors',
  settings: 'Global Configuration',
  'blog-manager': 'Blog Manager',
  'comm-announcements': 'Announcements',
  'comm-message-center': 'Message Center',
  'comm-notification-center': 'Notification Center',
  'comm-email-templates': 'Email Templates',
  'comm-sms-broadcast': 'SMS Broadcast',
  'comm-email-campaigns': 'Email Campaigns',
  'comm-customer-service': 'Customer Service',
  'search-results': 'Search Results',
  login: 'Sign In',
};

export function Topbar() {
  const { currentView, toggleSidebar, theme, toggleTheme, currentAdmin, setView } =
    useAppStore();
  const title = VIEW_TITLES[currentView] || 'Dashboard';
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K → focus search box
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const runSearch = () => {
    const q = search.trim();
    if (!q) return;
    setView('search-results', { q });
    inputRef.current?.blur();
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 px-4 backdrop-blur lg:px-6">
      <button
        onClick={toggleSidebar}
        className="lg:hidden text-slate-600 dark:text-slate-300"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span>Banking</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-slate-700 dark:text-slate-200 font-medium">{title}</span>
        </div>
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h1>
      </div>

      <div className="hidden md:flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm w-72">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search loans, customers, BVN..."
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={runSearch}
          aria-label="Search"
          className="text-slate-400 hover:text-emerald-600"
        >
          <Search className="h-4 w-4" />
        </button>
        <kbd className="hidden lg:inline rounded bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">
          ⌘K
        </kbd>
      </div>

      <button
        onClick={toggleTheme}
        className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>

      <NotificationBell adminId={currentAdmin?.id} />

      {currentAdmin && (
        <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            {currentAdmin.firstName?.[0]}{currentAdmin.lastName?.[0]}
          </div>
          <div className="text-xs leading-tight">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{currentAdmin.firstName} {currentAdmin.lastName}</p>
            <p className="text-slate-500 dark:text-slate-400">{ROLE_LABELS[currentAdmin.role] || currentAdmin.role}</p>
          </div>
        </div>
      )}
    </header>
  );
}

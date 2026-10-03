'use client';

import { getAuthToken, clearAuthToken, clearCustomerAuthToken } from '@/lib/auth-client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewKey =
  | 'dashboard'
  | 'onboarding'
  | 'kyc'
  | 'customers'
  | 'loan-origination'
  | 'loan-vetting'
  | 'loan-structuring'
  | 'loan-analyst'
  | 'loan-risk'
  | 'loan-cfo'
  | 'loan-legal'
  | 'loan-md'
  | 'loan-finalization'
  | 'loan-disbursement'
  | 'loan-portfolio'
  | 'loan-repayments'
  | 'loan-early-warning'
  | 'loan-collections'
  | 'loan-closure'
  | 'loan-npl'
  | 'loan-closed'
  | 'mcc'
  | 'mcc-detail'
  | 'treasury-dashboard'
  | 'treasury-investors'
  | 'treasury-products'
  | 'treasury-book'
  | 'treasury-redemptions'
  | 'treasury-assets'
  | 'treasury-reports'
  | 'accounting-dashboard'
  | 'accounting-coa'
  | 'accounting-journal'
  | 'accounting-statements'
  | 'accounting-reconciliation'
  | 'accounting-invoices'
  | 'accounting-expenses'
  | 'accounting-payroll'
  | 'accounting-teller'
  | 'accounting-tills'
  | 'accounting-ap'
  | 'accounting-ar'
  | 'accounting-reports'
  | 'audit-trail'
  | 'audit-logins'
  | 'audit-activity'
  | 'compliance-monitoring'
  | 'compliance-policies'
  | 'compliance-conditions'
  | 'compliance-checklist'
  | 'ic-risk'
  | 'ic-exceptions'
  | 'branches'
  | 'staff'
  | 'loan-products'
  | 'sectors'
  | 'settings'
  | 'cam'
  | 'loan-detail'
  | 'customer-detail'
  | 'staff-detail'
  | 'login'
  | 'super-admin-login'
  | 'branding-settings'
  | 'public-home'
  | 'public-about'
  | 'public-contact'
  | 'public-blog'
  | 'customer-login'
  | 'customer-dashboard'
  | 'customer-loans'
  | 'customer-loan-breakdown'
  | 'customer-loan-calculator'
  | 'customer-loan-products'
  | 'customer-offers'
  | 'customer-pay-back'
  | 'customer-decision'
  | 'customer-apply'
  | 'customer-accept-offer'
  | 'customer-savings'
  | 'customer-investments'
  | 'customer-transactions'
  | 'customer-documents'
  | 'customer-bank-accounts'
  | 'customer-security'
  | 'customer-profile'
  | 'customer-support'
  | 'customer-verify-email'
  | 'customer-verify-phone'
  | 'customer-referral'
  | 'customer-kyc'
  | 'customer-faq'
  | 'customer-chat'
  | 'search-results'
  | 'blog-manager'
  | 'setup'
  | 'comm-announcements'
  | 'comm-message-center'
  | 'comm-notification-center'
  | 'comm-email-templates'
  | 'comm-sms-broadcast'
  | 'comm-email-campaigns'
  | 'comm-customer-service'
  | 'superadmin-dashboard'
  | 'superadmin-feature-flags'
  | 'superadmin-maintenance'
  | 'superadmin-sessions'
  | 'superadmin-system-health'
  | 'superadmin-audit-retention'
  | 'staff-performance'
  | 'kyc-field-manager'
  | 'customer-kyc-dynamic'
  | 'fee-manager'
  | 'staff-create'
  | 'change-password'
  | 'forgot-password'
  | 'reset-password'
  | 'legal-cac-search'
  | 'legal-mcc'
  | 'cs-kyc-queue'
  | 'cs-payment-verification'
  | 'my-portfolio'
  | 'branch-targets'
  | 'loan-hoc-confirmation'
  | 'loan-compliance-review'
  | 'loan-internal-control'
  | 'loan-post-disbursement'
  | 'respond-to-legal';

export type Portal = 'public' | 'customer' | 'admin';

interface AppState {
  // Auth — Staff (Admin)
  currentAdminId: string | null;
  currentAdmin: any | null;
  loginAs: (adminId: string, admin: any) => void;
  logout: () => void;

  // Auth — Customer (User)
  currentUserId: string | null;
  currentUser: any | null;
  loginAsCustomer: (userId: string, user: any) => void;
  logoutCustomer: () => void;

  // Portal
  portal: Portal;
  setPortal: (p: Portal) => void;

  // Navigation
  currentView: ViewKey;
  viewParams: Record<string, any>;
  setView: (view: ViewKey, params?: Record<string, any>) => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebar: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentAdminId: null,
      currentAdmin: null,

      loginAs: (adminId, admin) =>
        set({
          currentAdminId: adminId,
          currentAdmin: admin,
          portal: 'admin',
          currentView: 'dashboard',
        }),

      logout: () => {
        const token = getAuthToken();

        if (token && typeof window !== 'undefined') {
          void fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }

        clearAuthToken();
        clearCustomerAuthToken();

        set({
          currentAdminId: null,
          currentAdmin: null,
          portal: 'public',
          currentView: 'public-home',
        });
      },

      currentUserId: null,
      currentUser: null,

      loginAsCustomer: (userId, user) =>
        set({
          currentUserId: userId,
          currentUser: user,
          portal: 'customer',
          currentView: 'customer-dashboard',
        }),

      logoutCustomer: () => {
        const token = getAuthToken();

        if (token && typeof window !== 'undefined') {
          void fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }

        clearAuthToken();
        clearCustomerAuthToken();

        set({
          currentUserId: null,
          currentUser: null,
          portal: 'public',
          currentView: 'public-home',
        });
      },

      portal: 'public',
      setPortal: (p) => set({ portal: p }),

      currentView: 'public-home',
      viewParams: {},

      setView: (view, params = {}) =>
        set({
          currentView: view,
          viewParams: params,
        }),

      sidebarOpen: true,
      toggleSidebar: () =>
        set((s) => ({
          sidebarOpen: !s.sidebarOpen,
        })),

      setSidebar: (open) =>
        set({
          sidebarOpen: open,
        }),

      theme: 'light',
      toggleTheme: () =>
        set((s) => ({
          theme: s.theme === 'light' ? 'dark' : 'light',
        })),
    }),
    {
      name: 'watershed-banking',

      partialize: (s) => ({
        currentAdminId: s.currentAdminId,
        currentAdmin: s.currentAdmin,
        currentUserId: s.currentUserId,
        currentUser: s.currentUser,
        portal: s.portal,
        currentView: s.currentView,
        sidebarOpen: s.sidebarOpen,
        theme: s.theme,
      }),
    }
  )
);
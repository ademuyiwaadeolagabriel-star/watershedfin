'use client';

import { useAppStore } from '@/lib/store';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { LoginView } from '@/components/views/login';
import { SuperAdminLoginView } from '@/components/views/super-admin-login';
import { CustomerLoginView } from '@/components/views/customer-login';
import { PublicHome } from '@/components/views/public/public-home';
import { PublicAbout } from '@/components/views/public/public-about';
import { PublicContact } from '@/components/views/public/public-contact';
import { PublicBlog } from '@/components/views/public/public-blog';
import { DashboardView } from '@/components/views/dashboard';
import { LoanListView } from '@/components/views/loan/loan-list';
import { LoanDetailView } from '@/components/views/loan/loan-detail';
import { OnboardingView } from '@/components/views/onboarding';
import { CustomerDetailView } from '@/components/views/customer-detail';
import { MccListView } from '@/components/views/mcc/mcc-list';
import { MccDetailView } from '@/components/views/mcc/mcc-detail';
import { AuditTrailView } from '@/components/views/governance/audit-trail';
import { AuditLoginsView } from '@/components/views/governance/audit-logins';
import { AuditActivityView } from '@/components/views/governance/audit-activity';
import { ComplianceMonitoringView } from '@/components/views/governance/compliance-monitoring';
import { CompliancePoliciesView } from '@/components/views/governance/compliance-policies';
import { ComplianceConditionsView } from '@/components/views/governance/compliance-conditions';
import { ComplianceChecklistView } from '@/components/views/governance/compliance-checklist';
import { IcRiskView } from '@/components/views/governance/ic-risk';
import { IcExceptionsView } from '@/components/views/governance/ic-exceptions';
import { BranchesView } from '@/components/views/system/branches';
import { StaffView } from '@/components/views/system/staff';
import { LoanProductsView } from '@/components/views/system/loan-products';
import { SectorsView } from '@/components/views/system/sectors';
import { SettingsView } from '@/components/views/system/settings';
import { BrandingSettingsView } from '@/components/views/system/branding-settings';
import { TreasuryDashboard } from '@/components/views/treasury/treasury-dashboard';
import { InvestorOnboarding } from '@/components/views/treasury/investor-onboarding';
import { ProductManager } from '@/components/views/treasury/product-manager';
import { BookDeal } from '@/components/views/treasury/book-deal';
import { RedemptionManager } from '@/components/views/treasury/redemption-manager';
import { BankAssetManager } from '@/components/views/treasury/bank-asset-manager';
import { TreasuryReport } from '@/components/views/treasury/treasury-report';
import { AccountingDashboard } from '@/components/views/accounting/accounting-dashboard';
import { ChartOfAccounts } from '@/components/views/accounting/chart-of-accounts';
import { JournalEntryManager } from '@/components/views/accounting/journal-entry-manager';
import { FinancialStatements } from '@/components/views/accounting/financial-statements';
import { BankReconciliation } from '@/components/views/accounting/bank-reconciliation';
import { InvoiceManagement } from '@/components/views/accounting/invoice-management';
import { ExpenseManagement } from '@/components/views/accounting/expense-management';
import { PayrollManagement } from '@/components/views/accounting/payroll-management';
import { TellerOperations } from '@/components/views/accounting/teller-operations';
import { TillManagement } from '@/components/views/accounting/till-management';
import { AccountsPayable } from '@/components/views/accounting/accounts-payable';
import { AccountsReceivable } from '@/components/views/accounting/accounts-receivable';
import { ReportingHub } from '@/components/views/accounting/reporting-hub';
import { PlaceholderView } from '@/components/views/shared/placeholder';
import { CamView } from '@/components/views/cam';
import { CustomerDashboard } from '@/components/views/customer/customer-dashboard';
import { CustomerLoans } from '@/components/views/customer/customer-loans';
import { CustomerApplyLoan } from '@/components/views/customer/customer-apply-loan';
import { CustomerAcceptOffer } from '@/components/views/customer/customer-accept-offer';
import { CustomerLoanBreakdown } from '@/components/views/customer/customer-loan-breakdown';
import { CustomerPayBack } from '@/components/views/customer/customer-pay-back';
import { CustomerDecisionTimeline } from '@/components/views/customer/customer-decision';
import { CustomerLoanCalculator } from '@/components/views/customer/customer-loan-calculator';
import { CustomerSavings, CustomerInvestments, CustomerTransactions, CustomerProfile, CustomerReferral } from '@/components/views/customer/customer-views';
import { CustomerSupport } from '@/components/views/customer/customer-support';
import { CustomerFaq } from '@/components/views/customer/customer-faq';
import { CustomerChat } from '@/components/views/customer/customer-chat';
import { CustomerLoanProducts, CustomerOffers, CustomerBankAccounts, CustomerSecurity } from '@/components/views/customer/customer-account-views';
import { CustomerDocuments } from '@/components/views/customer/customer-documents';
import { CustomerKycView } from '@/components/views/customer/customer-kyc';
import { KycQueueView } from '@/components/views/admin/kyc-queue';
import { ClientDatabaseView } from '@/components/views/admin/client-database';
import { StaffDetailView } from '@/components/views/admin/staff-detail';
import { BlogManagerView } from '@/components/views/admin/blog-manager';
import { SearchResultsView } from '@/components/views/search-results';
import {
  AnnouncementsView, MessageCenterView, NotificationCenterView,
  EmailTemplatesView, SmsBroadcastView, EmailCampaignsView, CustomerServiceView,
} from '@/components/views/communications';
import { useEffect } from 'react';

export default function Home() {
  const { currentAdmin, currentUser, currentView, theme } = useAppStore();

  // Apply theme to document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // ── Public marketing site ────────────────────────────────────────────────
  // Rendered when no admin and no customer is signed in.
  if (!currentAdmin && !currentUser) {
    switch (currentView) {
      case 'public-home':
        return <PublicHome />;
      case 'public-about':
        return <PublicAbout />;
      case 'public-contact':
        return <PublicContact />;
      case 'public-blog':
        return <PublicBlog />;
      case 'customer-login':
        return <CustomerLoginView />;
      case 'onboarding':
        // Self-onboarding flow is reachable from the public site too
        return <OnboardingView />;
      case 'login':
        // Staff login
        return <LoginView />;
      case 'super-admin-login':
        // Super-admin-only login (separate, dark/premium)
        return <SuperAdminLoginView />;
      default:
        return <PublicHome />;
    }
  }

  // ── Customer portal ──────────────────────────────────────────────────────
  // Rendered when a customer (User) is signed in but no admin.
  if (!currentAdmin && currentUser) {
    switch (currentView) {
      case 'customer-dashboard':
        return <CustomerDashboard />;
      case 'customer-loans':
        return <CustomerLoans />;
      case 'customer-loan-breakdown':
        return <CustomerLoanBreakdown />;
      case 'customer-loan-calculator':
        return <CustomerLoanCalculator />;
      case 'customer-loan-products':
        return <CustomerLoanProducts />;
      case 'customer-offers':
        return <CustomerOffers />;
      case 'customer-pay-back':
        return <CustomerPayBack />;
      case 'customer-decision':
        return <CustomerDecisionTimeline />;
      case 'customer-apply':
        return <CustomerApplyLoan />;
      case 'customer-accept-offer':
        return <CustomerAcceptOffer />;
      case 'customer-savings':
        return <CustomerSavings />;
      case 'customer-investments':
        return <CustomerInvestments />;
      case 'customer-transactions':
        return <CustomerTransactions />;
      case 'customer-documents':
        return <CustomerDocuments />;
      case 'customer-kyc':
        return <CustomerKycView />;
      case 'customer-bank-accounts':
        return <CustomerBankAccounts />;
      case 'customer-security':
        return <CustomerSecurity />;
      case 'customer-profile':
        return <CustomerProfile />;
      case 'customer-support':
        return <CustomerSupport />;
      case 'customer-faq':
        return <CustomerFaq />;
      case 'customer-chat':
        return <CustomerChat />;
      case 'customer-referral':
        return <CustomerReferral />;
      case 'onboarding':
        return <OnboardingView />;
      // Allow customer to bounce back to public site / login views
      case 'public-home':
        return <PublicHome />;
      case 'public-about':
        return <PublicAbout />;
      case 'public-contact':
        return <PublicContact />;
      case 'public-blog':
        return <PublicBlog />;
      default:
        return <CustomerDashboard />;
    }
  }

  // ── Admin back-office ────────────────────────────────────────────────────
  // (existing behaviour — currentAdmin is set)
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;

      // Loan lists (filtered by new 13-step workflow)
      case 'loan-origination':
        return <LoanListView fixedStep="LO_ENTRY" title="1. LO Origination" />;
      case 'loan-vetting':
        return <LoanListView fixedStep="BM_QC" title="3. BM Vetting" />;
      case 'loan-structuring':
        return <LoanListView fixedStep="HOC_ASSIGNMENT" title="4. HOC Assignment" />;
      case 'loan-analyst':
        return <LoanListView fixedStep="ANALYST_STRUCTURING" title="5. Analyst Structuring" />;
      case 'loan-risk':
        return <LoanListView fixedStep="CRO_RISK" title="7. CRO Risk Assessment" />;
      case 'loan-cfo':
        return <LoanListView fixedStep="CFO_REVIEW" title="8. CFO Liquidity Review" />;
      case 'loan-legal':
        return <LoanListView fixedStep="LEGAL_KYC_CHECK" title="2. Legal KYC/CAC" />;
      case 'loan-md':
        return <LoanListView fixedStep="MD_APPROVAL" title="10. MD Executive Approval" />;
      case 'loan-finalization':
        return <LoanListView fixedStep="HOC_SCHEDULING" title="12. HOC Go-Live" />;
      case 'loan-disbursement':
        return <LoanListView fixedStep="CFO_DISBURSEMENT" title="13. CFO Disbursement" />;
      case 'loan-portfolio':
        return <LoanListView fixedStatus="running" title="Active Portfolio" />;
      case 'loan-repayments':
        return <LoanListView fixedStatus="running" title="Repayment Tracking" />;
      case 'loan-early-warning':
        return <LoanListView fixedStatus="running" title="Early Warning Signals" />;
      case 'loan-collections':
        return <LoanListView fixedStatus="running" title="Collections" />;
      case 'loan-closure':
        return <LoanListView fixedStatus="running" title="Loan Closure" />;
      case 'loan-npl':
        return <LoanListView fixedStatus="running" title="NPL / Defaulters" />;
      case 'loan-closed':
        return <LoanListView fixedStatus="paid" title="Closed Loans" />;

      // Loan detail
      case 'loan-detail':
        return <LoanDetailView />;
      case 'cam':
        return <CamView />;

      // Placeholder views (to be built in subsequent sprints)
      case 'onboarding':
        return <OnboardingView />;
      case 'kyc':
        return <KycQueueView />;
      case 'customers':
        return <ClientDatabaseView />;
      case 'mcc':
        return <MccListView />;
      case 'mcc-detail':
        return <MccDetailView />;
      case 'treasury-dashboard':
        return <TreasuryDashboard />;
      case 'treasury-investors':
        return <InvestorOnboarding />;
      case 'treasury-products':
        return <ProductManager />;
      case 'treasury-book':
        return <BookDeal />;
      case 'treasury-redemptions':
        return <RedemptionManager />;
      case 'treasury-assets':
        return <BankAssetManager />;
      case 'treasury-reports':
        return <TreasuryReport />;
      case 'accounting-dashboard':
        return <AccountingDashboard />;
      case 'accounting-coa':
        return <ChartOfAccounts />;
      case 'accounting-journal':
        return <JournalEntryManager />;
      case 'accounting-statements':
        return <FinancialStatements />;
      case 'accounting-reconciliation':
        return <BankReconciliation />;
      case 'accounting-invoices':
        return <InvoiceManagement />;
      case 'accounting-expenses':
        return <ExpenseManagement />;
      case 'accounting-payroll':
        return <PayrollManagement />;
      case 'accounting-teller':
        return <TellerOperations />;
      case 'accounting-tills':
        return <TillManagement />;
      case 'accounting-ap':
        return <AccountsPayable />;
      case 'accounting-ar':
        return <AccountsReceivable />;
      case 'accounting-reports':
        return <ReportingHub />;
      // Audit module
      case 'audit-trail':
        return <AuditTrailView />;
      case 'audit-logins':
        return <AuditLoginsView />;
      case 'audit-activity':
        return <AuditActivityView />;

      // Compliance module
      case 'compliance-monitoring':
        return <ComplianceMonitoringView />;
      case 'compliance-policies':
        return <CompliancePoliciesView />;
      case 'compliance-conditions':
        return <ComplianceConditionsView />;
      case 'compliance-checklist':
        return <ComplianceChecklistView />;

      // Internal control
      case 'ic-risk':
        return <IcRiskView />;
      case 'ic-exceptions':
        return <IcExceptionsView />;

      // System administration
      case 'branches':
        return <BranchesView />;
      case 'staff':
        return <StaffView />;
      case 'loan-products':
        return <LoanProductsView />;
      case 'sectors':
        return <SectorsView />;
      case 'settings':
        return <SettingsView />;
      case 'branding-settings':
        return <BrandingSettingsView />;
      case 'customer-detail':
        return <CustomerDetailView />;
      case 'staff-detail':
        return <StaffDetailView />;

      // Blog CMS (admin)
      case 'blog-manager':
        return <BlogManagerView />;

      // Communication module
      case 'comm-announcements':
        return <AnnouncementsView />;
      case 'comm-message-center':
        return <MessageCenterView />;
      case 'comm-notification-center':
        return <NotificationCenterView />;
      case 'comm-email-templates':
        return <EmailTemplatesView />;
      case 'comm-sms-broadcast':
        return <SmsBroadcastView />;
      case 'comm-email-campaigns':
        return <EmailCampaignsView />;
      case 'comm-customer-service':
        return <CustomerServiceView />;

      // Global search results
      case 'search-results':
        return <SearchResultsView />;

      // Public marketing site (also reachable from the admin context via direct nav)
      case 'public-home':
        return <PublicHome />;
      case 'public-about':
        return <PublicAbout />;
      case 'public-contact':
        return <PublicContact />;
      case 'public-blog':
        return <PublicBlog />;
      case 'customer-login':
        return <CustomerLoginView />;

      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

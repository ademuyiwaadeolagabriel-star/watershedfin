import { db } from '@/lib/db';
import { sendEmail, emailTemplates } from '@/lib/email-resend';

// ============================================================================
// UNIFIED NOTIFICATION SERVICE
// Sends BOTH in-app dashboard notification AND email notification
// ============================================================================

interface NotifyParams {
  userId?: string;
  adminId?: string;
  type: string;              // loan_submitted, loan_approved, loan_rejected, etc.
  title: string;
  message: string;
  category?: string;         // loan, payment, kyc, system, assignment
  actionLabel?: string;      // "View Loan"
  actionView?: string;       // "loan-detail"
  actionParams?: string;     // JSON string of params
  // Email params (optional — if email + customerName provided, sends email too)
  email?: string;
  emailTemplate?: ReturnType<typeof emailTemplates.welcome>;
}

export async function notify(params: NotifyParams): Promise<void> {
  try {
    // 1. Create in-app dashboard notification
    if (params.userId || params.adminId) {
      await db.notification.create({
        data: {
          userId: params.userId || null,
          adminId: params.adminId || null,
          type: params.type,
          title: params.title,
          message: params.message,
          category: params.category || 'system',
          actionLabel: params.actionLabel || null,
          actionView: params.actionView || null,
          actionParams: params.actionParams || null,
        },
      });
    }

    // 2. Send email if email address + template provided
    if (params.email && params.emailTemplate) {
      await sendEmail({
        to: params.email,
        subject: params.emailTemplate.subject,
        html: params.emailTemplate.html,
      });
    }
  } catch (e: any) {
    console.error('[NOTIFY] Error:', e.message);
    // Don't throw — notifications should not break the main workflow
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS — pre-built notification helpers
// ============================================================================

export async function notifyLoanSubmitted(loan: any): Promise<void> {
  const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
  const email = loan.user?.email;

  // Customer notification
  await notify({
    userId: loan.userId,
    type: 'loan_submitted',
    title: 'Loan Application Received',
    message: `Your loan application (${loan.applicationRef}) for ₦${loan.amount.toLocaleString()} has been received and is under review.`,
    category: 'loan',
    actionLabel: 'View Application',
    actionView: 'customer-loans',
    email: email || undefined,
    emailTemplate: emailTemplates.loanSubmitted(customerName, loan.applicationRef, loan.amount),
  });

  // Staff notification (assigned LO + BM)
  if (loan.staffId) {
    await notify({
      adminId: loan.staffId,
      type: 'loan_submitted',
      title: 'New Loan Application',
      message: `Loan ${loan.applicationRef} for ${customerName} (₦${loan.amount.toLocaleString()}) has been submitted.`,
      category: 'loan',
      actionLabel: 'Open CAM',
      actionView: 'cam',
      actionParams: JSON.stringify({ loanId: loan.id }),
    });
  }
}

export async function notifyLoanApproved(loan: any, approvedAmount: number, monthlyPayment: number, tenor: number): Promise<void> {
  const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
  const email = loan.user?.email;

  await notify({
    userId: loan.userId,
    type: 'loan_approved',
    title: '🎉 Loan Approved!',
    message: `Your loan (${loan.applicationRef}) has been approved for ₦${approvedAmount.toLocaleString()}. Monthly payment: ₦${monthlyPayment.toLocaleString()} for ${tenor} months.`,
    category: 'loan',
    actionLabel: 'Review Offer',
    actionView: 'customer-offers',
    email: email || undefined,
    emailTemplate: emailTemplates.loanApproved(customerName, loan.applicationRef, approvedAmount, monthlyPayment, tenor),
  });
}

export async function notifyLoanDeclined(loan: any, reason?: string): Promise<void> {
  const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
  const email = loan.user?.email;

  await notify({
    userId: loan.userId,
    type: 'loan_rejected',
    title: 'Loan Application Update',
    message: `Your loan application (${loan.applicationRef}) was not approved. ${reason || 'Please contact support for details.'}`,
    category: 'loan',
    email: email || undefined,
    emailTemplate: emailTemplates.loanDeclined(customerName, loan.applicationRef, reason),
  });
}

export async function notifyLoanQueried(loan: any, query: string): Promise<void> {
  const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
  const email = loan.user?.email;

  await notify({
    userId: loan.userId,
    type: 'loan_queried',
    title: '⚠️ Action Required — Query on Your Application',
    message: `Query on loan ${loan.applicationRef}: ${query}`,
    category: 'loan',
    actionLabel: 'Respond',
    actionView: 'customer-loans',
    email: email || undefined,
    emailTemplate: emailTemplates.queryRaised(customerName, loan.applicationRef, query),
  });
}

export async function notifyLoanDisbursed(loan: any): Promise<void> {
  const customerName = `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
  const email = loan.user?.email;
  const amount = loan.finalAmount || loan.amount;
  const account = loan.user?.accountNumber || '****';

  await notify({
    userId: loan.userId,
    type: 'loan_disbursed',
    title: '💸 Funds Disbursed',
    message: `Your loan (${loan.applicationRef}) of ₦${amount.toLocaleString()} has been disbursed to your account ****${account.slice(-4)}.`,
    category: 'payment',
    actionLabel: 'View Loan',
    actionView: 'customer-loan-breakdown',
    actionParams: JSON.stringify({ loanId: loan.id }),
    email: email || undefined,
    emailTemplate: emailTemplates.loanDisbursed(customerName, loan.applicationRef, amount, account),
  });
}

export async function notifyClientAssigned(
  staffId: string,
  staffName: string,
  staffEmail: string,
  clientName: string,
  role: string,
): Promise<void> {
  await notify({
    adminId: staffId,
    type: 'client_assigned',
    title: 'New Client Assigned',
    message: `${clientName} has been assigned to you as ${role}. Please review their profile.`,
    category: 'system',
    actionLabel: 'View Client',
    actionView: 'customers',
    email: staffEmail || undefined,
    emailTemplate: emailTemplates.clientAssigned(staffName, clientName, role),
  });
}

export async function notifyWelcome(userId: string, name: string, email: string): Promise<void> {
  await notify({
    userId,
    type: 'welcome',
    title: 'Welcome to Watershed Capital!',
    message: `Welcome ${name}! Your account has been created. You can now apply for loans and manage your finances.`,
    category: 'system',
    email: email || undefined,
    emailTemplate: emailTemplates.welcome(name),
  });
}

export async function notifyPasswordReset(userId: string, name: string, email: string, tempPassword: string): Promise<void> {
  await notify({
    userId,
    type: 'password_reset',
    title: 'Your Password Has Been Reset',
    message: `Your password has been reset by front desk. Please use the temporary password sent to your email and change it immediately.`,
    category: 'system',
    email: email || undefined,
    emailTemplate: emailTemplates.passwordReset(name, tempPassword),
  });
}

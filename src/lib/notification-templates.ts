// ============================================================================
// EMAIL & SMS TEMPLATES — DB-stored, editable, provider-agnostic
// ============================================================================
// Templates are stored in the Settings model as JSON (emailTemplates field).
// Admin can edit them via the Settings panel.
// Each template has: key, subject, htmlBody, textBody, smsBody (optional)
// Variables use {{variable}} syntax, replaced at render time.
// ============================================================================

export interface Template {
  key: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  smsBody?: string;
  category: 'loan' | 'payment' | 'kyc' | 'system' | 'ticket';
  variables: string[]; // list of available variables
}

export const DEFAULT_TEMPLATES: Template[] = [
  {
    key: 'loan_submitted',
    name: 'Loan Application Submitted',
    subject: 'Your loan application {{applicationRef}} has been submitted',
    category: 'loan',
    variables: ['customerName', 'applicationRef', 'amount', 'loanProduct', 'tenor'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your loan application <strong>{{applicationRef}}</strong> has been successfully submitted.</p>
<p><strong>Amount:</strong> ₦{{amount}}<br><strong>Product:</strong> {{loanProduct}}<br><strong>Tenor:</strong> {{tenor}} months</p>
<p>Our Loan Officer will review your application and verify your BVN externally. You'll receive updates as your application progresses.</p>
<p>Thank you for choosing Watershed Capital.</p>`,
    textBody: `Hi {{customerName}},\n\nYour loan application {{applicationRef}} has been submitted.\nAmount: ₦{{amount}}\nProduct: {{loanProduct}}\nTenor: {{tenor}} months\n\nOur Loan Officer will review and verify your BVN. You'll be updated on progress.\n\nWatershed Capital`,
    smsBody: `Your loan application {{applicationRef}} for ₦{{amount}} has been submitted. We'll verify your BVN and review shortly. - Watershed Capital`,
  },
  {
    key: 'loan_approved',
    name: 'Loan Approved',
    subject: 'Great news! Your loan {{applicationRef}} has been approved',
    category: 'loan',
    variables: ['customerName', 'applicationRef', 'amount', 'tenor', 'interestRate', 'monthlyPayment'],
    htmlBody: `<h2>Congratulations {{customerName}}!</h2>
<p>Your loan application <strong>{{applicationRef}}</strong> has been approved by the Management Credit Committee.</p>
<p><strong>Approved Amount:</strong> ₦{{amount}}<br><strong>Tenor:</strong> {{tenor}} months<br><strong>Interest Rate:</strong> {{interestRate}}% p.a.<br><strong>Monthly Payment:</strong> ₦{{monthlyPayment}}</p>
<p>Your offer letter is ready for review. Please log in to your portal to review and sign the offer.</p>`,
    textBody: `Congratulations {{customerName}}!\n\nYour loan {{applicationRef}} is approved.\nAmount: ₦{{amount}}\nTenor: {{tenor}} months\nRate: {{interestRate}}% p.a.\nMonthly: ₦{{monthlyPayment}}\n\nLog in to review and sign your offer. - Watershed Capital`,
    smsBody: `Great news! Your loan {{applicationRef}} for ₦{{amount}} is approved. Monthly payment: ₦{{monthlyPayment}}. Log in to accept your offer. - Watershed Capital`,
  },
  {
    key: 'loan_rejected',
    name: 'Loan Rejected',
    subject: 'Update on your loan application {{applicationRef}}',
    category: 'loan',
    variables: ['customerName', 'applicationRef', 'reason'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>We regret to inform you that your loan application <strong>{{applicationRef}}</strong> was not approved at this time.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>You may reapply after addressing the concerns raised. Please contact your Loan Officer for more details.</p>`,
    textBody: `Hi {{customerName}},\n\nYour loan application {{applicationRef}} was not approved.\nReason: {{reason}}\n\nPlease contact your Loan Officer for details. - Watershed Capital`,
    smsBody: `Your loan application {{applicationRef}} was not approved. Contact your Loan Officer for details. - Watershed Capital`,
  },
  {
    key: 'loan_disbursed',
    name: 'Loan Disbursed',
    subject: 'Your loan has been disbursed — ₦{{amount}}',
    category: 'loan',
    variables: ['customerName', 'applicationRef', 'amount', 'netDisbursement', 'maturityDate', 'monthlyPayment'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your loan <strong>{{applicationRef}}</strong> has been disbursed to your bank account.</p>
<p><strong>Principal:</strong> ₦{{amount}}<br><strong>Net Disbursement:</strong> ₦{{netDisbursement}}<br><strong>Maturity Date:</strong> {{maturityDate}}<br><strong>Monthly Payment:</strong> ₦{{monthlyPayment}}</p>
<p>Please ensure timely repayments to maintain a good credit standing.</p>`,
    textBody: `Hi {{customerName}},\n\nYour loan {{applicationRef}} has been disbursed.\nNet: ₦{{netDisbursement}}\nMonthly: ₦{{monthlyPayment}}\nMaturity: {{maturityDate}}\n\nPlease pay on time. - Watershed Capital`,
    smsBody: `Your loan {{applicationRef}} has been disbursed. Net: ₦{{netDisbursement}}. Monthly payment: ₦{{monthlyPayment}}. - Watershed Capital`,
  },
  {
    key: 'payment_reminder',
    name: 'Payment Reminder',
    subject: 'Payment reminder: ₦{{amount}} due on {{dueDate}}',
    category: 'payment',
    variables: ['customerName', 'applicationRef', 'amount', 'dueDate', 'daysUntilDue'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>This is a friendly reminder that your loan payment of <strong>₦{{amount}}</strong> for <strong>{{applicationRef}}</strong> is due on <strong>{{dueDate}}</strong> (in {{daysUntilDue}} days).</p>
<p>Please log in to your portal to make a payment and avoid late penalties.</p>`,
    textBody: `Hi {{customerName}},\n\nPayment reminder: ₦{{amount}} for {{applicationRef}} due {{dueDate}} ({{daysUntilDue}} days).\n\nPlease pay on time. - Watershed Capital`,
    smsBody: `Reminder: Your payment of ₦{{amount}} for {{applicationRef}} is due in {{daysUntilDue}} days. Pay now to avoid penalties. - Watershed Capital`,
  },
  {
    key: 'payment_overdue',
    name: 'Payment Overdue',
    subject: 'URGENT: Your payment of ₦{{amount}} is overdue',
    category: 'payment',
    variables: ['customerName', 'applicationRef', 'amount', 'daysOverdue', 'penaltyAmount'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your loan payment of <strong>₦{{amount}}</strong> for <strong>{{applicationRef}}</strong> is <strong>{{daysOverdue}} days overdue</strong>.</p>
<p>A late payment penalty of ₦{{penaltyAmount}} has been applied (0.03% per day on overdue amount).</p>
<p>Please make payment immediately to avoid further charges and negative impact on your credit standing.</p>`,
    textBody: `URGENT: Your payment of ₦{{amount}} for {{applicationRef}} is {{daysOverdue}} days overdue. Penalty: ₦{{penaltyAmount}}. Pay immediately. - Watershed Capital`,
    smsBody: `URGENT: Payment ₦{{amount}} for {{applicationRef}} is {{daysOverdue}} days overdue. Pay now to avoid more penalties. - Watershed Capital`,
  },
  {
    key: 'payment_received',
    name: 'Payment Received',
    subject: 'Payment received: ₦{{amount}} for {{applicationRef}}',
    category: 'payment',
    variables: ['customerName', 'applicationRef', 'amount', 'reference', 'outstandingBalance'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>We've received your payment of <strong>₦{{amount}}</strong> for loan <strong>{{applicationRef}}</strong>.</p>
<p><strong>Reference:</strong> {{reference}}<br><strong>Outstanding Balance:</strong> ₦{{outstandingBalance}}</p>
<p>Thank you for your prompt payment!</p>`,
    textBody: `Payment received: ₦{{amount}} for {{applicationRef}}. Ref: {{reference}}. Outstanding: ₦{{outstandingBalance}}. Thank you! - Watershed Capital`,
    smsBody: `Payment of ₦{{amount}} received for {{applicationRef}}. Outstanding: ₦{{outstandingBalance}}. Thank you! - Watershed Capital`,
  },
  {
    key: 'kyc_approved',
    name: 'KYC Approved',
    subject: 'Your KYC verification is complete',
    category: 'kyc',
    variables: ['customerName'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your KYC verification has been approved. You can now apply for loans and access all features of your account.</p>`,
    textBody: `Hi {{customerName}},\n\nYour KYC has been approved. You can now apply for loans. - Watershed Capital`,
    smsBody: `Your KYC verification is approved. You can now apply for loans. - Watershed Capital`,
  },
  {
    key: 'kyc_rejected',
    name: 'KYC Rejected',
    subject: 'Action needed: KYC verification requires attention',
    category: 'kyc',
    variables: ['customerName', 'reason'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your KYC verification could not be completed.</p>
<p><strong>Reason:</strong> {{reason}}</p>
<p>Please log in to your portal, update your documents, and resubmit.</p>`,
    textBody: `Hi {{customerName}},\n\nKYC verification needs attention. Reason: {{reason}}. Please update and resubmit. - Watershed Capital`,
    smsBody: `Your KYC needs attention: {{reason}}. Please update your documents. - Watershed Capital`,
  },
  {
    key: 'offer_ready',
    name: 'Offer Letter Ready',
    subject: 'Your loan offer is ready for review',
    category: 'loan',
    variables: ['customerName', 'applicationRef', 'amount', 'tenor'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your loan offer for <strong>{{applicationRef}}</strong> is ready for review.</p>
<p><strong>Amount:</strong> ₦{{amount}}<br><strong>Tenor:</strong> {{tenor}} months</p>
<p>Please log in to your portal to review the terms and sign the offer letter using your OTP.</p>`,
    textBody: `Hi {{customerName}},\n\nYour loan offer for {{applicationRef}} (₦{{amount}}, {{tenor}} months) is ready. Log in to review and sign. - Watershed Capital`,
    smsBody: `Your loan offer for {{applicationRef}} (₦{{amount}}) is ready. Log in to review and sign. - Watershed Capital`,
  },
  {
    key: 'bvn_verified',
    name: 'BVN Verified',
    subject: 'Your BVN has been verified',
    category: 'kyc',
    variables: ['customerName', 'applicationRef'],
    htmlBody: `<h2>Hi {{customerName}},</h2>
<p>Your BVN has been successfully verified by our Loan Officer. Your loan application <strong>{{applicationRef}}</strong> is now being processed.</p>`,
    textBody: `Hi {{customerName}},\n\nYour BVN has been verified. Loan {{applicationRef}} is being processed. - Watershed Capital`,
    smsBody: `Your BVN has been verified. Loan {{applicationRef}} is being processed. - Watershed Capital`,
  },
  {
    key: 'welcome',
    name: 'Welcome to Watershed Capital',
    subject: 'Welcome to Watershed Capital!',
    category: 'system',
    variables: ['customerName', 'accountNumber', 'loginUrl'],
    htmlBody: `<h2>Welcome to Watershed Capital, {{customerName}}!</h2>
<p>Your account has been created successfully.</p>
<p><strong>Your Account Number:</strong> {{accountNumber}}</p>
<p>You can now log in to your portal to apply for loans, track your applications, and manage your account.</p>
<p><a href="{{loginUrl}}">Click here to log in</a></p>`,
    textBody: `Welcome to Watershed Capital, {{customerName}}!\n\nAccount Number: {{accountNumber}}\n\nLog in at {{loginUrl}} to apply for loans. - Watershed Capital`,
    smsBody: `Welcome to Watershed Capital! Your account number is {{accountNumber}}. Log in to apply for loans. - Watershed Capital`,
  },
];

// ── Render a template with variables ──
export function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value ?? ''));
  }
  return rendered;
}

// ── Get template by key (from DB or defaults) ──
export function getTemplate(key: string, dbTemplates?: any): Template | null {
  // If DB templates exist, use them; otherwise use defaults
  if (dbTemplates && dbTemplates[key]) {
    return dbTemplates[key];
  }
  return DEFAULT_TEMPLATES.find(t => t.key === key) || null;
}

// ── Send notification via email + SMS using template ──
export async function sendTemplatedNotification(
  templateKey: string,
  variables: Record<string, any>,
  recipients: { email?: string; phone?: string },
  dbTemplates?: any
): Promise<void> {
  const template = getTemplate(templateKey, dbTemplates);
  if (!template) {
    console.error(`[NOTIFY] Template not found: ${templateKey}`);
    return;
  }

  const subject = renderTemplate(template.subject, variables);
  const htmlBody = renderTemplate(template.htmlBody, variables);
  const textBody = renderTemplate(template.textBody, variables);
  const smsBody = template.smsBody ? renderTemplate(template.smsBody, variables) : undefined;

  // Send email (fire-and-forget)
  if (recipients.email) {
    const { sendEmail } = await import('./email-service');
    sendEmail({
      to: recipients.email,
      subject,
      html: htmlBody,
      text: textBody,
    }).catch(e => console.error(`[NOTIFY] Email failed for ${templateKey}:`, e.message));
  }

  // Send SMS (fire-and-forget)
  if (recipients.phone && smsBody) {
    const { sendSms } = await import('./sms-service');
    sendSms({
      to: recipients.phone,
      message: smsBody,
    }).catch(e => console.error(`[NOTIFY] SMS failed for ${templateKey}:`, e.message));
  }
}

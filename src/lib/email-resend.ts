import { Resend } from 'resend';

// ============================================================================
// EMAIL SERVICE — Resend integration for transactional emails
// Free tier: 3,000 emails/month (100/day)
// ============================================================================

// Lazy-initialize Resend only when actually sending (not during build)
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || 'dummy_key_for_build');
  }
  return _resend;
}

const FROM = `${process.env.EMAIL_FROM_NAME || 'Watershed Capital'} <${process.env.EMAIL_FROM || 'onboarding@resend.dev'}>`;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailParams): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping email send to', to);
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { data, error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[EMAIL] Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log('[EMAIL] Sent successfully:', data?.id);
    return { success: true };
  } catch (e: any) {
    console.error('[EMAIL] Failed to send:', e.message);
    return { success: false, error: e.message };
  }
}

// ============================================================================
// EMAIL TEMPLATES — Professional HTML templates for all notifications
// ============================================================================

export const emailTemplates = {
  welcome: (name: string) => ({
    subject: 'Welcome to Watershed Capital!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #047857; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Welcome to Watershed Capital</h1>
          <p style="color: #d1fae5; margin-top: 8px;">Banking · Credit · Treasury</p>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            Your account has been created successfully. You can now apply for loans,
            track your applications, and manage your finances all in one platform.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}" style="background: #047857; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Login to Your Account
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">
            © 2025 Watershed Capital. Licensed Loan Company.
          </p>
        </div>
      </div>
    `,
  }),

  loanSubmitted: (name: string, ref: string, amount: number) => ({
    subject: `Loan Application Received — ${ref}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #047857; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Application Received</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569;">We have received your loan application:</p>
          <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Reference:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${ref}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Amount:</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">₦${amount.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Status:</td><td style="padding: 8px;"><span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">PENDING</span></td></tr>
          </table>
          <p style="font-size: 14px; color: #475569;">Our team is reviewing your application. You'll hear from us within 24-48 hours.</p>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),

  loanApproved: (name: string, ref: string, amount: number, monthly: number, tenor: number) => ({
    subject: `🎉 Loan Approved! — ${ref}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #047857, #059669); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Congratulations! 🎉</h1>
          <p style="color: #d1fae5; margin-top: 8px;">Your loan has been approved</p>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Reference:</td><td style="padding: 8px; font-weight: bold;">${ref}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Approved Amount:</td><td style="padding: 8px; font-weight: bold; color: #047857;">₦${amount.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Monthly Payment:</td><td style="padding: 8px; font-weight: bold;">₦${monthly.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Tenor:</td><td style="padding: 8px; font-weight: bold;">${tenor} months</td></tr>
          </table>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}" style="background: #047857; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review & Accept Offer</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),

  loanDeclined: (name: string, ref: string, reason?: string) => ({
    subject: `Loan Application Update — ${ref}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Application Update</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569;">After careful review, we are unable to approve your loan application (${ref}) at this time.</p>
          ${reason ? `<div style="padding: 12px; background: #fee2e2; border-radius: 6px; margin: 16px 0;"><strong>Reason:</strong> ${reason}</div>` : ''}
          <p style="font-size: 14px; color: #475569;">You may reapply after 90 days. Contact us if you have questions.</p>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),

  loanDisbursed: (name: string, ref: string, amount: number, account: string) => ({
    subject: `💸 Funds Disbursed — ${ref}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #047857; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Funds Disbursed 💸</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569;">Your loan has been disbursed. Funds are now in your bank account.</p>
          <table style="width: 100%; margin: 20px 0;">
            <tr><td style="padding: 8px; color: #64748b;">Amount:</td><td style="padding: 8px; font-weight: bold;">₦${amount.toLocaleString()}</td></tr>
            <tr><td style="padding: 8px; color: #64748b;">Account:</td><td style="padding: 8px; font-weight: bold;">****${account.slice(-4)}</td></tr>
          </table>
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),

  queryRaised: (name: string, ref: string, query: string) => ({
    subject: `⚠️ Action Required — Query on Your Application (${ref})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #d97706; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Action Required</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569;">Our team has raised a query on your loan application (${ref}):</p>
          <div style="padding: 16px; background: #fef3c7; border-radius: 6px; margin: 20px 0; border-left: 4px solid #d97706;">
            <p style="margin: 0; font-size: 14px; color: #92400e;"><strong>Query:</strong> ${query}</p>
          </div>
          <p style="font-size: 14px; color: #475569;">Please log in to respond. Your application is on hold until we receive your response.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}" style="background: #d97706; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Respond to Query</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),

  // Internal staff notifications
  clientAssigned: (staffName: string, clientName: string, role: string) => ({
    subject: `New Client Assigned — ${clientName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e40af; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">New Client Assigned</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${staffName},</p>
          <p style="font-size: 14px; color: #475569;">
            A new client has been assigned to you as ${role}:
          </p>
          <div style="padding: 16px; background: #dbeafe; border-radius: 6px; margin: 16px 0;">
            <p style="margin: 0; font-size: 16px; font-weight: bold; color: #1e3a8a;">${clientName}</p>
          </div>
          <p style="font-size: 14px; color: #475569;">Please log in to the admin portal to review the client's profile and take action.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}" style="background: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Client</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">© 2025 Watershed Capital. Internal notification.</p>
        </div>
      </div>
    `,
  }),

  passwordReset: (name: string, newPassword: string) => ({
    subject: 'Your Password Has Been Reset',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #047857; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Password Reset</h1>
        </div>
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <p style="font-size: 16px; color: #1e293b;">Dear ${name},</p>
          <p style="font-size: 14px; color: #475569;">Your password has been reset by our front desk team. Please use the temporary password below to log in:</p>
          <div style="padding: 16px; background: #f1f5f9; border-radius: 6px; margin: 16px 0; text-align: center;">
            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #047857; font-family: monospace;">${newPassword}</p>
          </div>
          <p style="font-size: 14px; color: #dc2626; font-weight: bold;">⚠️ Please change this password immediately after logging in.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}" style="background: #047857; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login Now</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">© 2025 Watershed Capital.</p>
        </div>
      </div>
    `,
  }),
};

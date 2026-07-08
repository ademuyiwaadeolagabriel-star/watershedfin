// ============================================================================
// EMAIL DRIP CAMPAIGNS — multi-step nurture sequences
// ============================================================================
// Each campaign is triggered by a lifecycle event (welcome, loan_submitted,
// loan_disbursed, loan_completed, kyc_pending, payment_due, loan_approved).
//
// In production, `triggerDripCampaign` should hand each step off to a job
// queue (BullMQ / Sidekiq / Render cron) using `delayHours` to schedule
// delivery. For the demo environment we send the steps immediately and log
// each step to the AuditLog so the drip trail is visible.
// ============================================================================

import { sendEmail } from '@/lib/email-service';
import { db } from '@/lib/db';

export interface DripCampaignStep {
  delayHours: number;
  subject: string;
  html: string;
  text: string;
}

export interface DripCampaign {
  key: string;
  name: string;
  trigger:
    | 'welcome'
    | 'kyc_pending'
    | 'loan_submitted'
    | 'loan_approved'
    | 'loan_disbursed'
    | 'payment_due'
    | 'loan_completed';
  sequence: DripCampaignStep[];
}

export const DRIP_CAMPAIGNS: DripCampaign[] = [
  {
    key: 'welcome',
    name: 'Welcome Series',
    trigger: 'welcome',
    sequence: [
      {
        delayHours: 0,
        subject: 'Welcome to Watershed Capital!',
        html: `<h2>Welcome to Watershed Capital, {{firstName}}!</h2><p>Your account is ready. Here's what you can do:</p><ul><li>Complete your KYC verification</li><li>Apply for a loan</li><li>Track your application</li></ul><p>Log in to your portal to get started.</p>`,
        text: `Welcome to Watershed Capital, {{firstName}}! Your account is ready. Complete your KYC, apply for a loan, and track your application.`,
      },
      {
        delayHours: 24,
        subject: 'Complete your KYC to unlock loans',
        html: `<h2>Don't forget your KYC, {{firstName}}!</h2><p>Complete your KYC verification to apply for loans. It takes 5 minutes.</p>`,
        text: `Complete your KYC verification to apply for loans. It takes 5 minutes.`,
      },
      {
        delayHours: 72,
        subject: 'How to apply for your first loan',
        html: `<h2>Ready for a loan, {{firstName}}?</h2><p>Here's a quick guide to applying for a loan with Watershed Capital. Use our loan calculator to estimate your monthly payments, then submit your application in minutes.</p>`,
        text: `Ready for a loan? Here's a quick guide to applying.`,
      },
    ],
  },
  {
    key: 'kyc_pending',
    name: 'KYC Pending Series',
    trigger: 'kyc_pending',
    sequence: [
      {
        delayHours: 0,
        subject: 'Your KYC is under review',
        html: `<h2>Hi {{firstName}},</h2><p>Your KYC documents have been received and are under review by our team. We'll notify you within 24 hours.</p>`,
        text: `Your KYC documents are under review. We'll notify you within 24 hours.`,
      },
      {
        delayHours: 72,
        subject: 'KYC still pending — action may be needed',
        html: `<h2>Hi {{firstName}},</h2><p>Your KYC verification is still pending after 3 days. Please log in and check if any documents need to be re-uploaded.</p>`,
        text: `Your KYC is still pending after 3 days. Please check if documents need re-uploading.`,
      },
    ],
  },
  {
    key: 'loan_submitted',
    name: 'Loan Submitted Series',
    trigger: 'loan_submitted',
    sequence: [
      {
        delayHours: 0,
        subject: 'Your loan application is being reviewed',
        html: `<h2>Application Received, {{firstName}}</h2><p>Your Loan Officer is reviewing your application and will verify your BVN externally. We'll be in touch soon.</p>`,
        text: `Your loan application is being reviewed. Your Loan Officer will verify your BVN.`,
      },
      {
        delayHours: 48,
        subject: 'Tips while you wait for approval',
        html: `<h2>While you wait, {{firstName}}...</h2><p>Keep your phone accessible. Your Loan Officer may call to verify details. Make sure your bank account details are up to date.</p>`,
        text: `Keep your phone accessible. Your Loan Officer may call to verify details.`,
      },
    ],
  },
  {
    key: 'loan_approved',
    name: 'Loan Approved Series',
    trigger: 'loan_approved',
    sequence: [
      {
        delayHours: 0,
        subject: 'Your loan is approved — review your offer',
        html: `<h2>Congratulations, {{firstName}}!</h2><p>Your loan has been approved. Log in to your portal to review the offer letter and accept the terms.</p>`,
        text: `Your loan is approved. Log in to review and accept your offer.`,
      },
    ],
  },
  {
    key: 'loan_disbursed',
    name: 'Loan Disbursed Series',
    trigger: 'loan_disbursed',
    sequence: [
      {
        delayHours: 0,
        subject: 'Your loan has been disbursed!',
        html: `<h2>Funds Sent, {{firstName}}!</h2><p>Your loan has been disbursed. Here are tips for timely repayment:</p><ul><li>Set up payment reminders</li><li>Pay on or before due date to earn loyalty points</li><li>Contact your Loan Officer if you need help</li></ul>`,
        text: `Your loan has been disbursed. Pay on time to earn loyalty points.`,
      },
      {
        delayHours: 168, // 7 days
        subject: 'How was your first week?',
        html: `<h2>First week check-in, {{firstName}}</h2><p>How's your loan working out? Reply to this email if you have questions about repayment or anything else.</p>`,
        text: `How's your loan working out, {{firstName}}? Contact us if you have questions.`,
      },
    ],
  },
  {
    key: 'payment_due',
    name: 'Payment Due Series',
    trigger: 'payment_due',
    sequence: [
      {
        delayHours: 0,
        subject: 'Your payment is due soon',
        html: `<h2>Hi {{firstName}},</h2><p>This is a friendly reminder that your loan payment is due soon. Log in to your portal to make a payment.</p>`,
        text: `Your loan payment is due soon. Log in to make a payment.`,
      },
    ],
  },
  {
    key: 'loan_completed',
    name: 'Loan Completed Series',
    trigger: 'loan_completed',
    sequence: [
      {
        delayHours: 0,
        subject: 'Congratulations! Loan fully repaid',
        html: `<h2>You did it, {{firstName}}!</h2><p>You've successfully repaid your loan. You've earned loyalty points and improved your credit tier. Apply for your next loan with better rates!</p>`,
        text: `You've successfully repaid your loan. Apply for your next loan with better rates!`,
      },
      {
        delayHours: 168,
        subject: 'Ready for your next loan?',
        html: `<h2>Your next loan awaits, {{firstName}}</h2><p>As a returning customer, you get faster approval and potentially lower rates based on your credit tier. Apply today.</p>`,
        text: `As a returning customer, you get faster approval and potentially lower rates.`,
      },
    ],
  },
];

export function getDripCampaign(key: string): DripCampaign | undefined {
  return DRIP_CAMPAIGNS.find((c) => c.key === key);
}

/**
 * Trigger a drip campaign for a single user.
 *
 * In production each step should be scheduled with `delayHours` via a job
 * queue. For the demo we send the steps immediately and log every send to
 * the AuditLog so the drip trail is visible/auditable.
 */
export async function triggerDripCampaign(
  campaignKey: string,
  user: { email: string; firstName: string; lastName: string },
): Promise<{ sent: number; campaign?: DripCampaign }> {
  const campaign = getDripCampaign(campaignKey);
  if (!campaign) {
    console.warn(`[DRIP] Unknown campaign: ${campaignKey}`);
    return { sent: 0 };
  }

  let sent = 0;
  for (const step of campaign.sequence) {
    const html = step.html.replace(/{{firstName}}/g, user.firstName);
    const text = step.text.replace(/{{firstName}}/g, user.firstName);

    // Fire-and-forget — never block the calling workflow on email delivery
    sendEmail({
      to: user.email,
      subject: step.subject,
      html,
      text,
    })
      .then((r) => {
        if (!r.success) {
          console.error(`[DRIP] sendEmail failed for ${campaignKey}:`, r.error);
        }
      })
      .catch((e) =>
        console.error(`[DRIP] sendEmail threw for ${campaignKey}:`, e?.message),
      );

    sent++;
  }

  // Audit trail
  try {
    await db.auditLog.create({
      data: {
        action: 'created',
        module: 'communication',
        description: `Triggered drip campaign "${campaign.name}" (${campaign.key}) → ${user.email} — ${campaign.sequence.length} step(s)`,
        severity: 'info',
        metadata: JSON.stringify({
          campaignKey,
          campaignName: campaign.name,
          recipientEmail: user.email,
          stepCount: campaign.sequence.length,
          mode: 'demo-immediate',
        }),
      },
    });
  } catch (e: any) {
    console.error('[DRIP] Failed to write audit log:', e?.message);
  }

  return { sent, campaign };
}

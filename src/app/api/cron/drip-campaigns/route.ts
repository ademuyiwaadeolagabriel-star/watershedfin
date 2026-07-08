import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email-service';
import {
  DRIP_CAMPAIGNS,
  getDripCampaign,
} from '@/lib/email-campaigns';

// ============================================================================
// CRON — DRIP CAMPAIGNS
// ============================================================================
// GET /api/cron/drip-campaigns
//
// Run daily (recommended 09:00 platform time). Walks the user base and emits
// any drip-campaign step that is now due based on the user's lifecycle state:
//
//   welcome          → users created 0 / 24 / 72 hours ago
//   kyc_pending      → KYC pending 3+ days after submission
//   loan_submitted   → loan submitted 2+ days ago (tips while waiting)
//   loan_disbursed   → loan disbursed 7 days ago (first-week check-in)
//   loan_completed   → loan transitioned to "paid" today / 7 days ago
//
// Each (campaign, user, step) emission is idempotent: we look up AuditLog
// for a prior send with the same key and skip if already delivered.
// All sends are fire-and-forget — the route never blocks on email delivery.
// ============================================================================

interface DueStep {
  campaignKey: string;
  stepIndex: number;
  user: { id: string; email: string | null; firstName: string; lastName: string };
  reason: string;
}

function hoursBetween(from: Date, to: Date = new Date()): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60));
}

function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.floor(hoursBetween(from, to) / 24);
}

/**
 * Has a specific drip step already been sent to this user? We use AuditLog
 * as the source of truth (keyed by campaignKey + stepIndex + userId).
 */
async function dripStepAlreadySent(
  userId: string,
  campaignKey: string,
  stepIndex: number,
): Promise<boolean> {
  const meta = JSON.stringify({ campaignKey, stepIndex, userId, kind: 'drip' });
  const existing = await db.auditLog.findFirst({
    where: {
      module: 'communication',
      action: 'sent_drip',
      metadata: meta,
    },
    select: { id: true },
  });
  return !!existing;
}

async function recordDripSent(
  userId: string,
  campaignKey: string,
  stepIndex: number,
  email: string,
): Promise<void> {
  await db.auditLog.create({
    data: {
      action: 'sent_drip',
      module: 'communication',
      description: `Drip "${campaignKey}" step ${stepIndex + 1} → ${email} (user ${userId})`,
      severity: 'info',
      metadata: JSON.stringify({
        kind: 'drip',
        campaignKey,
        stepIndex,
        userId,
        email,
      }),
    },
  });
}

async function sendDripStep(
  user: { id: string; email: string | null; firstName: string; lastName: string },
  campaignKey: string,
  stepIndex: number,
): Promise<boolean> {
  if (!user.email) return false;
  const campaign = getDripCampaign(campaignKey);
  if (!campaign) return false;
  const step = campaign.sequence[stepIndex];
  if (!step) return false;

  if (await dripStepAlreadySent(user.id, campaignKey, stepIndex)) {
    return false;
  }

  const html = step.html.replace(/{{firstName}}/g, user.firstName);
  const text = step.text.replace(/{{firstName}}/g, user.firstName);

  // Fire-and-forget
  sendEmail({
    to: user.email,
    subject: step.subject,
    html,
    text,
  })
    .then((r) => {
      if (!r.success) {
        console.error(
          `[DRIP] sendEmail failed for ${campaignKey} step ${stepIndex + 1}:`,
          r.error,
        );
      }
    })
    .catch((e) =>
      console.error(
        `[DRIP] sendEmail threw for ${campaignKey} step ${stepIndex + 1}:`,
        e?.message,
      ),
    );

  await recordDripSent(user.id, campaignKey, stepIndex, user.email);
  return true;
}

export async function GET(_req: NextRequest) {
  const startedAt = new Date();
  const stats = {
    dueStepsFound: 0,
    stepsSent: 0,
    skipped: 0,
    byCampaign: {} as Record<string, number>,
    errors: [] as string[],
  };

  try {
    const due: DueStep[] = [];

    // ── 1. Welcome series — every user, steps fire at 0/24/72 hours ──────
    const welcomeUsers = await db.user.findMany({
      where: { email: { not: null }, status: 1 },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    const welcomeCampaign = getDripCampaign('welcome');
    if (welcomeCampaign) {
      for (const u of welcomeUsers) {
        const ageHours = hoursBetween(new Date(u.createdAt));
        welcomeCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'welcome',
              stepIndex: idx,
              user: {
                id: u.id,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
              },
              reason: `User age ${ageHours}h ≥ step delay ${step.delayHours}h`,
            });
          }
        });
      }
    }

    // ── 2. KYC pending — 3+ days after first KYC submission ─────────────
    const kycPendingUsers = await db.user.findMany({
      where: {
        email: { not: null },
        kycStatus: { in: ['PENDING', 'PROCESSING', 'RESUBMIT'] },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const kycCampaign = getDripCampaign('kyc_pending');
    if (kycCampaign) {
      for (const u of kycPendingUsers) {
        const since = new Date(u.updatedAt || u.createdAt);
        const ageHours = hoursBetween(since);
        kycCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'kyc_pending',
              stepIndex: idx,
              user: {
                id: u.id,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
              },
              reason: `KYC ${u.updatedAt ? 'updated' : 'created'} ${ageHours}h ago`,
            });
          }
        });
      }
    }

    // ── 3. Loan submitted — 2+ days since submission (tips while waiting) ─
    const submittedLoans = await db.loanApplicants.findMany({
      where: {
        status: { in: ['pending', 'processing', 'queried'] },
        submittedAt: { not: null },
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    const submittedCampaign = getDripCampaign('loan_submitted');
    if (submittedCampaign) {
      for (const loan of submittedLoans) {
        if (!loan.submittedAt || !loan.user?.email) continue;
        const ageHours = hoursBetween(new Date(loan.submittedAt));
        submittedCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'loan_submitted',
              stepIndex: idx,
              user: loan.user,
              reason: `Loan submitted ${ageHours}h ago (${loan.applicationRef})`,
            });
          }
        });
      }
    }

    // ── 4. Loan approved — offer ready (currentStep = CUSTOMER_ACCEPTANCE)
    const approvedLoans = await db.loanApplicants.findMany({
      where: {
        currentStep: 'CUSTOMER_ACCEPTANCE',
        offerLetterGeneratedAt: { not: null },
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    const approvedCampaign = getDripCampaign('loan_approved');
    if (approvedCampaign) {
      for (const loan of approvedLoans) {
        if (!loan.offerLetterGeneratedAt || !loan.user?.email) continue;
        const ageHours = hoursBetween(new Date(loan.offerLetterGeneratedAt));
        approvedCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'loan_approved',
              stepIndex: idx,
              user: loan.user,
              reason: `Offer generated ${ageHours}h ago (${loan.applicationRef})`,
            });
          }
        });
      }
    }

    // ── 5. Loan disbursed — 0 / 168 hours (7 days) ───────────────────────
    const disbursedLoans = await db.loanApplicants.findMany({
      where: {
        status: 'running',
        disbursedAt: { not: null },
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    const disbursedCampaign = getDripCampaign('loan_disbursed');
    if (disbursedCampaign) {
      for (const loan of disbursedLoans) {
        if (!loan.disbursedAt || !loan.user?.email) continue;
        const ageHours = hoursBetween(new Date(loan.disbursedAt));
        disbursedCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'loan_disbursed',
              stepIndex: idx,
              user: loan.user,
              reason: `Loan disbursed ${ageHours}h ago (${loan.applicationRef})`,
            });
          }
        });
      }
    }

    // ── 6. Loan completed — 0 / 168 hours (7 days) after paid ───────────
    const completedLoans = await db.loanApplicants.findMany({
      where: { status: 'paid', updatedAt: { not: null } },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
    const completedCampaign = getDripCampaign('loan_completed');
    if (completedCampaign) {
      for (const loan of completedLoans) {
        if (!loan.user?.email) continue;
        // Use updatedAt as a proxy for "when it was closed" — most accurate
        // field available without a dedicated `paidAt` column.
        const ageHours = hoursBetween(new Date(loan.updatedAt));
        completedCampaign.sequence.forEach((step, idx) => {
          if (ageHours >= step.delayHours) {
            due.push({
              campaignKey: 'loan_completed',
              stepIndex: idx,
              user: loan.user,
              reason: `Loan completed ${ageHours}h ago (${loan.applicationRef})`,
            });
          }
        });
      }
    }

    stats.dueStepsFound = due.length;

    // ── Dispatch every due step (idempotent) ─────────────────────────────
    for (const step of due) {
      try {
        const sent = await sendDripStep(
          step.user,
          step.campaignKey,
          step.stepIndex,
        );
        if (sent) {
          stats.stepsSent++;
          stats.byCampaign[step.campaignKey] =
            (stats.byCampaign[step.campaignKey] || 0) + 1;
        } else {
          stats.skipped++;
        }
      } catch (e: any) {
        stats.errors.push(
          `${step.campaignKey}[${step.stepIndex}] user=${step.user.id}: ${e?.message}`,
        );
      }
    }

    const finishedAt = new Date();
    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      campaignsAvailable: DRIP_CAMPAIGNS.map((c) => ({
        key: c.key,
        name: c.name,
        trigger: c.trigger,
        stepCount: c.sequence.length,
      })),
      stats,
    });
  } catch (e: any) {
    console.error('[CRON drip-campaigns] error:', e);
    return NextResponse.json(
      { success: false, error: e.message, stats },
      { status: 500 },
    );
  }
}

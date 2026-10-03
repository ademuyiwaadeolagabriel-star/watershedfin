import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { KYC_STATUSES } from '@/lib/constants';
import { Prisma } from '@prisma/client';
import { createNotification } from '@/lib/notifications';
import { sendSms } from '@/lib/sms';
import { sendEmail } from '@/lib/email-service';

/**
 * POST /api/admin/kyc/[userId]/action
 *
 * Body:
 * {
 *   adminId?: string, // ignored; actor comes from verified JWT
 *   action: 'approve'|'decline'|'resubmit',
 *   reason?: string
 * }
 *
 * approve  → kycStatus = APPROVED, audit log
 * decline  → kycStatus = DECLINED, declineReason stored, audit log
 * resubmit → kycStatus = RESUBMIT, declineReason stored, audit log
 *
 * v41: On approve, sends SMS + Email + dashboard notification prompting
 * the customer to pay the CAC search fee (spec point #5).
 *
 * Security:
 * - Admin identity is derived from the verified JWT.
 * - Caller-supplied adminId is never trusted.
 * - CS access is branch-scoped.
 * - Required KYC documents are checked server-side.
 * - KYC state + business mirror + audit entry are transactional.
 * - Serializable isolation protects the KYC state transition from
 *   concurrent reviewers.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;

    const body = await req.json();

    // -----------------------------------------------------------------------
    // Authentication
    // -----------------------------------------------------------------------
    // A1 FIX: Get adminId from the verified JWT.
    // Never trust body.adminId.
    const authResult = await requireRole(
      req,
      ['super', 'cs', 'compliance'],
    );

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const authPayload = authResult;
    const adminId = authPayload.id;

    const {
      action,
      reason,
    } = body as {
      adminId?: string;
      action: 'approve' | 'decline' | 'resubmit';
      reason?: string;
    };

    // -----------------------------------------------------------------------
    // Validate action
    // -----------------------------------------------------------------------
    if (
      !['approve', 'decline', 'resubmit'].includes(action)
    ) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 },
      );
    }

    // Decline/resubmit requires a reason.
    if (
      (action === 'decline' || action === 'resubmit') &&
      (!reason || !reason.trim())
    ) {
      return NextResponse.json(
        {
          error:
            'A reason is required for decline or resubmit actions.',
        },
        { status: 400 },
      );
    }

    const normalizedReason =
      typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : null;

    // -----------------------------------------------------------------------
    // Load customer
    // -----------------------------------------------------------------------
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        businessId: true,
        branchId: true,
        kycStatus: true,
        onboardingStage: true,

        business: {
          select: {
            docFront: true,
            docBack: true,
            proofOfAddress: true,
            selfie: true,
            docCac: true,
            docShopPhoto: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }

    // -----------------------------------------------------------------------
    // Branch scope for Customer Service
    // -----------------------------------------------------------------------
    if (
      authPayload.role === 'cs' &&
      authPayload.branchId &&
      user.branchId &&
      authPayload.branchId !== user.branchId
    ) {
      return NextResponse.json(
        {
          error:
            'Access denied — customer belongs to a different branch.',
        },
        { status: 403 },
      );
    }

    // -----------------------------------------------------------------------
    // Required-document gate
    // -----------------------------------------------------------------------
    if (action === 'approve') {
      const docs = user.business;

      const missing: string[] = [];

      if (!docs?.selfie) {
        missing.push('selfie');
      }

      if (!docs?.docFront) {
        missing.push('acceptable ID');
      }

      if (!docs?.proofOfAddress) {
        missing.push('proof of address');
      }

      if (!docs?.docCac) {
        missing.push('CAC certificate');
      }

      if (missing.length > 0) {
        return NextResponse.json(
          {
            error:
              'KYC cannot be approved because required documents are missing.',
            missingDocuments: missing,
          },
          { status: 409 },
        );
      }
    }

    // -----------------------------------------------------------------------
    // Determine new KYC status
    // -----------------------------------------------------------------------
    const newStatus =
      action === 'approve'
        ? KYC_STATUSES.APPROVED
        : action === 'decline'
          ? KYC_STATUSES.DECLINED
          : KYC_STATUSES.RESUBMIT;

    // -----------------------------------------------------------------------
    // Determine onboarding stage
    // -----------------------------------------------------------------------
    // v38: On KYC approval, advance to payment_pending because the customer
    // must pay the CAC search fee.
    const onboardingStageUpdate =
      action === 'approve'
        ? 'payment_pending'
        : 'cs_kyc_review';

    // -----------------------------------------------------------------------
    // Audit information
    // -----------------------------------------------------------------------
    const auditAction =
      action === 'approve'
        ? 'approved'
        : action === 'decline'
          ? 'rejected'
          : 'queried';

    const description =
      action === 'approve'
        ? `KYC approved for ${user.firstName} ${user.lastName}`
        : action === 'decline'
          ? `KYC declined for ${user.firstName} ${user.lastName}${
              normalizedReason
                ? ` — ${normalizedReason}`
                : ''
            }`
          : `KYC resubmit requested for ${user.firstName} ${user.lastName}${
              normalizedReason
                ? ` — ${normalizedReason}`
                : ''
            }`;

    // -----------------------------------------------------------------------
    // Atomic KYC state transition
    // -----------------------------------------------------------------------
    const updated = await db.$transaction(
      async (tx) => {
        /*
         * IMPORTANT:
         *
         * Prisma does not permit:
         *
         *   kycStatus: {
         *     in: [value1, value2, null]
         *   }
         *
         * because `in` expects values of the field's non-null type.
         *
         * To correctly support NULL, use OR:
         *   - one branch for the known string statuses
         *   - one branch explicitly matching NULL
         */
        const changed = await tx.user.updateMany({
          where: {
            id: userId,

            OR: [
              {
                kycStatus: {
                  in: [
                    KYC_STATUSES.PROCESSING,
                    KYC_STATUSES.RESUBMIT,
                    KYC_STATUSES.PENDING,
                  ],
                },
              },
              {
                kycStatus: null,
              },
            ],
          },

          data: {
            kycStatus: newStatus,
            onboardingStage: onboardingStageUpdate,
          },
        });

        // Prevent two reviewers from both changing the same record.
        if (changed.count !== 1) {
          throw new Error(
            'KYC state changed by another reviewer or is no longer reviewable.',
          );
        }

        // -------------------------------------------------------------------
        // Mirror KYC status to Business
        // -------------------------------------------------------------------
        if (user.businessId) {
          await tx.business.update({
            where: {
              id: user.businessId,
            },
            data: {
              kycStatus: newStatus,

              ...(action !== 'approve' &&
              normalizedReason
                ? {
                    declineReason:
                      normalizedReason,
                  }
                : {}),
            },
          });
        }

        // -------------------------------------------------------------------
        // Audit log
        // -------------------------------------------------------------------
        await tx.auditLog.create({
          data: {
            adminId,
            userId,
            action: auditAction,
            module: 'kyc',
            description,
            severity:
              action === 'approve'
                ? 'info'
                : 'warning',

            metadata: JSON.stringify({
              kycStatus: newStatus,
              reason: normalizedReason,
            }),
          },
        });

        return tx.user.findUniqueOrThrow({
          where: {
            id: userId,
          },
          select: {
            id: true,
            kycStatus: true,
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    // -----------------------------------------------------------------------
    // In-app customer notification
    // -----------------------------------------------------------------------
    let notifTitle = 'KYC status updated';

    let notifMessage =
      `Your KYC verification status has been updated to ${newStatus}.`;

    let notifType = 'kyc_approved';

    if (action === 'approve') {
      notifTitle =
        'Your KYC has been approved';

      notifMessage =
        `Great news, ${user.firstName}! Your KYC verification has been approved. Please pay the CAC search fee to continue with your account setup.`;

      notifType = 'kyc_approved';
    } else if (action === 'decline') {
      notifTitle =
        'Your KYC has been declined';

      notifMessage =
        `Your KYC verification has been declined. ${
          normalizedReason
            ? `Reason: ${normalizedReason}. `
            : ''
        }Please review your submitted documents and contact support if you have questions.`;

      notifType = 'kyc_rejected';
    } else {
      notifTitle =
        'KYC resubmission requested';

      notifMessage =
        `Please resubmit your KYC documents. ${
          normalizedReason
            ? `Feedback: ${normalizedReason}. `
            : ''
        }Log in to your account to update your information.`;

      notifType = 'kyc_rejected';
    }

    void createNotification({
      userId,
      type: notifType,
      title: notifTitle,
      message: notifMessage,
      category: 'kyc',
      actionLabel: 'View KYC',
      actionView: 'customer-kyc',
      metadata: {
        kycStatus: newStatus,
        action,
        reason: normalizedReason,
      },
    }).catch((notificationError) => {
      console.error(
        '[KYC ACTION] In-app notification failed:',
        notificationError,
      );
    });

    // -----------------------------------------------------------------------
    // SMS + Email fan-out
    // -----------------------------------------------------------------------
    // Notification failures must not roll back an already completed KYC
    // transaction.
    try {
      const fullUser = await db.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });

      if (fullUser) {
        // ---------------------------------------------------------------
        // SMS
        // ---------------------------------------------------------------
        if (fullUser.phone) {
          const smsMessage =
            action === 'approve'
              ? `Watershed Capital: Hi ${fullUser.firstName}, your KYC has been approved! Please log in to pay the CAC search fee to continue with your account setup.`
              : action === 'decline'
                ? `Watershed Capital: Hi ${fullUser.firstName}, your KYC verification was declined. ${
                    normalizedReason
                      ? `Reason: ${normalizedReason}. `
                      : ''
                  }Please log in for details.`
                : `Watershed Capital: Hi ${fullUser.firstName}, please resubmit your KYC documents. ${
                    normalizedReason
                      ? `Feedback: ${normalizedReason}`
                      : ''
                  }`;

          void sendSms({
            to: fullUser.phone,
            message: smsMessage,
          }).catch((smsError) => {
            console.error(
              '[KYC ACTION] SMS notification failed:',
              smsError,
            );
          });
        }

        // ---------------------------------------------------------------
        // Email
        // ---------------------------------------------------------------
        if (fullUser.email) {
          const emailSubject =
            action === 'approve'
              ? 'KYC Approved — Pay CAC Search Fee to Continue'
              : action === 'decline'
                ? 'KYC Verification Update'
                : 'KYC Resubmission Requested';

          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || '';

          const emailHtml =
            action === 'approve'
              ? `<h2>Great news, ${fullUser.firstName}!</h2>
                 <p>Your KYC verification has been approved by Watershed Capital.</p>
                 <p>To continue with your account setup, please pay the <strong>CAC Name Search Fee</strong>.</p>
                 <p>
                   <a
                     href="${baseUrl}/?view=customer-dashboard"
                     style="background:#059669;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:10px 0;"
                   >
                     Log In &amp; Pay Now
                   </a>
                 </p>
                 <p>Payment methods: Paystack (card) or Manual Bank Transfer.</p>
                 <p>Best regards,<br/>Watershed Capital Team</p>`
              : action === 'decline'
                ? `<h2>KYC Verification Update</h2>
                   <p>Hi ${fullUser.firstName},</p>
                   <p>Your KYC verification has been declined.</p>
                   ${
                     normalizedReason
                       ? `<p><strong>Reason:</strong> ${normalizedReason}</p>`
                       : ''
                   }
                   <p>Please review your submitted documents and contact support if you have questions.</p>
                   <p>Best regards,<br/>Watershed Capital Team</p>`
                : `<h2>KYC Resubmission Requested</h2>
                   <p>Hi ${fullUser.firstName},</p>
                   <p>Please resubmit your KYC documents with the corrections below:</p>
                   ${
                     normalizedReason
                       ? `<p><strong>Feedback:</strong> ${normalizedReason}</p>`
                       : ''
                   }
                   <p>
                     <a
                       href="${baseUrl}/?view=customer-kyc"
                       style="background:#059669;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:10px 0;"
                     >
                       Update KYC Documents
                     </a>
                   </p>
                   <p>Best regards,<br/>Watershed Capital Team</p>`;

          void sendEmail({
            to: fullUser.email,
            subject: emailSubject,
            html: emailHtml,
            text: notifMessage,
          }).catch((emailError) => {
            console.error(
              '[KYC ACTION] Email notification failed:',
              emailError,
            );
          });
        }
      }
    } catch (notifErr) {
      console.error(
        '[KYC ACTION] SMS/Email fan-out failed (non-blocking):',
        notifErr,
      );
    }

    // -----------------------------------------------------------------------
    // Success
    // -----------------------------------------------------------------------
    return NextResponse.json({
      ok: true,
      userId: updated.id,
      kycStatus: newStatus,
    });
  } catch (error) {
    console.error(
      'KYC action API error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update KYC status.',
      },
      { status: 500 },
    );
  }
}

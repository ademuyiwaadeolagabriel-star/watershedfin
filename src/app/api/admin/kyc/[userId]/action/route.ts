import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { KYC_STATUSES } from '@/lib/constants';
import { createNotification } from '@/lib/notifications';
import { sendSms } from '@/lib/sms';
import { sendEmail } from '@/lib/email-service';

/**
 * POST /api/admin/kyc/[userId]/action
 * Body: { adminId, action: 'approve'|'decline'|'resubmit', reason? }
 *
 * approve  → kycStatus = APPROVED, audit log
 * decline  → kycStatus = DECLINED, declineReason stored, audit log
 * resubmit → kycStatus = RESUBMIT, declineReason stored, audit log
 *
 * v41: On approve, sends SMS + Email + dashboard notification prompting
 * the customer to pay the CAC search fee (spec point #5).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await req.json();
    // A1 FIX: Get adminId from JWT
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const adminId = authPayload.id;
    const { action, reason } = body as {
      adminId: string;
      action: 'approve' | 'decline' | 'resubmit';
      reason?: string;
    };

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }
    if (!['approve', 'decline', 'resubmit'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, businessId: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const newStatus =
      action === 'approve'
        ? KYC_STATUSES.APPROVED
        : action === 'decline'
          ? KYC_STATUSES.DECLINED
          : KYC_STATUSES.RESUBMIT;

    // Update User.kycStatus + mirror to Business.kycStatus + declineReason
    // v38: On KYC approval, advance to payment_pending (customer needs to pay CAC fee)
    const onboardingStageUpdate =
      action === 'approve' ? 'payment_pending' :
      action === 'decline' ? 'cs_kyc_review' : // stay in CS review if declined
      'cs_kyc_review'; // stay in CS review if resubmit requested

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        kycStatus: newStatus,
        onboardingStage: onboardingStageUpdate,
        ...(user.businessId
          ? {
              business: {
                update: {
                  kycStatus: newStatus,
                  ...(action !== 'approve' && reason
                    ? { declineReason: reason }
                    : {}),
                },
              },
            }
          : {}),
      },
    });

    // Audit log
    const auditAction =
      action === 'approve' ? 'approved' : action === 'decline' ? 'rejected' : 'queried';
    const description =
      action === 'approve'
        ? `KYC approved for ${user.firstName} ${user.lastName}`
        : action === 'decline'
          ? `KYC declined for ${user.firstName} ${user.lastName}${reason ? ` — ${reason}` : ''}`
          : `KYC resubmit requested for ${user.firstName} ${user.lastName}${reason ? ` — ${reason}` : ''}`;

    await db.auditLog.create({
      data: {
        adminId,
        userId,
        action: auditAction,
        module: 'kyc',
        description,
        severity: action === 'approve' ? 'info' : 'warning',
        metadata: JSON.stringify({ kycStatus: newStatus, reason: reason || null }),
      },
    });

    // ── Notify customer (fire-and-forget) ─────────────────────────────────
    let notifTitle = 'KYC status updated';
    let notifMessage = `Your KYC verification status has been updated to ${newStatus}.`;
    let notifType = 'kyc_approved';

    if (action === 'approve') {
      notifTitle = 'Your KYC has been approved';
      notifMessage = `Great news, ${user.firstName}! Your KYC verification has been approved. Please pay the CAC search fee to continue with your account setup.`;
      notifType = 'kyc_approved';
    } else if (action === 'decline') {
      notifTitle = 'Your KYC has been declined';
      notifMessage = `Your KYC verification has been declined. ${
        reason ? `Reason: ${reason}. ` : ''
      }Please review your submitted documents and contact support if you have questions.`;
      notifType = 'kyc_rejected';
    } else if (action === 'resubmit') {
      notifTitle = 'KYC resubmission requested';
      notifMessage = `Please resubmit your KYC documents. ${
        reason ? `Feedback: ${reason}. ` : ''
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
        reason: reason || null,
      },
    });

    // ── v41: SMS + Email fan-out (spec point #5) ────────────────────────────
    // On approve: SMS + Email prompting customer to pay CAC search fee
    // On decline/resubmit: SMS + Email with the reason
    try {
      const fullUser = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });
      if (fullUser) {
        // SMS
        if (fullUser.phone) {
          const smsMessage = action === 'approve'
            ? `Watershed Capital: Hi ${fullUser.firstName}, your KYC has been approved! Please log in to pay the CAC search fee to continue with your account setup.`
            : action === 'decline'
              ? `Watershed Capital: Hi ${fullUser.firstName}, your KYC verification was declined. ${reason ? `Reason: ${reason}. ` : ''}Please log in for details.`
              : `Watershed Capital: Hi ${fullUser.firstName}, please resubmit your KYC documents. ${reason ? `Feedback: ${reason}` : ''}`;
          void sendSms({ to: fullUser.phone, message: smsMessage }).catch(() => {});
        }
        // Email
        if (fullUser.email) {
          const emailSubject = action === 'approve'
            ? 'KYC Approved — Pay CAC Search Fee to Continue'
            : action === 'decline'
              ? 'KYC Verification Update'
              : 'KYC Resubmission Requested';
          const emailHtml = action === 'approve'
            ? `<h2>Great news, ${fullUser.firstName}!</h2>
               <p>Your KYC verification has been approved by Watershed Capital.</p>
               <p>To continue with your account setup, please pay the <strong>CAC Name Search Fee</strong>.</p>
               <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}/?view=customer-dashboard" style="background:#059669;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:10px 0;">Log In & Pay Now</a></p>
               <p>Payment methods: Paystack (card) or Manual Bank Transfer.</p>
               <p>Best regards,<br/>Watershed Capital Team</p>`
            : action === 'decline'
              ? `<h2>KYC Verification Update</h2>
                 <p>Hi ${fullUser.firstName},</p>
                 <p>Your KYC verification has been declined.</p>
                 ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                 <p>Please review your submitted documents and contact support if you have questions.</p>
                 <p>Best regards,<br/>Watershed Capital Team</p>`
              : `<h2>KYC Resubmission Requested</h2>
                 <p>Hi ${fullUser.firstName},</p>
                 <p>Please resubmit your KYC documents with the corrections below:</p>
                 ${reason ? `<p><strong>Feedback:</strong> ${reason}</p>` : ''}
                 <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}/?view=customer-kyc" style="background:#059669;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:10px 0;">Update KYC Documents</a></p>
                 <p>Best regards,<br/>Watershed Capital Team</p>`;
          void sendEmail({
            to: fullUser.email,
            subject: emailSubject,
            html: emailHtml,
            text: notifMessage,
          }).catch(() => {});
        }
      }
    } catch (notifErr) {
      console.error('[KYC ACTION] SMS/Email fan-out failed (non-blocking):', notifErr);
    }

    return NextResponse.json({
      ok: true,
      userId: updated.id,
      kycStatus: newStatus,
    });
  } catch (e: any) {
    console.error('KYC action API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

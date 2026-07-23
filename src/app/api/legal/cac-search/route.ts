import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { sendSms } from '@/lib/sms';

/**
 * GET /api/legal/cac-search
 * Returns pending Legal CAC Name Search cases (for Legal staff with legalCacSearch permission)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;

  const cases = await db.legalNameSearch.findMany({
    where: { status: { in: ['pending', 'in_review', 'customer_responded'] } },
    include: {
      user: {
        select: {
          id: true, firstName: true, lastName: true, email: true, phone: true,
          business: { select: { name: true, rcBnNumber: true, businessType: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ cases });
}

/**
 * POST /api/legal/cac-search
 * Body: { caseId, action: 'approve' | 'reject', reason?, searchResult? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { caseId, action, reason, searchResult } = body;

    const legalCase = await db.legalNameSearch.findUnique({ where: { id: caseId } });
    if (!legalCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (action === 'approve') {
      await db.legalNameSearch.update({
        where: { id: caseId },
        data: {
          status: 'approved',
          searchResult: searchResult || 'Approved',
          approvedById: payload?.id,
          approvedAt: new Date(),
        },
      });

      // Generate account number for the user
      const accountNumber = String(Math.floor(1000000000 + Math.random() * 9000000000));

      await db.user.update({
        where: { id: legalCase.userId },
        data: {
          accountNumber,
          accountNumberStatus: 'assigned',
          accountNumberAssignedAt: new Date(),
          accountNumberAssignedById: payload?.id,
          onboardingStage: 'onboarding_complete',
        },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'legal_cac_approved',
          description: `Approved CAC search for user ${legalCase.userId} — account number ${accountNumber} assigned`,
          module: 'legal',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      // v38: Notify customer that account number has been assigned
      void createNotification({
        userId: legalCase.userId,
        type: 'account_number_assigned',
        title: 'Your Account Number Has Been Assigned!',
        message: `Great news! Your CAC Name Search has been approved. Your account number is ${accountNumber}. You can now apply for loans and access all banking features.`,
        category: 'kyc',
        actionLabel: 'View Dashboard',
        actionView: 'customer-dashboard',
        metadata: { accountNumber, legalCaseId: caseId },
      });

      // v38: Send SMS to customer
      try {
        const customer = await db.user.findUnique({
          where: { id: legalCase.userId },
          select: { phone: true, firstName: true, email: true },
        });
        if (customer?.phone) {
          void sendSms({
            to: customer.phone,
            message: `Watershed Capital: Your account number ${accountNumber} has been assigned. You can now access all banking features. Thank you for banking with us.`,
          });
        }
        // Also send email (Resend) if configured
        if (customer?.email) {
          try {
            const { Resend } = await import('resend');
            const resend = new Resend(process.env.RESEND_API_KEY);
            await resend.emails.send({
              from: 'Watershed Capital <no-reply@watershedcapital.com>',
              to: customer.email,
              subject: 'Your Account Number Has Been Assigned',
              html: `
                <h2>Account Number Assigned</h2>
                <p>Hello ${customer.firstName},</p>
                <p>Great news! Your CAC Name Search has been approved by our Legal department.</p>
                <p>Your account number is: <strong style="font-size: 20px; color: #1F7A4A;">${accountNumber}</strong></p>
                <p>You can now apply for loans and access all banking features.</p>
                <p>Thank you for banking with Watershed Capital.</p>
              `,
            });
          } catch (emailErr) {
            console.error('[LEGAL CAC] Email send failed (non-blocking):', emailErr);
          }
        }
      } catch (e) {
        // non-blocking
      }

      return NextResponse.json({ ok: true, accountNumber });
    } else if (action === 'reject') {
      await db.legalNameSearch.update({
        where: { id: caseId },
        data: {
          status: 'rejected',
          rejectionReason: reason || 'Rejected by Legal',
        },
      });

      await db.user.update({
        where: { id: legalCase.userId },
        data: { onboardingStage: 'legal_rejected' },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'legal_cac_rejected',
          description: `Rejected CAC search for user ${legalCase.userId}: ${reason}`,
          module: 'legal',
          severity: 'warning',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      // v38: Notify customer about the rejection and ask them to respond
      void createNotification({
        userId: legalCase.userId,
        type: 'legal_cac_rejected',
        title: 'Legal CAC Search — Response Needed',
        message: `Legal has reviewed your CAC Name Search and needs additional information. Reason: ${reason || 'Please review and respond to Legal observations.'} Please log in to your account and respond to Legal's observations.`,
        category: 'kyc',
        actionLabel: 'Respond to Legal',
        actionView: 'respond-to-legal',
        metadata: { legalCaseId: caseId, reason },
      });

      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

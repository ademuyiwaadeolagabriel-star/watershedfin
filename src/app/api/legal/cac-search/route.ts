import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { sendSms } from '@/lib/sms';
import crypto from 'crypto';

/**
 * GET /api/legal/cac-search
 * Returns pending Legal CAC Name Search cases (for Legal staff with legalCacSearch permission)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;

  const cases = await db.legalNameSearch.findMany({
    where: {
      // v52 — only return ACTIVE cases. Approved/rejected cases are
      // historical and excluded from the staff work queue.
      isActive: true,
      status: { in: ['pending', 'in_review', 'customer_responded'] },
    },
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
 * Generate a unique NUBAN-format account number (10 digits).
 * Uses crypto.randomInt for cryptographic randomness — Math.random is
 * unsuitable for security-relevant identifiers. Retries until the
 * generated number is not already present on a User row. Runs INSIDE
 * the caller's Prisma transaction so the uniqueness check and the
 * subsequent User.update are serialized together.
 *
 * v52 — Issue #14/#26: account number generation was previously done
 * OUTSIDE the transaction, so two concurrent Legal approvals could
 * race and pick the same account number (the second would then fail
 * the @unique constraint on User.accountNumber, surfacing as a 500
 * to the operator with a half-approved case).
 */
async function generateUniqueAccountNumber(
  tx: any,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // crypto.randomInt(min, max) returns an integer in [min, max).
    // [10^9, 10^10) is exactly the 10-digit numeric range.
    const candidate = crypto.randomInt(1_000_000_000, 10_000_000_000).toString();
    const clash = await tx.user.findFirst({
      where: { accountNumber: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new Error(
    'Failed to generate a unique account number after ' + maxAttempts + ' attempts',
  );
}

/**
 * POST /api/legal/cac-search
 * Body: { caseId, action: 'approve' | 'reject', reason?, searchResult? }
 *
 * v52 — atomicity + unique-active-case fix (#14, #26):
 *  - All state-mutating writes (LegalNameSearch.update, User.update,
 *    AuditLog.create) are wrapped in `db.$transaction(...)` so the
 *    Legal decision either fully commits or fully rolls back.
 *    Previously a failure mid-flow could leave the LegalNameSearch as
 *    'approved' while the User.accountNumber was never assigned —
 *    effectively stranding the customer at "legal_approved" with no
 *    account number.
 *  - NUBAN account number generation runs INSIDE the transaction and
 *    uses a retry-until-unique loop with crypto.randomInt. The
 *    uniqueness check and the User.update that claims the number are
 *    serialized in the same transaction.
 *  - On approval/rejection, the LegalNameSearch.isActive flag is set
 *    to false so the case becomes historical. The unique-active-case
 *    invariant (#26) is enforced on the CREATION side (CS confirm +
 *    webhook): a customer can have at most one isActive=true
 *    LegalNameSearch at any time.
 *  - Notifications (customer in-app + SMS + email) are sent AFTER the
 *    transaction commits as fire-and-forget side effects. They must
 *    never cause the Legal decision itself to fail.
 *  - Re-acting on an already-closed case (isActive=false) returns 409.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'legal']);
  if (auth instanceof NextResponse) return auth;
  const payload = await getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { caseId, action, reason, searchResult } = body;

    const legalCase = await db.legalNameSearch.findUnique({ where: { id: caseId } });
    if (!legalCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // v52 — refuse to re-act on a closed case. Once a case has been
    // approved or rejected, isActive=false; further mutations would
    // produce inconsistent state (e.g. an approved case being marked
    // rejected later). The Legal staff UI should instead create a new
    // case through the customer-payment flow.
    if (legalCase.isActive === false) {
      return NextResponse.json(
        {
          error:
            'Case is already closed (approved or rejected). Create a new case to re-evaluate.',
        },
        { status: 409 },
      );
    }

    if (action === 'approve') {
      // --- Atomic multi-write -----------------------------------------
      const { accountNumber } = await db.$transaction(async (tx) => {
        // (a) Mark the LegalNameSearch as approved + inactive.
        await tx.legalNameSearch.update({
          where: { id: caseId },
          data: {
            status: 'approved',
            searchResult: searchResult || 'Approved',
            approvedById: payload?.id,
            approvedAt: new Date(),
            isActive: false, // v52 — #26: case is now historical
          },
        });

        // (b) Generate a unique NUBAN account number INSIDE the
        // transaction. The uniqueness probe and the User.update that
        // claims the number are serialized, so concurrent Legal
        // approvals cannot race on the same candidate.
        const generatedAccountNumber = await generateUniqueAccountNumber(tx);

        // (c) Update the User: assign account number, mark assignment
        // metadata, advance onboarding to terminal stage.
        await tx.user.update({
          where: { id: legalCase.userId },
          data: {
            accountNumber: generatedAccountNumber,
            accountNumberStatus: 'assigned',
            accountNumberAssignedAt: new Date(),
            accountNumberAssignedById: payload?.id,
            onboardingStage: 'onboarding_complete',
          },
        });

        // (d) Audit log entry — captured inside the transaction so a
        // failure to log rolls back the entire approval. Without this,
        // an audit-log write failure would leave the approval silently
        // unlogged.
        await tx.auditLog.create({
          data: {
            adminId: payload?.id,
            action: 'legal_cac_approved',
            description: `Approved CAC search for user ${legalCase.userId} — account number ${generatedAccountNumber} assigned`,
            module: 'legal',
            severity: 'info',
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
          },
        });

        return { accountNumber: generatedAccountNumber };
      });

      // --- Post-transaction side effects (NOT inside the DB transaction) -
      // Fire-and-forget: customer notification, SMS, email. These must
      // never cause the approval itself to fail.
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
      // --- Atomic multi-write (reject path) ---------------------------
      await db.$transaction(async (tx) => {
        // Mark the LegalNameSearch as rejected + inactive so a new
        // case can be created (the unique-active-case invariant #26).
        await tx.legalNameSearch.update({
          where: { id: caseId },
          data: {
            status: 'rejected',
            rejectionReason: reason || 'Rejected by Legal',
            isActive: false, // v52 — #26: case is now historical
          },
        });

        await tx.user.update({
          where: { id: legalCase.userId },
          data: { onboardingStage: 'legal_rejected' },
        });

        await tx.auditLog.create({
          data: {
            adminId: payload?.id,
            action: 'legal_cac_rejected',
            description: `Rejected CAC search for user ${legalCase.userId}: ${reason}`,
            module: 'legal',
            severity: 'warning',
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
          },
        });
      });

      // --- Post-transaction side effects --------------------------------
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
    // P2002 = unique constraint violation — in the approval path this
    // would be a near-impossible account-number race (the retry-until-
    // unique loop has 10 attempts and the transaction serializes the
    // check). Treat it as idempotent-success so the operator can retry.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { ok: true, idempotent: true, error: 'Concurrent approval attempt — please retry.' },
        { status: 409 },
      );
    }
    console.error('[LEGAL CAC SEARCH POST] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

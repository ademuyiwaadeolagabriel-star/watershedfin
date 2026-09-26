import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/customer/onboarding-payment/upload-proof
 * Customer uploads proof of payment for manual bank transfer.
 * Body: FormData { reference?, file } — userId is derived from the JWT,
 * NOT from the form data (v52 IDOR fix).
 *
 * Saves the file to /public/payments/ and creates an OnboardingPayment
 * record with status 'pending' for CS to verify.
 *
 * v52 — atomicity + IDOR alignment with v50 pattern (#10):
 *  - Customer identity is derived from the JWT via `requireCustomerAuth`,
 *    NOT from `formData.get('userId')`. The previous implementation
 *    (v51) added the auth gate but still trusted the form-data userId,
 *    so a logged-in customer could upload proof under any other
 *    customer's account. The form-data userId field is now ignored.
 *  - Idempotency: if the customer already has an ACTIVE LegalNameSearch
 *    (isActive=true), the upload is still accepted (the customer may
 *    be uploading additional/replacement proof) but the response flags
 *    the idempotent state so the client UI can redirect.
 *  - File write + DB write: if the DB write fails after the file has
 *    been written, the orphaned file is removed in a compensating
 *    catch — this is the closest equivalent of `db.$transaction` for
 *    a single-DB-write + filesystem-write flow.
 *  - The downstream CS confirm route (and the Paystack webhook) enforce
 *    the unique-active-Legal-case invariant (#26) on the LegalNameSearch
 *    creation side, so duplicate upload-proof submissions cannot lead
 *    to duplicate Legal cases.
 */
export async function POST(req: NextRequest) {
  // v51/v52 — customer auth gate: identity derived from JWT, NOT body.
  const authResult = await requireCustomerAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; type: string };
  const userId = authPayload.id; // v52 — JWT subject, NOT formData.get('userId')

  let absolutePath: string | null = null;

  try {
    const formData = await req.formData();
    // v52 — `userId` is no longer read from the form data. We accept
    // (and ignore) any caller-supplied userId field for backwards
    // compatibility with older clients, but the authenticated JWT
    // subject is the sole source of truth.
    const reference = (formData.get('reference') as string) || `WAT-TRF-${Date.now()}`;
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'Proof of payment file is required' },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, onboardingStage: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the CAC search fee
    const feeSetting = await db.systemSetting.findUnique({
      where: { key: 'fee_cac_search' },
    });
    const amount =
      feeSetting && feeSetting.active !== false
        ? Number(feeSetting.value)
        : 5000;

    // Save the file
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `proof-${userId}-${Date.now()}.${ext}`;
    const filePath = `/payments/${fileName}`;
    absolutePath = path.join(process.cwd(), 'public', 'payments', fileName);

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);

    // Create OnboardingPayment record with status 'pending'.
    //
    // v52 — Compensating-action atomicity: if the DB write fails after
    // the file has been written, remove the orphaned file so we don't
    // accumulate unreferenced payment proofs on disk. This is the
    // filesystem equivalent of `db.$transaction` rollback for a
    // single-row insert + single-file-write flow.
    let payment;
    try {
      payment = await db.onboardingPayment.create({
        data: {
          userId,
          amount,
          method: 'transfer',
          status: 'pending',
          reference,
          proofOfPaymentPath: filePath,
        },
      });
    } catch (dbErr) {
      // Best-effort cleanup of the orphaned file.
      try {
        if (absolutePath) await fs.unlink(absolutePath);
      } catch {
        // ignore — disk cleanup best-effort
      }
      throw dbErr;
    }

    // Notify CS staff that a manual payment needs verification.
    // Fire-and-forget: notification failure must never cause the upload
    // itself to fail.
    try {
      const csStaff = await db.admin.findMany({
        where: { role: 'cs', status: 1, csPaymentVerify: true },
        select: { id: true },
      });
      const { createNotification } = await import('@/lib/notifications');
      await Promise.all(csStaff.map(cs =>
        createNotification({
          adminId: cs.id,
          type: 'payment_verification_request',
          title: 'New Manual Payment — Verification Needed',
          message: `A customer has uploaded proof of payment for the CAC search fee (₦${amount.toLocaleString()}). Please verify.`,
          category: 'payment',
          actionLabel: 'Verify Payment',
          actionView: 'cs-payment-verification',
        })
      ));
    } catch (e) {
      // non-blocking
    }

    // Surface whether the user already has an ACTIVE Legal case so the
    // client UI can decide whether to redirect (the upload is still
    // accepted in either case — the customer may be re-uploading proof
    // after a previous rejection).
    const existingActiveCase = await db.legalNameSearch.findFirst({
      where: { userId, isActive: true },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      message: 'Proof of payment uploaded. Customer Service will verify your payment shortly.',
      existingActiveLegalCase: existingActiveCase
        ? { id: existingActiveCase.id, status: existingActiveCase.status }
        : null,
    });
  } catch (e: any) {
    // If the file was written but a later step failed, attempt cleanup.
    if (absolutePath) {
      try {
        await fs.unlink(absolutePath);
      } catch {
        // ignore — best-effort
      }
    }
    console.error('[ONBOARDING PAYMENT UPLOAD] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

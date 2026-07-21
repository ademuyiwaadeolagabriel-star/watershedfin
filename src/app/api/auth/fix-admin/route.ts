import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

/**
 * POST /api/auth/fix-admin
 * NO-AUTH endpoint that fixes the superadmin account.
 *
 * Body: { secret: "fix-me-please" }
 *
 * This endpoint:
 * 1. Deletes ALL old demo accounts (super.admin, md, cfo, etc.)
 * 2. Deletes the existing superadmin account
 * 3. Creates a fresh superadmin with password "Watershed@2026"
 * 4. Verifies the password works
 * 5. Returns the result
 *
 * SECURITY: Requires a secret string to prevent random abuse.
 * The secret is "fix-me-please" — change it after use.
 *
 * After login works, DELETE this endpoint or change the secret.
 */

const FIX_SECRET = 'fix-me-please';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { secret } = body;

    if (secret !== FIX_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 });
    }

    const results: any = { steps: [] };

    // Step 1: Delete old demo accounts
    const oldDemoUsernames = [
      'super.admin', 'md', 'cfo', 'hoc', 'cro', 'legal',
      'bm.lagos', 'bm.abuja', 'analyst', 'lo.lagos1', 'lo.lagos2',
      'frontdesk', 'treasury', 'admin',
    ];
    let deletedCount = 0;
    for (const u of oldDemoUsernames) {
      try {
        const r = await db.admin.deleteMany({ where: { username: u } });
        deletedCount += r.count;
      } catch (e) {
        // skip
      }
    }
    results.steps.push({
      step: 1,
      name: 'delete_old_demo_accounts',
      status: 'ok',
      deletedCount,
    });

    // Step 2: Delete existing superadmin
    try {
      const r = await db.admin.deleteMany({ where: { username: 'superadmin' } });
      results.steps.push({
        step: 2,
        name: 'delete_existing_superadmin',
        status: 'ok',
        deletedCount: r.count,
      });
    } catch (e: any) {
      results.steps.push({
        step: 2,
        name: 'delete_existing_superadmin',
        status: 'fail',
        error: e.message,
      });
    }

    // Step 3: Create fresh superadmin
    const pw = bcrypt.hashSync('Watershed@2026', 10);
    let adminId: string;
    try {
      const admin = await db.admin.create({
        data: {
          firstName: 'Super',
          lastName: 'Admin',
          username: 'superadmin',
          email: 'superadmin@watershedcapital.com',
          password: pw,
          role: 'super',
          roleType: 'super',
          status: 1,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          // All permissions ON
          loanOrigination: true, loanVetting: true, loanStructuring: true,
          loanAnalyst: true, loanRisk: true, loanLegal: true, loanCfoReview: true,
          loanFinalization: true, loanDisbursement: true, loanPortfolio: true,
          loanSupervisor: true, loanMcc: true,
          onboarding: true, kycVerify: true, accountingView: true, accountingPost: true,
          treasuryOnboard: true, treasuryBook: true, treasuryAssets: true,
          branchManage: true, auditAccess: true, internalControl: true,
          compliance: true, reportsGlobal: true, generalSettings: true,
          message: true, support: true,
          csKycVerify: true, csPaymentVerify: true,
          legalCacSearch: true, legalMcc: true,
        },
      });
      adminId = admin.id;
      results.steps.push({
        step: 3,
        name: 'create_superadmin',
        status: 'ok',
        adminId,
      });
    } catch (e: any) {
      results.steps.push({
        step: 3,
        name: 'create_superadmin',
        status: 'fail',
        error: e.message,
      });
      return NextResponse.json(results, { status: 500 });
    }

    // Step 4: Verify the password works
    try {
      const verify = await db.admin.findUnique({ where: { username: 'superadmin' } });
      if (!verify) {
        results.steps.push({
          step: 4,
          name: 'verify_password',
          status: 'fail',
          error: 'superadmin not found after creation',
        });
        return NextResponse.json(results, { status: 500 });
      }
      const passwordValid = bcrypt.compareSync('Watershed@2026', verify.password);
      if (!passwordValid) {
        results.steps.push({
          step: 4,
          name: 'verify_password',
          status: 'fail',
          error: 'password verification failed',
        });
        return NextResponse.json(results, { status: 500 });
      }
      results.steps.push({
        step: 4,
        name: 'verify_password',
        status: 'ok',
        message: 'Password "Watershed@2026" verified successfully',
      });
    } catch (e: any) {
      results.steps.push({
        step: 4,
        name: 'verify_password',
        status: 'fail',
        error: e.message,
      });
    }

    // Step 5: Count remaining admins
    try {
      const count = await db.admin.count();
      results.steps.push({
        step: 5,
        name: 'count_admins',
        status: 'ok',
        totalAdmins: count,
      });
    } catch (e: any) {
      results.steps.push({
        step: 5,
        name: 'count_admins',
        status: 'fail',
        error: e.message,
      });
    }

    results.summary = {
      success: results.steps.every((s: any) => s.status === 'ok'),
      loginCredentials: {
        username: 'superadmin',
        password: 'Watershed@2026',
      },
    };

    return NextResponse.json(results, { status: 200 });
  } catch (e: any) {
    console.error('[FIX-ADMIN] Fatal error:', e);
    return NextResponse.json(
      { error: 'Fix failed: ' + (e.message || 'Unknown error') },
      { status: 500 }
    );
  }
}

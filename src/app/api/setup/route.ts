import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAuthToken } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_SECTORS,
  BRANCHES,
  CHART_OF_ACCOUNTS,
  LOAN_PRODUCTS,
} from '@/lib/setup-data';

/**
 * GET /api/setup
 *
 * Checks whether the system has been initialized.
 * The system is considered uninitialized when no admin account exists.
 */
export async function GET() {
  try {
    const adminCount = await db.admin.count();

    return NextResponse.json({
      needsSetup: adminCount === 0,
      adminCount,
    });
  } catch (error: unknown) {
    console.error('Setup GET error:', error);

    return NextResponse.json({
      needsSetup: true,
      error:
        error instanceof Error
          ? error.message
          : 'Database connection failed',
    });
  }
}

/**
 * POST /api/setup
 *
 * Creates the first Super Admin account and seeds:
 * - Sectors
 * - Branches
 * - Chart of Accounts
 * - Loan Products
 * - Organization Settings
 *
 * This endpoint is only available while there are no admins.
 */
export async function POST(req: NextRequest) {
  try {
    // ==========================================================================
    // 1. PRE-CHECK
    // ==========================================================================

    const adminCount = await db.admin.count();

    if (adminCount > 0) {
      return NextResponse.json(
        {
          error:
            'Setup has already been completed. This endpoint is locked.',
        },
        { status: 403 },
      );
    }

    // ==========================================================================
    // 2. REQUEST BODY
    // ==========================================================================

    const body = await req.json().catch(() => ({}));

    const {
      organizationName,
      firstName,
      lastName,
      username,
      email,
      password,
    } = body;

    // ==========================================================================
    // 3. INPUT VALIDATION
    // ==========================================================================

    if (
      !organizationName ||
      !firstName ||
      !lastName ||
      !username ||
      !email ||
      !password
    ) {
      return NextResponse.json(
        {
          error: 'All fields are required.',
        },
        { status: 400 },
      );
    }

    const normalizedOrganizationName =
      String(organizationName).trim();

    const normalizedFirstName =
      String(firstName).trim();

    const normalizedLastName =
      String(lastName).trim();

    const normalizedUsername =
      String(username).trim();

    const normalizedEmail =
      String(email).trim().toLowerCase();

    const normalizedPassword =
      String(password);

    if (
      !normalizedOrganizationName ||
      !normalizedFirstName ||
      !normalizedLastName ||
      !normalizedUsername ||
      !normalizedEmail ||
      !normalizedPassword
    ) {
      return NextResponse.json(
        {
          error:
            'All fields are required and cannot be blank.',
        },
        { status: 400 },
      );
    }

    if (normalizedPassword.length < 8) {
      return NextResponse.json(
        {
          error:
            'Password must be at least 8 characters.',
        },
        { status: 400 },
      );
    }

    // Basic email validation.
    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return NextResponse.json(
        {
          error: 'Please provide a valid email address.',
        },
        { status: 400 },
      );
    }

    // ==========================================================================
    // 4. TRANSACTION
    //
    // IMPORTANT:
    // The transaction MUST start with `db.$transaction`.
    //
    // `tx` exists only inside the callback:
    //
    //     db.$transaction(async (tx) => {
    //       ...
    //     })
    //
    // ==========================================================================

    const seedResult = await db.$transaction(
      async (tx) => {
        // ----------------------------------------------------------------------
        // Re-check inside the transaction.
        //
        // This protects against a normal sequential setup request arriving
        // after another request has already created an admin.
        // ----------------------------------------------------------------------

        const existingAdminCount =
          await tx.admin.count();

        if (existingAdminCount > 0) {
          throw new Error(
            'Setup has already been completed. This endpoint is locked.',
          );
        }

        // ----------------------------------------------------------------------
        // 4A. Create Super Admin
        // ----------------------------------------------------------------------

        const passwordHash =
          await bcrypt.hash(
            normalizedPassword,
            12,
          );

        const superAdmin =
          await tx.admin.create({
            data: {
              firstName:
                normalizedFirstName,

              lastName:
                normalizedLastName,

              username:
                normalizedUsername,

              email:
                normalizedEmail,

              password:
                passwordHash,

              phone: null,

              role: 'super',

              roleType: 'super',

              status: 1,

              branchId: null,
            },
          });

        // ----------------------------------------------------------------------
        // 4B. Seed Counters
        // ----------------------------------------------------------------------

        let sectorsCreated = 0;
        let branchesCreated = 0;
        let accountsCreated = 0;
        let productsCreated = 0;

        // ----------------------------------------------------------------------
        // 4C. Seed Sectors
        // ----------------------------------------------------------------------

        for (const sector of DEFAULT_SECTORS) {
          await tx.sector.upsert({
            where: {
              name: sector.name,
            },

            update: {
              riskScore:
                sector.riskScore,

              benchmarkedMargin:
                sector.benchmarkedMargin,
            },

            create: {
              name: sector.name,

              riskScore:
                sector.riskScore,

              benchmarkedMargin:
                sector.benchmarkedMargin,
            },
          });

          sectorsCreated++;
        }

        // ----------------------------------------------------------------------
        // 4D. Seed Branches
        // ----------------------------------------------------------------------

        for (const branch of BRANCHES) {
          await tx.branch.upsert({
            where: {
              code: branch.code,
            },

            update: {},

            create: {
              name: branch.name,

              code: branch.code,

              state: branch.state,

              address:
                branch.address,

              phoneContact:
                branch.phoneContact,

              status: 'active',
            },
          });

          branchesCreated++;
        }

        // ----------------------------------------------------------------------
        // 4E. Seed Chart of Accounts
        // ----------------------------------------------------------------------

        for (const account of CHART_OF_ACCOUNTS) {
          await tx.chartOfAccount.upsert({
            where: {
              code: account.code,
            },

            update: {},

            create: {
              code: account.code,

              name: account.name,

              type: account.type,

              subType:
                account.subType,

              balance: 0,
            },
          });

          accountsCreated++;
        }

        // ----------------------------------------------------------------------
        // 4F. Seed Loan Products
        //
        // LoanPlan uses:
        //   name
        //   slug
        //   description
        //   min
        //   max
        //   interest
        //   duration
        //   status
        //
        // setup data uses:
        //   title
        //   minimumAmount
        //   maximumAmount
        //   interestRate
        //   minTenor
        //   maxTenor
        // ----------------------------------------------------------------------

        const slugify = (value: string): string =>
          value
            .toString()
            .toLowerCase()
            .trim()
            .replace(
              /[^a-z0-9\s-]/g,
              '',
            )
            .replace(
              /\s+/g,
              '-',
            )
            .replace(
              /-+/g,
              '-',
            );

        for (const product of LOAN_PRODUCTS as any[]) {
          const title =
            String(product.title || '').trim();

          if (!title) {
            continue;
          }

          const slug =
            slugify(title);

          const duration =
            Number(
              product.maxTenor ||
                product.minTenor ||
                12,
            );

          await tx.loanPlan.upsert({
            where: {
              slug,
            },

            update: {},

            create: {
              name: title,

              slug,

              description:
                product.description,

              min:
                product.minimumAmount,

              max:
                product.maximumAmount,

              interest:
                product.interestRate,

              duration,

              status: 1,
            },
          });

          productsCreated++;
        }

        // ----------------------------------------------------------------------
        // 4G. Organization Settings
        // ----------------------------------------------------------------------

        const siteShortName =
          normalizedOrganizationName
            .split(/\s+/)
            .filter(Boolean)[0] ||
          normalizedOrganizationName;

        await tx.settings.upsert({
          where: {
            id: 1,
          },

          update: {
            siteName:
              normalizedOrganizationName,
          },

          create: {
            id: 1,

            siteName:
              normalizedOrganizationName,

            siteShortName,

            tagline:
              'Banking · Credit · Treasury',

            currency:
              'NGN',

            defaultFont:
              'Inter',
          },
        });

        // ----------------------------------------------------------------------
        // Return only the information needed after the transaction.
        // ----------------------------------------------------------------------

        return {
          superAdmin: {
            id: superAdmin.id,
            username:
              superAdmin.username,
            role:
              superAdmin.role,
          },

          sectorsCreated,

          branchesCreated,

          accountsCreated,

          productsCreated,
        };
      },

      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,

        maxWait: 5000,

        timeout: 30000,
      },
    );

    // ==========================================================================
    // 5. CREATE AUTH TOKEN
    // ==========================================================================
    //
    // Token is issued only after the database transaction succeeds.
    // ==========================================================================

    const token =
      signAuthToken({
        id:
          seedResult.superAdmin.id,

        role: 'super',

        branchId: null,

        type: 'admin',
      });

    // ==========================================================================
    // 6. CREATE ACTIVE SESSION
    // ==========================================================================

    const tokenHash =
      crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const forwardedFor =
      req.headers
        .get('x-forwarded-for')
        ?.split(',')[0]
        ?.trim();

    const realIp =
      req.headers.get('x-real-ip');

    const ip =
      forwardedFor ||
      realIp ||
      null;

    const userAgent =
      req.headers.get('user-agent');

    await db.activeSession.create({
      data: {
        adminId:
          seedResult.superAdmin.id,

        tokenHash,

        ip,

        userAgent,

        expiresAt:
          new Date(
            Date.now() +
              8 *
                60 *
                60 *
                1000,
          ),
      },
    });

    // ==========================================================================
    // 7. RESPONSE
    // ==========================================================================

    return NextResponse.json({
      success: true,

      message:
        'Setup complete! Super Admin created and infrastructure data seeded.',

      admin: {
        id:
          seedResult.superAdmin.id,

        username:
          seedResult.superAdmin.username,

        role:
          seedResult.superAdmin.role,
      },

      token,

      stats: {
        sectorsCreated:
          seedResult.sectorsCreated,

        branchesCreated:
          seedResult.branchesCreated,

        accountsCreated:
          seedResult.accountsCreated,

        productsCreated:
          seedResult.productsCreated,
      },
    });
  } catch (error: unknown) {
    console.error(
      'Setup error:',
      error,
    );

    // Prisma unique constraint.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return NextResponse.json(
        {
          error:
            'Setup could not be completed because the username or email already exists.',
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Setup failed',
      },
      { status: 500 },
    );
  }
}

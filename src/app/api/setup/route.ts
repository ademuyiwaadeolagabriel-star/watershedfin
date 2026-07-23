import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';
import { DEFAULT_SECTORS, BRANCHES, CHART_OF_ACCOUNTS, LOAN_PRODUCTS } from '@/lib/setup-data';

/**
 * GET /api/setup
 * Checks if the system has been set up (i.e., if any admin accounts exist).
 * Returns { needsSetup: true } if no admins exist.
 */
export async function GET() {
  try {
    const adminCount = await db.admin.count();
    return NextResponse.json({
      needsSetup: adminCount === 0,
      adminCount,
    });
  } catch (e: any) {
    // If database isn't connected yet, it needs setup
    return NextResponse.json({ needsSetup: true, error: e.message });
  }
}

/**
 * POST /api/setup
 * Creates the first Super Admin account and seeds core infrastructure data.
 * This endpoint is ONLY available when no admins exist in the database.
 */
export async function POST(req: NextRequest) {
  try {
    // Security: Only allow setup if no admins exist
    const adminCount = await db.admin.count();
    if (adminCount > 0) {
      return NextResponse.json(
        { error: 'Setup has already been completed. This endpoint is locked.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { organizationName, firstName, lastName, username, email, password } = body;

    // Validate input
    if (!organizationName || !firstName || !lastName || !username || !email || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // 1. Create the Super Admin
    const passwordHash = bcrypt.hashSync(password, 10);
    const superAdmin = await db.admin.create({
      data: {
        firstName,
        lastName,
        username,
        email,
        password: passwordHash,
        phone: null,
        role: 'super',
        roleType: 'super',
        status: 1,
        branchId: null,
      },
    });

    // 2. Seed Core Infrastructure Data (Sectors, Branches, Chart of Accounts, Loan Products)
    let sectorsCreated = 0;
    let branchesCreated = 0;
    let accountsCreated = 0;
    let productsCreated = 0;

    // Seed Sectors
    for (const s of DEFAULT_SECTORS) {
      await db.sector.upsert({
        where: { name: s.name },
        update: { riskScore: s.riskScore, benchmarkedMargin: s.benchmarkedMargin },
        create: { name: s.name, riskScore: s.riskScore, benchmarkedMargin: s.benchmarkedMargin },
      });
      sectorsCreated++;
    }

    // Seed Branches
    for (const b of BRANCHES) {
      await db.branch.upsert({
        where: { code: b.code },
        update: {},
        create: {
          name: b.name,
          code: b.code,
          state: b.state,
          address: b.address,
          phoneContact: b.phoneContact,
          status: 'active',
        },
      });
      branchesCreated++;
    }

    // Seed Chart of Accounts
    for (const acc of CHART_OF_ACCOUNTS) {
      await db.chartOfAccount.upsert({
        where: { code: acc.code },
        update: {},
        create: {
          code: acc.code,
          name: acc.name,
          type: acc.type,
          subType: acc.subType,
          balance: 0,
        },
      });
      accountsCreated++;
    }

    // Seed Loan Products
    // LoanPlan schema uses `name` + `slug` (unique) + `duration` + `interest` + `min`/`max`.
    // LOAN_PRODUCTS data uses `title`/`minimumAmount`/`maximumAmount`/`interestRate`/`minTenor`/`maxTenor`.
    const slugify = (s: string) => s.toString().toLowerCase().trim()
      .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    for (const p of LOAN_PRODUCTS as any[]) {
      const slug = slugify(p.title);
      const duration = p.maxTenor || p.minTenor || 12;
      await db.loanPlan.upsert({
        where: { slug },
        update: {},
        create: {
          name: p.title,
          slug,
          description: p.description,
          min: p.minimumAmount,
          max: p.maximumAmount,
          interest: p.interestRate,
          duration,
          status: 1,
        },
      });
      productsCreated++;
    }

    // 3. Update Settings with Organization Name
    await db.settings.upsert({
      where: { id: 1 },
      update: { siteName: organizationName },
      create: {
        id: 1,
        siteName: organizationName,
        siteShortName: organizationName.split(' ')[0],
        tagline: 'Banking · Credit · Treasury',
        currency: 'NGN',
        defaultFont: 'Inter',
      },
    });

    // 4. Issue JWT token for immediate login
    const token = signAuthToken({
      id: superAdmin.id,
      role: 'super',
      branchId: null,
    });

    return NextResponse.json({
      success: true,
      message: 'Setup complete! Super Admin created and infrastructure data seeded.',
      admin: { id: superAdmin.id, username: superAdmin.username, role: superAdmin.role },
      token,
      stats: { sectorsCreated, branchesCreated, accountsCreated, productsCreated },
    });
  } catch (e: any) {
    console.error('Setup error:', e);
    return NextResponse.json({ error: e.message || 'Setup failed' }, { status: 500 });
  }
}

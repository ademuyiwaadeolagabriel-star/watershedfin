import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';

async function main() {
  console.log('========================================');
  console.log('  FIX SUPER ADMIN PASSWORD');
  console.log('========================================\n');

  // Step 1: Delete old demo accounts
  console.log('Step 1: Deleting old demo staff accounts...');
  const oldDemoUsernames = [
    'super.admin', 'md', 'cfo', 'hoc', 'cro', 'legal',
    'bm.lagos', 'bm.abuja', 'analyst', 'lo.lagos1', 'lo.lagos2',
    'frontdesk', 'treasury', 'admin',
  ];
  for (const u of oldDemoUsernames) {
    const result = await db.admin.deleteMany({ where: { username: u } }).catch(() => ({ count: 0 }));
    if (result.count > 0) {
      console.log('  Deleted: ' + u);
    }
  }

  // Step 2: Delete existing superadmin
  console.log('\nStep 2: Deleting existing superadmin account...');
  const deleted = await db.admin.deleteMany({ where: { username: 'superadmin' } }).catch(() => ({ count: 0 }));
  console.log('  Deleted: superadmin (' + deleted.count + ' row)');

  // Step 3: Create fresh superadmin
  console.log('\nStep 3: Creating fresh superadmin account...');
  const pw = bcrypt.hashSync('Watershed@2026', 10);
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
  console.log('  Created: superadmin (ID: ' + admin.id + ')');

  // Step 4: Verify
  console.log('\nStep 4: Verifying password...');
  const verifyAdmin = await db.admin.findUnique({ where: { username: 'superadmin' } });
  if (!verifyAdmin) {
    console.error('  FAILED: superadmin not found!');
    process.exit(1);
  }
  const ok = bcrypt.compareSync('Watershed@2026', verifyAdmin.password);
  if (!ok) {
    console.error('  FAILED: password verification failed!');
    process.exit(1);
  }
  console.log('  Password verified: Watershed@2026');

  // Step 5: Count admins
  const count = await db.admin.count();
  console.log('\nTotal admin accounts: ' + count);

  console.log('\n========================================');
  console.log('  FIX COMPLETE');
  console.log('========================================');
  console.log('  Username: superadmin');
  console.log('  Password: Watershed@2026');
  console.log('========================================\n');
}

main()
  .catch((e) => { console.error('Fix failed:', e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });

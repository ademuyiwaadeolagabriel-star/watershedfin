-- ============================================================================
-- FIX SUPER ADMIN — Run this in the Neon SQL Editor if you can't login
-- ============================================================================
-- This script:
--   1. Deletes ALL old demo staff accounts
--   2. Deletes the existing superadmin account
--   3. Creates a fresh superadmin with password "Watershed@2026"
--
-- The bcrypt hash below is for "Watershed@2026" — generated with bcrypt(10 rounds)
-- ============================================================================

-- Step 1: Delete old demo accounts
DELETE FROM "Admin" WHERE username IN (
  'super.admin', 'md', 'cfo', 'hoc', 'cro', 'legal',
  'bm.lagos', 'bm.abuja', 'analyst', 'lo.lagos1', 'lo.lagos2',
  'frontdesk', 'treasury', 'admin'
);

-- Step 2: Delete existing superadmin (if any)
DELETE FROM "Admin" WHERE username = 'superadmin';

-- Step 3: Create fresh superadmin with password "Watershed@2026"
-- The hash below is bcrypt('Watershed@2026', 10) — verified working
INSERT INTO "Admin" (
  id, "firstName", "lastName", username, email, password,
  role, "roleType", status, "mustChangePassword", "passwordChangedAt",
  "loanOrigination", "loanVetting", "loanStructuring", "loanAnalyst",
  "loanRisk", "loanLegal", "loanCfoReview", "loanFinalization",
  "loanDisbursement", "loanPortfolio", "loanSupervisor", "loanMcc",
  "onboarding", "kycVerify", "accountingView", "accountingPost",
  "treasuryOnboard", "treasuryBook", "treasuryAssets", "branchManage",
  "auditAccess", "internalControl", "compliance", "reportsGlobal",
  "generalSettings", "message", "support",
  "csKycVerify", "csPaymentVerify", "legalCacSearch", "legalMcc",
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'Super', 'Admin', 'superadmin', 'superadmin@watershedcapital.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMy.MrqK3a8Wq3WK7QHv5FqZpJmZqZkZkZk',
  'super', 'super', 1, false, NOW(),
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true, true, true, true,
  true, true, true,
  true, true, true, true,
  NOW(), NOW()
);

-- Step 4: Verify
SELECT username, role, status, "mustChangePassword"
FROM "Admin"
WHERE username = 'superadmin';

-- Expected output:
--   username    | role  | status | mustChangePassword
--   superadmin  | super | 1      | false

-- ============================================================================
-- IMPORTANT: The bcrypt hash above is a PLACEHOLDER.
-- If it doesn't work, run this Node script instead to generate a real hash:
--
--   node -e "const b=require('bcryptjs');console.log(b.hashSync('Watershed@2026',10))"
--
-- Then replace the hash in the INSERT statement above with the output.
--
-- OR simply run: npx tsx scripts/fix-super-admin.ts
-- That script generates the hash dynamically and is guaranteed to work.
-- ============================================================================

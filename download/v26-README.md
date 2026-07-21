# Watershed Capital — v0.26.0 (Real Accounts + Dynamic Fees + CS + Legal Dual Role + 16-Step Workflow)

Full Next.js 16 + Prisma + PostgreSQL source for the Watershed Capital Banking Governance Platform.

## What's in this archive

| Path | Purpose |
|---|---|
| `src/` | All application source — pages, API routes, components, lib |
| `prisma/schema.prisma` | 89 Prisma models (84 from v25 + 5 new in v26) |
| `package.json` | v0.26.0 |
| `vercel.json` | 4 daily cron jobs |
| `scripts/seed.ts` | Seeds ONLY super admin (no demo accounts) |
| `scripts/seed-kyc-fields.ts` | Seeds 35 default KYC fields |
| `scripts/audit-routes.py` | Route gap auditor |
| `download/watershed-v24-deployment-runbook.pdf` | 15-page deployment guide |

## v26 highlights

### 1. Login Bug Fixed — Only Super Admin Seeded
- Seed script creates ONLY `superadmin / Watershed@2026`
- All demo staff accounts removed
- All other staff must be created via admin panel with toggle matrix
- Login route degrades gracefully if ActiveSession table is missing

### 2. Real-Time Account Creation
- Self-onboarding uses email + password (customer can login immediately)
- Staff accounts created by super admin with temporary password
- No more demo accounts anywhere in the system

### 3. Role Toggle System (Editable Permission Matrix)
- Super admin can toggle any of 30 permission flags per staff
- 4 new flags: csKycVerify, csPaymentVerify, legalCacSearch, legalMcc
- Role defaults auto-load when role is selected
- Any flag can be independently toggled ON/OFF
- Changes take effect immediately

### 4. Dynamic Fee Manager
- Super admin can create/edit/delete fees at runtime
- Fees stored in SystemSetting table (category='fees')
- Each fee has: key, label, amount, active toggle
- Public endpoint `/api/public/fees` for self-onboarding
- Changes take effect immediately — no redeploy

### 5. Customer Service Improvements
- New `cs` role with granular toggles
- CS KYC Verification Queue (per-field rejection)
- CS Payment Verification Queue (manual bank transfers)
- Visibility controlled by csKycVerify + csPaymentVerify flags

### 6. Legal Dual Role
- `legalCacSearch` toggle — access CAC Name Search queue (onboarding)
- `legalMcc` toggle — access MCC Compliance queue (per-loan)
- A Legal staff member can have both, one, or neither
- Approving CAC search auto-generates account number

### 7. New 16-Step Governance Workflow
New step codes added (additive — old workflow still works):
- CS_KYC_REVIEW, LEGAL_CAC_SEARCH, BM_VETTING, HOC_CONFIRMATION
- CRO_REVIEW, LEGAL_MCC, MD_MCC_APPROVAL
- INTERNAL_CONTROL, COMPLIANCE_REVIEW, POST_DISBURSEMENT_HANDOFF

### 8. Decoupled Account Number
- Account number NOT assigned at onboarding
- Only assigned after Legal CAC approval
- Customer dashboard shows "Legal Review in Progress" banner
- CAM submission locked until account number is assigned

### 9. Staff Password Management
- Forgot Password flow (email with reset token)
- Reset Password page (verifies token)
- Change Password page (in admin settings)
- All audit-logged

### 10. Post-Disbursement Handoff
- `monitoringOwnerId` field on LoanApplicants
- After disbursement, loan is attached to original LO/BM
- New "My Portfolio" sidebar item shows monitored loans

## Quick start (local)

```bash
# 1. Unzip
unzip watershed-capital-v26.zip -d watershedfin
cd watershedfin

# 2. Install dependencies
npm install

# 3. Set up .env with Neon credentials
#    DATABASE_URL="postgresql://...pooled...neon.tech/db?sslmode=require"
#    DIRECT_URL="postgresql://...direct...neon.tech/db?sslmode=require"
#    JWT_SECRET="your-32-char-secret"
#    CRON_SECRET="your-64-char-cron-secret"
#    RESEND_API_KEY="your-resend-key"
#    NEXT_PUBLIC_BASE_URL="http://localhost:3000"

# 4. Generate Prisma client + push schema to Neon
npx prisma generate
npx prisma db push

# 5. Seed database (sectors, branches, super admin ONLY)
npx tsx scripts/seed.ts
# Login: superadmin / Watershed@2026

# 6. Seed default KYC fields
npx tsx scripts/seed-kyc-fields.ts

# 7. Start dev server
npm run dev

# 8. Open http://localhost:3000
# Login as superadmin / Watershed@2026
```

## Route audit — ZERO gaps

```
Total ViewKeys: 121
Router cases: 120
Missing: 1 (setup — intentional, first-run wizard)
Unused: 0
```

Run `python3 scripts/audit-routes.py` anytime to verify.

## Default credentials

| Account | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `Watershed@2026` |

**Change this password immediately after first login** via System Administration → Change Password.

All other staff accounts must be created via:
- System Administration → Create Staff (with toggle matrix)
- OR System Administration → Staff & Access Control → Quick Add

## Tech stack

- Next.js 16 (Turbopack)
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- PostgreSQL (Neon)
- Resend (email)
- JWT (HMAC-SHA256, custom impl)

## File count

619 files in this archive (~1.4 MB compressed).

# Watershed Capital — v0.24.0 (SuperAdmin System Control)

Full Next.js 16 + Prisma + PostgreSQL source for the Watershed Capital Banking Governance Platform.

## What's in this archive

| Path | Purpose |
|---|---|
| `src/` | All application source — pages, API routes, components, lib |
| `prisma/schema.prisma` | 82 Prisma models (79 from v23 + 3 new in v24) |
| `package.json` | v0.24.0 — dev script fixed for Windows |
| `vercel.json` | 4 daily cron jobs (auto-npl, payment-reminders, drip-campaigns, audit-cleanup) |
| `scripts/seed.ts` | DB seed script (sectors, branches, default staff) |
| `download/watershed-v24-deployment-runbook.pdf` | 15-page step-by-step deployment guide |

## v24 highlights

- 5 new superadmin features (dashboard, system health, feature flags, maintenance mode, active sessions, audit retention)
- 3 new Prisma models: `FeatureFlag`, `SystemSetting`, `ActiveSession`
- 7 new API routes under `/api/superadmin/*` + `/api/cron/audit-cleanup`
- 5 new view components under `src/components/views/superadmin/`
- Maintenance-mode middleware on `/api/auth/login` + `/api/customer/login`
- Windows compatibility fix in `package.json` dev script (removed `tee` pipe)

## Quick start (local)

```bash
# 1. Unzip
unzip watershed-capital-v24.zip -d watershedfin
cd watershedfin

# 2. Install dependencies
npm install        # or: bun install

# 3. Create .env file with your Neon credentials
#    DATABASE_URL="postgresql://...pooled...neon.tech/db?sslmode=require"
#    DIRECT_URL="postgresql://...direct...neon.tech/db?sslmode=require"
#    JWT_SECRET="your-32-char-secret"
#    CRON_SECRET="your-64-char-cron-secret"

# 4. Generate Prisma client + push schema to Neon
npx prisma generate
npx prisma db push

# 5. Seed the database (sectors, branches, default staff)
npx tsx scripts/seed.ts

# 6. Start dev server
npm run dev        # or: bun run dev

# 7. Open http://localhost:3000
```

## Production deployment

Follow the 15-page PDF runbook included in this archive:
**`download/watershed-v24-deployment-runbook.pdf`**

It walks through VS Code → GitHub → Neon → Vercel end-to-end with:
- 13-step post-deployment verification checklist
- Environment variables reference
- Rollback procedure
- 11 common troubleshooting scenarios

## Tech stack

- Next.js 16 (Turbopack)
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma ORM
- PostgreSQL (Neon)
- Resend (email)
- JWT (HMAC-SHA256, custom impl — no external lib)

## File count

566 files in this archive (~1.4 MB compressed).

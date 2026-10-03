# Watershed Capital v4 — Production Release

This archive is a hardened release of the uploaded Watershed v4 project. Existing application modules and source files were retained; release work is additive except where a security defect required changing the behavior of a mutation path.

## Included hardening

- Fail-closed JWT configuration and minimum production secret length.
- Server-bound admin identity, role and branch claims.
- Revocable admin sessions and customer logout token invalidation through `authVersion`.
- Private KYC/payment-proof access controls.
- Server-side onboarding/KYC/CAC workflow validation.
- Dynamic sector benchmark-margin authority; client-submitted benchmark margins are not authoritative.
- Paystack server-side initialization/amount verification/idempotency hardening already present in the corrected tree.
- Repayment, disbursement and GL integrity corrections from the audit pass.
- Mandatory maker/checker governance for protected accounting and treasury mutation routes.
- Persisted PendingMutation proposal state with segregation of duties.
- Exact-payload verification before execution.
- SuperAdmin governance queue for review, authorization, rejection and execution.
- Production `/api/health` database health endpoint.
- Prisma client generation during installation.
- Production migration deployment script.
- Production preflight validation script.

## Financial precision

The schema still contains Float fields. They must be classified into monetary versus non-monetary fields before blanket conversion. This release intentionally does **not** perform an unsafe mass conversion of every Float column because doing so without the real production database schema/data would risk corrupting financial data.

## First production deployment

Configure the Vercel project with:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET` (32+ random characters; use substantially longer in practice)
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- any storage/email/SMS provider credentials required by the enabled modules

Then:

```bash
npm ci
npm run release:preflight
npx prisma migrate deploy
npm run build
```

Use the application's `/api/health` endpoint after deployment and verify it returns `200` with `database: "ok"`.

## Governance workflow

Protected financial mutations now follow:

`PROPOSE → REVIEW → AUTHORIZE → EXECUTE`

The proposal stores the exact JSON payload. Execution is rejected if the submitted payload differs from the authorized proposal. The SuperAdmin dashboard exposes the active governance queue.

## Important release rule

Do not bypass the governance workflow by calling protected accounting/treasury mutation endpoints without the proposal stages. A direct mutation request is now converted into a persisted proposal rather than being executed immediately.

# Watershed v4 — Comprehensive Audit & Correction Report

Audit target: `watershedv4(2).zip`

## 1. Scope reviewed

- 96 Prisma models
- 187 API route files
- Authentication/authorization and JWT handling
- Customer self-onboarding and KYC
- CAC payment and Paystack webhook flow
- Legal CAC workflow
- MCC governance
- CAM / sector benchmark margin handling
- Loan repayment, schedule and disbursement accounting
- Branch targets and branch-performance calculations
- Accounting/Treasury actor identity
- Private KYC/payment documents
- Next.js deployment/security configuration
- Static TypeScript syntax consistency

## 2. High-priority corrections applied

### Authentication / authorization

1. Production JWT signing no longer uses a known fallback secret. Missing `JWT_SECRET` fails closed.
2. JWT signature comparison now uses constant-time comparison.
3. Admin JWTs require a server-side `ActiveSession`; missing/revoked/expired sessions are rejected.
4. Admin JWT role/status/branch claims are checked against the current database record, so role or branch changes invalidate stale tokens immediately.
5. Admin login now treats `ActiveSession` creation as mandatory instead of returning a token that cannot subsequently be verified.
6. Token type is explicit; callers can no longer silently obtain an admin token by omitting `type`.
7. Added authenticated `/api/auth/logout` and fixed the frontend logout bug that was clearing the wrong localStorage key.
8. Customer JWTs now contain a server-side `authVersion`; password resets increment it and invalidate previously issued customer tokens.
9. Customer login has an IP-based brute-force limiter; OTP verification now has a failed-attempt limiter.
10. Sensitive customer routes were tightened to admin roles and branch scope: customer search, credit score, assignment, profile updates, KYC action, branch/staff performance and staff/customer listings.
11. Admin blog mutation endpoints no longer accept any authenticated customer token.
12. Staff creation/reset/update privilege paths were tightened; role defaults now determine permissions instead of caller-supplied permission flags for non-super creators.
13. Staff password reset no longer falls back to the hard-coded `Password@123` credential and now revokes existing admin sessions.
14. Accounting/Treasury actor IDs are derived from JWTs rather than request-body `createdById`, `processedById` or `bookedBy` values.

### KYC / privacy

15. KYC approval now checks required server-side document presence before changing KYC status to approved.
16. KYC status update, business mirror and audit entry are now transactional.
17. KYC reviewer access is branch-scoped for Customer Service.
18. The private KYC file proxy now supports authorized KYC reviewers as well as the owning customer; ownership and branch checks are enforced.
19. KYC upload failure performs compensating cleanup for private storage/local temporary files.
20. Manual payment proof files are no longer written to the public `/payments` path. They use private Vercel Blob storage (or private `/tmp` fallback) and an authenticated admin proxy.
21. CS payment-proof UI and admin KYC document UI now fetch protected documents with authentication instead of using unauthenticated `<img>`/`<a>` URLs.

### Onboarding / governance

22. Self-onboarding now requires a customer password.
23. CAC consent acceptance time is server-generated rather than caller-controlled.
24. CAC fee is always read from `SystemSetting`; caller-supplied fee amounts are not trusted.
25. CAC certificate is enforced as a mandatory onboarding document; additional business documentation is enforced for registered/company structures.
26. Uploaded KYC document references are checked against the authenticated customer's private proxy namespace before persistence.
27. Onboarding duplicate detection is repeated inside a SERIALIZABLE transaction, preventing concurrent duplicate creation from bypassing the preflight check.
28. Application reference generation now runs through the transaction and the onboarding transaction uses SERIALIZABLE isolation.
29. Staff branch/Loan Officer assignments are validated server-side; customer self-onboarding cannot impersonate an internal staff assignment.
30. Loan plan status, min/max amount and duration are checked server-side during onboarding.
31. Onboarding now persists the selected business sector onto the loan.

### Sector / CAM financial integrity

32. CAM server-side recalculation no longer trusts browser-supplied sector benchmark margin.
33. The authoritative sector is resolved from a validated sector ID / appraisal / loan / business record, and the margin is read from the live `Sector.benchmarkedMargin` database value.
34. Server-side CAM recalculation rejects missing/unconfigured sector margins instead of inventing a 25% fallback.
35. Sector risk score is also read from the server-side sector record.
36. CAM UI sector selection now loads current server-configured sectors and makes benchmark margin read-only.
37. CAM UI no longer offers a client-side margin override.
38. Sector create/update validates the benchmark margin and writes an audit entry.
39. The project rule remains: **benchmark margin comes from the sector, and the sector margin is dynamically admin-configurable.** The CAM must use the least applicable margin where the Excel formula requires the minimum.

### Payments / Paystack

40. Loan repayment initiation now verifies payment type vs `loanId` and checks that the loan is running.
41. Production payment initiation now uses Paystack's server-side transaction initialization instead of the previous "demo mode" checkout placeholder.
42. Production Paystack initialization requires `PAYSTACK_SECRET_KEY` and a customer email and returns the real authorization URL/access code.
43. Onboarding Paystack initialization now returns the real authorization URL; the frontend no longer constructs a checkout URL from the reference.
44. Paystack amount/currency is checked against the local pending amount.
45. Paystack webhook signature verification remains raw-body/HMAC based and fail-closed in production.
46. Payment webhook intent/type mismatch is rejected.
47. Webhook repayment processing is SERIALIZABLE and rejects overpayment or missing schedules.
48. Onboarding payment webhook is idempotently claimed inside a transaction to prevent duplicate Legal cases.
49. CS manual payment confirmation is branch-scoped and transactional; failed user-stage synchronization no longer gets swallowed.
50. Onboarding payment initiation is idempotent for an existing pending payment and stores gateway checkout information.

### Loan repayment / disbursement

51. Fixed the customer repayment closure calculation that previously added the current payment twice.
52. Loan repayment closure now uses the actual stored repayment schedule rather than a simplified loan-total formula.
53. Concurrent repayments use SERIALIZABLE isolation and reject overpayment.
54. Repayment reference generation uses cryptographically strong UUIDs.
55. Calendar-month schedule dates now clamp end-of-month dates correctly (e.g. January 31 → February 28/29 rather than rolling into March).
56. Disbursement uses an atomic claim so two concurrent second approvers cannot both disburse the same loan.
57. Disbursement compliance now blocks on any non-verified/non-waived condition, rather than only critical conditions.
58. Disbursement GL was corrected from `Dr Loan Receivable / Cr Bank gross principal` to gross receivable plus net bank cash outflow, upfront-fee revenue and CCD liability postings.
59. Added a Credit Contribution Deposit liability account seed (`2110`) with fallback to the customer-deposit liability account.

### Branch targets / performance

60. Branch target write/read flow now uses the `BranchTarget` versioned model rather than only legacy `Branch.monthly*Target` columns.
61. Target versions use transactional activation/supersession and SERIALIZABLE isolation.
62. BM submissions are `SUBMITTED`; senior roles can activate them.
63. Added `/api/branches/[id]/target/approve` for target approval.
64. Branch performance now reads active versioned targets with legacy fallback.
65. Fixed the branch-performance LO actuals placeholder: actual disbursements are now queried from real loans.
66. LO target selection respects monthly/quarterly/annual period type.
67. Branch/staff performance endpoints are branch-scoped for branch roles.

### Deployment / platform hardening

68. Added security response headers in `next.config.ts`: `nosniff`, `SAMEORIGIN`, Referrer-Policy, Permissions-Policy and HSTS.
69. Added a migration for the new customer `authVersion` and Paystack onboarding gateway fields.
70. Added the PostgreSQL migration lock file.

## 3. Remaining production hardening items

The previously identified maker/checker bypass has now been closed. Protected accounting/treasury mutation routes require the persisted proposal workflow, exact-payload execution, and completion stamping. A governance queue is available in the SuperAdmin dashboard.



These are deliberately **not disguised as fixed** because safely implementing them requires coordinated backend + frontend + database work.

### COMPLETED — Maker/checker governance is now enforced

The protected routes now invoke `requireMakerChecker()` unconditionally. A request without an explicit stage is treated as a proposal and is persisted instead of executing the mutation.

- accounting invoices
- accounting payroll
- accounting expenses
- accounting bills
- teller deposit
- teller withdrawal
- bill payment
- treasury investments
- treasury investment update

More importantly, there is no route currently creating `PendingMutation` proposals. Therefore the maker/checker framework is present but not a complete executable workflow.

**Implemented in this release:** persisted proposal state, segregation of duties, review/authorization endpoints, exact payload matching, execution completion stamping, and a SuperAdmin governance queue.

### P1 — Prisma migration history is incomplete

The ZIP contains the Prisma schema but did not contain the project's historical migration set. A single hardening migration was added for the new fields, but it is **not a replacement for a baseline migration**.

Before using `prisma migrate deploy` against a fresh database, establish a proper baseline from the existing production schema. Do not blindly run the one hardening migration as if it were the full schema history on a brand-new database.

### P1 — Prisma `Float` fields remain

The schema still contains 136 `Float` fields. Some are legitimate ratios/ratings, but many financial inputs/outputs are still represented as floating point values and are subsequently converted through JavaScript `Number()`.

For a financial ledger/CAM platform, the remaining monetary fields should be classified and migrated to `Decimal(18,2)` (or another explicit precision policy), with calculations using `Prisma.Decimal` or integer minor units where appropriate.

This is a large migration and should be done as a dedicated financial-integrity release rather than changing all fields blindly.

### P1 — Customer/admin JWTs remain in localStorage

This keeps the current bearer-token architecture but exposes tokens to JavaScript/XSS. The stronger architecture is an HttpOnly, Secure, SameSite cookie/session model, with CSRF protection for state-changing requests.

### P1 — Rate limiting is still process-local

Several endpoints have in-memory Maps for rate limiting. On Vercel/serverless, these are not a reliable distributed control. Authentication, OTP, password reset and payment initiation should use a shared limiter (for example Redis/Upstash or a database-backed atomic counter) before production launch.

### P1 — BranchMetricCatalog is not fully integrated

The schema has `BranchMetricCatalog`, but the target UI/API currently handles only the main disbursement and loan-count metrics. Other branch-performance KPIs still contain system defaults/hard-coded target assumptions. The catalog should become the authoritative source for all targetable KPIs, units, direction and period support.

### P1 — NPL taxonomy requires a policy/source-of-truth decision

The current constants contain an ordering where `PASS_WATCH` appears after `LOST`, which is internally suspicious. The thresholds should be reconciled against the approved business policy/Excel/source document before changing them. No arbitrary regulatory values were substituted during this audit.

### P2 — Full accounting/financial precision migration

`accounting.ts` still converts Decimal values to JavaScript numbers for arithmetic and journal item persistence. This is improved by Decimal database storage and atomic balance increments, but exact financial arithmetic should ultimately be Decimal end-to-end.

### P2 — Automated test coverage is insufficient

The project has parity scripts but no complete CI test suite covering the critical state machines. Required tests include:

- concurrent MCC decisions
- concurrent repayment/overpayment
- concurrent disbursement
- Paystack webhook replay
- onboarding payment/webhook race
- KYC approval with missing documents
- branch IDOR attempts
- stale-token role/branch changes
- sector-margin changes affecting CAM
- target version activation/supersession
- accounting journal balance invariants

## 4. Previous face-recognition error

The supplied Watershed ZIP does not contain a `public/models` face-recognition model tree or an active TensorFlow/face-api implementation matching the earlier WASM initialization error. That specific error therefore does not appear to belong to this Watershed v4 build and was not fabricated into this audit.

## 5. Validation performed

- Full source tree TypeScript syntax parsing was run with `tsc --noEmit --noResolve`.
- No TypeScript parser/syntax errors were returned for the source tree after the correction pass.
- Targeted checks for common type-error classes on modified files returned no matches under the available environment.
- A complete production build was **not** claimed because the ZIP did not provide a usable installed dependency tree and a full dependency installation was not completed in this audit environment.

## 6. Deployment checklist before Vercel production

Required environment variables include at minimum:

- `DATABASE_URL` — Neon pooled/runtime URL
- `DIRECT_URL` — Neon direct/migration URL
- `JWT_SECRET` — strong random production secret
- `PAYSTACK_SECRET_KEY`
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `PAYSTACK_CALLBACK_URL` (recommended explicit production callback)
- Vercel Blob token for private KYC/payment documents

Then:

1. Generate Prisma Client from the corrected schema.
2. Baseline the existing Neon database correctly.
3. Apply the new hardening migration.
4. Run the complete build with `typescript.ignoreBuildErrors=false`.
5. Run concurrency/security integration tests against a non-production database.
6. Verify Paystack webhook URL/signature configuration.
7. Verify private KYC/payment document access using CS, Compliance, Super Admin and customer accounts.
8. Complete the maker/checker state machine before enabling unrestricted accounting/treasury production mutations.



## Release validation performed 2026-09-27

- Original archive compared against this release: no original files deleted.
- Static production preflight: PASS.
- Targeted TypeScript parse check: no syntax/type-parser diagnostics in changed files after dependency-resolution errors were excluded.
- Full dependency installation/build could not be completed in the audit container because package installation timed out; Vercel should perform the normal `npm ci` + `next build` during deployment.
- ZIP integrity is tested with `unzip -t` before delivery.

# Cron Jobs — Watershed Capital

The platform ships with three cron endpoints that handle payment reminders,
NPL classification and lifecycle drip campaigns. They are stateless HTTP
`GET` handlers, so any scheduler that can hit a URL (Vercel Cron, Railway
cron, Render cron, a system crontab, or even a manual `curl`) can drive them.

All endpoints return a JSON summary with `success`, `startedAt`,
`finishedAt`, `durationMs` and a per-job `stats` object so you can monitor
runs from your observability stack.

---

## Daily Jobs

### Payment Reminders

- **URL**: `GET /api/cron/payment-reminders`
- **Schedule**: Daily at 08:00 (platform time)
- **What it does**:
  - Scans every loan with `status = 'running'`.
  - For the next unpaid instalment on each loan it emits the appropriate
    reminder bucket:
    - **3 days before due** → SMS + email + in-app notification
      (`payment_reminder` template)
    - **1 day before due** → urgent SMS + email (`payment_reminder` template)
    - **On due date** → "Payment Due Today" SMS + email
    - **1 day after due** → "Payment Overdue" SMS + email + notify Loan
      Officer (`payment_overdue` template)
    - **7 days after due** → "Final Notice" SMS + email + notify Branch
      Manager + set `loan.defaulter = true` (`payment_overdue` template)
  - Refreshes the loan's NPL classification metadata on every run.
  - Every notification is idempotent: it consults `AuditLog` (keyed by
    `loanId + repaymentId + bucket + date`) and skips same-day duplicates.
- **SMS provider**: configured via `SMS_PROVIDER` env var
  (`console | twilio | termii | africas_talking | vonage`).
- **Email provider**: configured via `EMAIL_PROVIDER` env var
  (`console | smtp | sendgrid | mailgun | postmark | ses`).

### Auto NPL Classification

- **URL**: `GET /api/cron/auto-npl`
- **Schedule**: Daily at 00:00 (platform time)
- **What it does**:
  - Scans every loan with `status = 'running'`.
  - Computes `daysOverdue` anchored on the earliest past-due unpaid
    instalment (falls back to a synthesised schedule when no
    `LoanRepayment` rows exist).
  - Maps to the 8-stage NPL ladder via `classifyNPL()`:

    | Days overdue | NPL stage    |
    |--------------|--------------|
    | 0            | PERFORMING   |
    | 1 – 7        | WATCHLIST    |
    | 8 – 30       | SUBSTANDARD  |
    | 31 – 60      | DOUBTFUL     |
    | 61 – 90      | LOST         |
    | 91 – 179     | PASS_WATCH   |
    | ≥ 180        | WRITE_OFF    |

  - Sets `loan.defaulter = true` once `daysOverdue > 30`.
  - Persists the latest classification on `loan.bmRiskFlags` JSON metadata
    so dashboards surface the current ladder stage without a schema change.
  - Writes an `AuditLog` entry (severity scales with stage) every time the
    classification transitions, giving the risk team a clean audit trail.

### Drip Campaigns

- **URL**: `GET /api/cron/drip-campaigns`
- **Schedule**: Daily at 09:00 (platform time)
- **What it does**:
  - Walks the user base and emits any drip-campaign step that is now due
    based on the user's lifecycle state. Campaigns are defined in
    [`src/lib/email-campaigns.ts`](src/lib/email-campaigns.ts) and currently
    cover:
    - `welcome` (0 / 24 / 72 h after sign-up)
    - `kyc_pending` (KYC stuck in `PENDING` / `PROCESSING` / `RESUBMIT`)
    - `loan_submitted` (0 / 48 h after submission)
    - `loan_approved` (offer letter generated)
    - `loan_disbursed` (0 / 168 h after disbursement)
    - `loan_completed` (loan transitioned to `paid`)
    - `payment_due` (manual trigger helper)
  - Every `(campaign, user, step)` emission is idempotent: `AuditLog` is
    checked for a prior send with the same key and skipped if already
    delivered. All sends are fire-and-forget.

---

## Setup Options

### Vercel Cron (free tier — 2 jobs on Hobby, unlimited on Pro)

Add a `vercel.json` at the project root:

```json
{
  "crons": [
    { "path": "/api/cron/payment-reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/auto-npl",          "schedule": "0 0 * * *" },
    { "path": "/api/cron/drip-campaigns",    "schedule": "0 9 * * *" }
  ]
}
```

Vercel Cron invokes the path from the deployment region every time the
schedule fires. No authentication is wired by default — front these with
your own `CRON_SECRET` query-string check if you need to lock them down
(e.g. `?key=...`).

### External Cron (any VPS / dedicated host)

```bash
# crontab -e
0 8 * * *  curl -fsS https://your-domain.com/api/cron/payment-reminders
0 0 * * *  curl -fsS https://your-domain.com/api/cron/auto-npl
0 9 * * *  curl -fsS https://your-domain.com/api/cron/drip-campaigns
```

Pipe the JSON response into your log aggregator if you want run stats.

### Railway / Render / Fly.io

Use the platform's built-in cron / scheduler to hit the three endpoints at
the schedules above. For Railway, add a "Cron Job" service per endpoint.
For Render, add a "Cron Job" with the matching `curl` command.

### Manual / one-off invocation

```bash
# All three are plain GET endpoints — fire them from your browser,
# Postman, or curl whenever you need an immediate run.
curl https://your-domain.com/api/cron/payment-reminders
curl https://your-domain.com/api/cron/auto-npl
curl https://your-domain.com/api/cron/drip-campaigns
```

---

## Idempotency & Safety

- All three jobs are safe to re-run multiple times per day. Each reminder /
  drip send is keyed by `(loanId|userId, repaymentId, bucket|stepIndex,
  date)` and recorded in `AuditLog` before the actual send completes, so a
  crashed mid-run will not double-fire on retry.
- All SMS/email dispatch is fire-and-forget — the cron response is never
  blocked by a slow provider. Failures are logged but never crash the run.
- The auto-NPL job writes a single `UPDATE` per loan only when the
  classification or `daysOverdue` value actually changes, keeping the audit
  log free of noisy no-op entries.

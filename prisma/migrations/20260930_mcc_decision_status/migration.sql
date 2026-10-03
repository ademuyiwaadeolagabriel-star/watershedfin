ALTER TABLE "MccDecision"
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "MccDecision_loanApplicantId_approverRole_status_idx"
ON "MccDecision" ("loanApplicantId", "approverRole", "status");

CREATE INDEX IF NOT EXISTS "MccDecision_status_idx"
ON "MccDecision" ("status");

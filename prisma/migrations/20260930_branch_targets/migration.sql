CREATE TABLE IF NOT EXISTS "BranchMetricCatalog" (
  "id" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'higher_is_better',
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchMetricCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchMetricCatalog_metricKey_key"
ON "BranchMetricCatalog" ("metricKey");

CREATE TABLE IF NOT EXISTS "BranchTarget" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "periodType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "targetValue" DECIMAL(18,2) NOT NULL,
  "unit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "reasonForChange" TEXT,
  "templateId" TEXT,

  CONSTRAINT "BranchTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchTarget_branchId_metricKey_periodType_periodStart_status_key"
ON "BranchTarget" ("branchId", "metricKey", "periodType", "periodStart", "status");

CREATE INDEX IF NOT EXISTS "BranchTarget_branchId_metricKey_periodStart_idx"
ON "BranchTarget" ("branchId", "metricKey", "periodStart");

CREATE INDEX IF NOT EXISTS "BranchTarget_branchId_status_idx"
ON "BranchTarget" ("branchId", "status");

CREATE INDEX IF NOT EXISTS "BranchTarget_periodType_periodStart_idx"
ON "BranchTarget" ("periodType", "periodStart");

CREATE TABLE IF NOT EXISTS "BranchTargetTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "branchId" TEXT,
  "metrics" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchTargetTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchTargetTemplate_name_key"
ON "BranchTargetTemplate" ("name");

CREATE INDEX IF NOT EXISTS "BranchTargetTemplate_branchId_idx"
ON "BranchTargetTemplate" ("branchId");

CREATE TABLE IF NOT EXISTS "BranchAlert" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "alertType" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "message" TEXT NOT NULL,
  "thresholdValue" DECIMAL(18,2),
  "actualValue" DECIMAL(18,2),
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BranchAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BranchAlert_branchId_isResolved_idx"
ON "BranchAlert" ("branchId", "isResolved");

CREATE INDEX IF NOT EXISTS "BranchAlert_metricKey_idx"
ON "BranchAlert" ("metricKey");

CREATE INDEX IF NOT EXISTS "BranchAlert_createdAt_idx"
ON "BranchAlert" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BranchTarget_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchTarget"
      ADD CONSTRAINT "BranchTarget_branchId_fkey"
      FOREIGN KEY ("branchId")
      REFERENCES "Branch"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BranchTargetTemplate_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchTargetTemplate"
      ADD CONSTRAINT "BranchTargetTemplate_branchId_fkey"
      FOREIGN KEY ("branchId")
      REFERENCES "Branch"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'BranchAlert_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchAlert"
      ADD CONSTRAINT "BranchAlert_branchId_fkey"
      FOREIGN KEY ("branchId")
      REFERENCES "Branch"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "LegalNameSearch"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "LegalNameSearch_userId_isActive_idx"
ON "LegalNameSearch" ("userId", "isActive");

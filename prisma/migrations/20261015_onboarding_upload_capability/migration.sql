BEGIN;

CREATE TABLE IF NOT EXISTS "OnboardingUploadCapability" (
    "id" TEXT NOT NULL,
    "capabilityToken" TEXT NOT NULL,
    "onboardingKey" TEXT NOT NULL,
    "permittedDocTypes" TEXT NOT NULL,
    "maxFiles" INTEGER NOT NULL DEFAULT 5,
    "maxFileSizeBytes" INTEGER NOT NULL DEFAULT 10485760,
    "uploadedFiles" TEXT NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "OnboardingUploadCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingUploadCapability_capabilityToken_key"
    ON "OnboardingUploadCapability"("capabilityToken");

CREATE INDEX IF NOT EXISTS "OnboardingUploadCapability_onboardingKey_idx"
    ON "OnboardingUploadCapability"("onboardingKey");

CREATE INDEX IF NOT EXISTS "OnboardingUploadCapability_capabilityToken_idx"
    ON "OnboardingUploadCapability"("capabilityToken");

CREATE INDEX IF NOT EXISTS "OnboardingUploadCapability_expiresAt_idx"
    ON "OnboardingUploadCapability"("expiresAt");

COMMIT;
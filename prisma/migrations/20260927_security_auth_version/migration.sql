-- Security hardening: invalidate customer JWTs after password/security changes.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OnboardingPayment" ADD COLUMN IF NOT EXISTS "gatewayUrl" TEXT;
ALTER TABLE "OnboardingPayment" ADD COLUMN IF NOT EXISTS "gatewayAccessCode" TEXT;

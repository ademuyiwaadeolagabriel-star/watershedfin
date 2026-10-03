-- Watershed Capital production schema reconciliation.
--
-- Purpose:
--   1. Repair live-schema fields missing despite earlier migration records.
--   2. Add MCC decision-history fields.
--   3. Remove verified redundant/conflicting indexes.
--   4. Convert classified monetary Float columns to DECIMAL(18,2).
--
-- Monetary conversion:
--   Existing values are explicitly rounded to 2 decimal places.
--   No NaN/Infinity values or DECIMAL(18,2) overflow values were found
--   in the pre-migration audit.
--
-- CAM:
--   Sector benchmark remains dynamically sourced from Sector.benchmarkedMargin.
--   The CAM engine continues to use the lowest applicable non-zero margin.
--

BEGIN;
-- DropIndex
DROP INDEX IF EXISTS "LegalNameSearch_userId_idx";

-- DropIndex
DROP INDEX IF EXISTS "MccDecision_loanApplicantId_approverId_approverRole_key";

-- AlterTable
ALTER TABLE "Admin" ALTER COLUMN "monthlyDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyDisbursementTarget"::numeric, 2),
ALTER COLUMN "annualDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("annualDisbursementTarget"::numeric, 2),
ALTER COLUMN "quarterlyDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("quarterlyDisbursementTarget"::numeric, 2);

-- AlterTable
ALTER TABLE "Balance" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "BankTransaction" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,2) USING ROUND("debit"::numeric, 2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,2) USING ROUND("credit"::numeric, 2),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2) USING ROUND("balance"::numeric, 2);

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "monthlyDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyDisbursementTarget"::numeric, 2),
ALTER COLUMN "annualDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("annualDisbursementTarget"::numeric, 2),
ALTER COLUMN "quarterlyDisbursementTarget" SET DATA TYPE DECIMAL(18,2) USING ROUND("quarterlyDisbursementTarget"::numeric, 2);

-- AlterTable
ALTER TABLE "Business" ALTER COLUMN "businessWorth" SET DATA TYPE DECIMAL(18,2) USING ROUND("businessWorth"::numeric, 2),
ALTER COLUMN "stockValue" SET DATA TYPE DECIMAL(18,2) USING ROUND("stockValue"::numeric, 2),
ALTER COLUMN "monthlySales" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlySales"::numeric, 2),
ALTER COLUMN "dailyGoodSales" SET DATA TYPE DECIMAL(18,2) USING ROUND("dailyGoodSales"::numeric, 2),
ALTER COLUMN "dailyBadSales" SET DATA TYPE DECIMAL(18,2) USING ROUND("dailyBadSales"::numeric, 2),
ALTER COLUMN "dailyAvgSales" SET DATA TYPE DECIMAL(18,2) USING ROUND("dailyAvgSales"::numeric, 2);

-- AlterTable
ALTER TABLE "ChartOfAccount" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2) USING ROUND("balance"::numeric, 2);

-- AlterTable
ALTER TABLE "CreditAppraisal" ALTER COLUMN "salesClientEstimate" SET DATA TYPE DECIMAL(18,2) USING ROUND("salesClientEstimate"::numeric, 2),
ALTER COLUMN "salesSpotCheck" SET DATA TYPE DECIMAL(18,2) USING ROUND("salesSpotCheck"::numeric, 2),
ALTER COLUMN "salesBookRecord" SET DATA TYPE DECIMAL(18,2) USING ROUND("salesBookRecord"::numeric, 2),
ALTER COLUMN "salesRecords" SET DATA TYPE DECIMAL(18,2) USING ROUND("salesRecords"::numeric, 2),
ALTER COLUMN "salesBankStatement" SET DATA TYPE DECIMAL(18,2) USING ROUND("salesBankStatement"::numeric, 2),
ALTER COLUMN "consideredMonthlySales" SET DATA TYPE DECIMAL(18,2) USING ROUND("consideredMonthlySales"::numeric, 2),
ALTER COLUMN "purchasesClientEstimate" SET DATA TYPE DECIMAL(18,2) USING ROUND("purchasesClientEstimate"::numeric, 2),
ALTER COLUMN "purchasesBankDebit" SET DATA TYPE DECIMAL(18,2) USING ROUND("purchasesBankDebit"::numeric, 2),
ALTER COLUMN "purchasesInvoices" SET DATA TYPE DECIMAL(18,2) USING ROUND("purchasesInvoices"::numeric, 2),
ALTER COLUMN "consideredMonthlyPurchases" SET DATA TYPE DECIMAL(18,2) USING ROUND("consideredMonthlyPurchases"::numeric, 2),
ALTER COLUMN "totalStockValue" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalStockValue"::numeric, 2),
ALTER COLUMN "monthlyGrossProfit" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyGrossProfit"::numeric, 2),
ALTER COLUMN "monthlyBusinessExpenses" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyBusinessExpenses"::numeric, 2),
ALTER COLUMN "monthlyFamilyExpenses" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyFamilyExpenses"::numeric, 2),
ALTER COLUMN "irregularFamilyExpenses" SET DATA TYPE DECIMAL(18,2) USING ROUND("irregularFamilyExpenses"::numeric, 2),
ALTER COLUMN "otherLoanRepayments" SET DATA TYPE DECIMAL(18,2) USING ROUND("otherLoanRepayments"::numeric, 2),
ALTER COLUMN "monthlyNetSurplus" SET DATA TYPE DECIMAL(18,2) USING ROUND("monthlyNetSurplus"::numeric, 2),
ALTER COLUMN "adjustedNetCashflow" SET DATA TYPE DECIMAL(18,2) USING ROUND("adjustedNetCashflow"::numeric, 2),
ALTER COLUMN "businessAssetValue" SET DATA TYPE DECIMAL(18,2) USING ROUND("businessAssetValue"::numeric, 2),
ALTER COLUMN "familyAssetValue" SET DATA TYPE DECIMAL(18,2) USING ROUND("familyAssetValue"::numeric, 2),
ALTER COLUMN "verifiedMonthlySales" SET DATA TYPE DECIMAL(18,2) USING ROUND("verifiedMonthlySales"::numeric, 2),
ALTER COLUMN "verifiedMonthlyCogs" SET DATA TYPE DECIMAL(18,2) USING ROUND("verifiedMonthlyCogs"::numeric, 2),
ALTER COLUMN "verifiedMonthlyNetProfit" SET DATA TYPE DECIMAL(18,2) USING ROUND("verifiedMonthlyNetProfit"::numeric, 2),
ALTER COLUMN "cashSalesPerDay" SET DATA TYPE DECIMAL(18,2) USING ROUND("cashSalesPerDay"::numeric, 2),
ALTER COLUMN "estimatedTreasury" SET DATA TYPE DECIMAL(18,2) USING ROUND("estimatedTreasury"::numeric, 2),
ALTER COLUMN "bmRecommendedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("bmRecommendedAmount"::numeric, 2),
ALTER COLUMN "hocRecommendedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("hocRecommendedAmount"::numeric, 2),
ALTER COLUMN "cfoApprovedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("cfoApprovedAmount"::numeric, 2),
ALTER COLUMN "finalApprovedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("finalApprovedAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2) USING ROUND("subtotal"::numeric, 2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("taxAmount"::numeric, 2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalAmount"::numeric, 2),
ALTER COLUMN "totalPaid" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalPaid"::numeric, 2),
ALTER COLUMN "writtenOffAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("writtenOffAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "InvoicePayment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "JournalItem" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,2) USING ROUND("debit"::numeric, 2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,2) USING ROUND("credit"::numeric, 2);

-- AlterTable
ALTER TABLE "LoanApplicants" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2),
ALTER COLUMN "payback" SET DATA TYPE DECIMAL(18,2) USING ROUND("payback"::numeric, 2),
ALTER COLUMN "vettedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("vettedAmount"::numeric, 2),
ALTER COLUMN "structuredAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("structuredAmount"::numeric, 2),
ALTER COLUMN "finalAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("finalAmount"::numeric, 2),
ALTER COLUMN "finalAdminFee" SET DATA TYPE DECIMAL(18,2) USING ROUND("finalAdminFee"::numeric, 2),
ALTER COLUMN "approvedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("approvedAmount"::numeric, 2),
ALTER COLUMN "appraisedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("appraisedAmount"::numeric, 2),
ALTER COLUMN "bmRecommendedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("bmRecommendedAmount"::numeric, 2),
ALTER COLUMN "hocRecommendedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("hocRecommendedAmount"::numeric, 2),
ALTER COLUMN "cfoApprovedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("cfoApprovedAmount"::numeric, 2),
ALTER COLUMN "riskApprovedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("riskApprovedAmount"::numeric, 2),
ALTER COLUMN "finalApprovedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("finalApprovedAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "LoanPlan" ALTER COLUMN "failedInterest" SET DATA TYPE DECIMAL(18,2) USING ROUND("failedInterest"::numeric, 2),
ALTER COLUMN "min" SET DATA TYPE DECIMAL(18,2) USING ROUND("min"::numeric, 2),
ALTER COLUMN "max" SET DATA TYPE DECIMAL(18,2) USING ROUND("max"::numeric, 2),
ALTER COLUMN "suggestedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("suggestedAmount"::numeric, 2),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "LoanRepayment" ALTER COLUMN "amountDue" SET DATA TYPE DECIMAL(18,2) USING ROUND("amountDue"::numeric, 2),
ALTER COLUMN "principalPart" SET DATA TYPE DECIMAL(18,2) USING ROUND("principalPart"::numeric, 2),
ALTER COLUMN "interestPart" SET DATA TYPE DECIMAL(18,2) USING ROUND("interestPart"::numeric, 2),
ALTER COLUMN "feePart" SET DATA TYPE DECIMAL(18,2) USING ROUND("feePart"::numeric, 2),
ALTER COLUMN "amountPaid" SET DATA TYPE DECIMAL(18,2) USING ROUND("amountPaid"::numeric, 2);

-- AlterTable
ALTER TABLE "LoanRestructuring" ALTER COLUMN "currentPayment" SET DATA TYPE DECIMAL(18,2) USING ROUND("currentPayment"::numeric, 2);

-- AlterTable
ALTER TABLE "LoanTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "MccDecision" ADD COLUMN IF NOT EXISTS "decisionSequence" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "supersededById" TEXT,
ADD COLUMN IF NOT EXISTS "supersedesDecisionId" TEXT,
ALTER COLUMN "recommendedAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("recommendedAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "OnboardingConsent" ALTER COLUMN "feeAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("feeAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "OnboardingPayment" ADD COLUMN IF NOT EXISTS "gatewayAccessCode" TEXT,
ADD COLUMN IF NOT EXISTS "gatewayUrl" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "PayrollBatch" ALTER COLUMN "grossPay" SET DATA TYPE DECIMAL(18,2) USING ROUND("grossPay"::numeric, 2),
ALTER COLUMN "totalAllowances" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalAllowances"::numeric, 2),
ALTER COLUMN "totalDeductions" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalDeductions"::numeric, 2),
ALTER COLUMN "netPay" SET DATA TYPE DECIMAL(18,2) USING ROUND("netPay"::numeric, 2);

-- AlterTable
ALTER TABLE "Payslip" ALTER COLUMN "basicSalary" SET DATA TYPE DECIMAL(18,2) USING ROUND("basicSalary"::numeric, 2),
ALTER COLUMN "totalAllowances" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalAllowances"::numeric, 2),
ALTER COLUMN "totalDeductions" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalDeductions"::numeric, 2),
ALTER COLUMN "taxDeduction" SET DATA TYPE DECIMAL(18,2) USING ROUND("taxDeduction"::numeric, 2),
ALTER COLUMN "pensionDeduction" SET DATA TYPE DECIMAL(18,2) USING ROUND("pensionDeduction"::numeric, 2),
ALTER COLUMN "otherDeductions" SET DATA TYPE DECIMAL(18,2) USING ROUND("otherDeductions"::numeric, 2),
ALTER COLUMN "netPay" SET DATA TYPE DECIMAL(18,2) USING ROUND("netPay"::numeric, 2);

-- AlterTable
ALTER TABLE "Savings" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Settings" ALTER COLUMN "minPl" SET DATA TYPE DECIMAL(18,2) USING ROUND("minPl"::numeric, 2),
ALTER COLUMN "maxPl" SET DATA TYPE DECIMAL(18,2) USING ROUND("maxPl"::numeric, 2),
ALTER COLUMN "minAccount" SET DATA TYPE DECIMAL(18,2) USING ROUND("minAccount"::numeric, 2),
ALTER COLUMN "maxAccount" SET DATA TYPE DECIMAL(18,2) USING ROUND("maxAccount"::numeric, 2),
ALTER COLUMN "fiatPc" SET DATA TYPE DECIMAL(18,2) USING ROUND("fiatPc"::numeric, 2),
ALTER COLUMN "minTl" SET DATA TYPE DECIMAL(18,2) USING ROUND("minTl"::numeric, 2),
ALTER COLUMN "maxTl" SET DATA TYPE DECIMAL(18,2) USING ROUND("maxTl"::numeric, 2),
ALTER COLUMN "fiatTc" SET DATA TYPE DECIMAL(18,2) USING ROUND("fiatTc"::numeric, 2);

-- AlterTable
ALTER TABLE "StaffSalary" ALTER COLUMN "basicSalary" SET DATA TYPE DECIMAL(18,2) USING ROUND("basicSalary"::numeric, 2),
ALTER COLUMN "housingAllowance" SET DATA TYPE DECIMAL(18,2) USING ROUND("housingAllowance"::numeric, 2),
ALTER COLUMN "transportAllowance" SET DATA TYPE DECIMAL(18,2) USING ROUND("transportAllowance"::numeric, 2),
ALTER COLUMN "mealAllowance" SET DATA TYPE DECIMAL(18,2) USING ROUND("mealAllowance"::numeric, 2),
ALTER COLUMN "utilityAllowance" SET DATA TYPE DECIMAL(18,2) USING ROUND("utilityAllowance"::numeric, 2),
ALTER COLUMN "otherAllowances" SET DATA TYPE DECIMAL(18,2) USING ROUND("otherAllowances"::numeric, 2);

-- AlterTable
ALTER TABLE "Teller" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2) USING ROUND("balance"::numeric, 2);

-- AlterTable
ALTER TABLE "Till" ALTER COLUMN "currentBalance" SET DATA TYPE DECIMAL(18,2) USING ROUND("currentBalance"::numeric, 2),
ALTER COLUMN "balanceLimit" SET DATA TYPE DECIMAL(18,2) USING ROUND("balanceLimit"::numeric, 2),
ALTER COLUMN "openingBalance" SET DATA TYPE DECIMAL(18,2) USING ROUND("openingBalance"::numeric, 2);

-- AlterTable
ALTER TABLE "TillTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "Transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2),
ALTER COLUMN "charge" SET DATA TYPE DECIMAL(18,2) USING ROUND("charge"::numeric, 2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(18,2) USING ROUND("balanceAfter"::numeric, 2);

-- AlterTable
ALTER TABLE "TreasuryBankAsset" ALTER COLUMN "faceValue" SET DATA TYPE DECIMAL(18,2) USING ROUND("faceValue"::numeric, 2),
ALTER COLUMN "purchasePrice" SET DATA TYPE DECIMAL(18,2) USING ROUND("purchasePrice"::numeric, 2),
ALTER COLUMN "accruedIncome" SET DATA TYPE DECIMAL(18,2) USING ROUND("accruedIncome"::numeric, 2);

-- AlterTable
ALTER TABLE "TreasuryDailyAccrual" ALTER COLUMN "dailyInterestEarned" SET DATA TYPE DECIMAL(18,2) USING ROUND("dailyInterestEarned"::numeric, 2),
ALTER COLUMN "dailyWht" SET DATA TYPE DECIMAL(18,2) USING ROUND("dailyWht"::numeric, 2);

-- AlterTable
ALTER TABLE "TreasuryInvestment" ALTER COLUMN "principal" SET DATA TYPE DECIMAL(18,2) USING ROUND("principal"::numeric, 2),
ALTER COLUMN "accruedInterest" SET DATA TYPE DECIMAL(18,2) USING ROUND("accruedInterest"::numeric, 2),
ALTER COLUMN "whtDeducted" SET DATA TYPE DECIMAL(18,2) USING ROUND("whtDeducted"::numeric, 2);

-- AlterTable
ALTER TABLE "TreasuryProduct" ALTER COLUMN "minAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("minAmount"::numeric, 2),
ALTER COLUMN "maxAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("maxAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "TreasuryTransaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authVersion" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "previousLoanAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("previousLoanAmount"::numeric, 2);

-- AlterTable
ALTER TABLE "VendorBill" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(18,2) USING ROUND("subtotal"::numeric, 2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("taxAmount"::numeric, 2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalAmount"::numeric, 2),
ALTER COLUMN "totalPaid" SET DATA TYPE DECIMAL(18,2) USING ROUND("totalPaid"::numeric, 2);

-- AlterTable
ALTER TABLE "VendorPayment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2) USING ROUND("amount"::numeric, 2);

-- CreateTable
CREATE TABLE "CustomerAcceptanceEvidence" (
    "id" TEXT NOT NULL,
    "loanApplicantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signature" TEXT,
    "signatureType" TEXT NOT NULL DEFAULT 'typed',
    "acceptedTermsHash" TEXT NOT NULL,
    "offerVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAcceptanceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferAcceptanceOtp" (
    "id" TEXT NOT NULL,
    "loanApplicantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsHash" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "consumedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferAcceptanceOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingMutation" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "targetId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "authorizerId" TEXT,
    "rejectedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAcceptanceEvidence_loanApplicantId_key" ON "CustomerAcceptanceEvidence"("loanApplicantId");

-- CreateIndex
CREATE INDEX "CustomerAcceptanceEvidence_userId_idx" ON "CustomerAcceptanceEvidence"("userId");

-- CreateIndex
CREATE INDEX "CustomerAcceptanceEvidence_loanApplicantId_idx" ON "CustomerAcceptanceEvidence"("loanApplicantId");

-- CreateIndex
CREATE INDEX "OfferAcceptanceOtp_loanApplicantId_termsHash_idx" ON "OfferAcceptanceOtp"("loanApplicantId", "termsHash");

-- CreateIndex
CREATE INDEX "OfferAcceptanceOtp_userId_idx" ON "OfferAcceptanceOtp"("userId");

-- CreateIndex
CREATE INDEX "OfferAcceptanceOtp_expiresAt_idx" ON "OfferAcceptanceOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "PendingMutation_operation_status_idx" ON "PendingMutation"("operation", "status");

-- CreateIndex
CREATE INDEX "PendingMutation_makerId_idx" ON "PendingMutation"("makerId");

-- CreateIndex
CREATE INDEX "PendingMutation_targetId_idx" ON "PendingMutation"("targetId");

-- CreateIndex
CREATE INDEX "MccDecision_supersedesDecisionId_idx" ON "MccDecision"("supersedesDecisionId");

-- AddForeignKey
ALTER TABLE "CustomerAcceptanceEvidence" ADD CONSTRAINT "CustomerAcceptanceEvidence_loanApplicantId_fkey" FOREIGN KEY ("loanApplicantId") REFERENCES "LoanApplicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferAcceptanceOtp" ADD CONSTRAINT "OfferAcceptanceOtp_loanApplicantId_fkey" FOREIGN KEY ("loanApplicantId") REFERENCES "LoanApplicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "BranchTarget_branchId_metricKey_periodType_periodStart_status_k" RENAME TO "BranchTarget_branchId_metricKey_periodType_periodStart_stat_key";
COMMIT;
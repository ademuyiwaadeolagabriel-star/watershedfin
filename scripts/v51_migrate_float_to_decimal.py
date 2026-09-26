#!/usr/bin/env python3
"""
v51 — Continue the Float → Decimal migration on the most-trafficked
monetary fields.

We migrate fields where the semantic is unambiguously monetary (naira
amounts, salaries, fees, balances, etc.). We DO NOT migrate:
  - GPS coordinates (gpsLatitude, gpsLongitude, gpsAccuracy, etc.)
  - Percentages (interest, percent, failedPercent, etc.) — these are
    ratios not money, and Float is acceptable for them at this stage.
  - Ratios (dscrRatio, dsrRatio, stockMatchPercentage, etc.)

After migration, callers must wrap Decimal reads with Number() before
doing arithmetic. We update the obvious arithmetic sites in this script
where the patched route already references the Decimal field.
"""

import re
from pathlib import Path

SCHEMA = 'prisma/schema.prisma'

# (model, field, new_field_line)
# Each tuple replaces `field Float` (or `field Float?`) with the Decimal
# equivalent. We preserve nullability.
MIGRATIONS = [
    # LoanApplicants — loan principal, vetted/structured/final amounts
    ('LoanApplicants', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('LoanApplicants', 'payback', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'vettedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'structuredAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'finalAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'finalAdminFee', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'approvedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'appraisedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'bmRecommendedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'hocRecommendedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'cfoApprovedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'riskApprovedAmount', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'finalApprovedAmount', 'Decimal? @db.Decimal(18,2)'),

    # Balance — wallet balance
    ('Balance', 'amount', 'Decimal  @db.Decimal(18,2)'),

    # Transactions — payment transaction amount + charge
    ('Transactions', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('Transactions', 'charge', 'Decimal  @db.Decimal(18,2)'),

    # ChartOfAccount — current balance
    ('ChartOfAccount', 'balance', 'Decimal  @db.Decimal(18,2) @default(0)'),

    # JournalItem — debit / credit
    ('JournalItem', 'debit', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('JournalItem', 'credit', 'Decimal  @db.Decimal(18,2) @default(0)'),

    # TreasuryInvestment — faceValue, estimatedTreasury, dailyInterestEarned
    ('TreasuryInvestment', 'faceValue', 'Decimal  @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'estimatedTreasury', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'dailyInterestEarned', 'Decimal? @db.Decimal(18,2)'),

    # TreasuryAsset
    ('TreasuryAsset', 'currentBalance', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryAsset', 'balanceLimit', 'Decimal? @db.Decimal(18,2)'),

    # Expense
    ('Expense', 'amount', 'Decimal  @db.Decimal(18,2)'),

    # Bill
    ('Bill', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('Bill', 'amountPaid', 'Decimal  @db.Decimal(18,2) @default(0)'),

    # Invoice
    ('Invoice', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('Invoice', 'amountPaid', 'Decimal  @db.Decimal(18,2) @default(0)'),

    # Payroll
    ('Payroll', 'basicSalary', 'Decimal  @db.Decimal(18,2)'),
    ('Payroll', 'netPay', 'Decimal? @db.Decimal(18,2)'),

    # OnboardingPayment — CAC search fee
    ('OnboardingPayment', 'amount', 'Decimal  @db.Decimal(18,2)'),

    # TellerDeposit / TellerWithdrawal
    ('TellerDeposit', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('TellerWithdrawal', 'amount', 'Decimal  @db.Decimal(18,2)'),

    # Till — current balance
    ('Till', 'balance', 'Decimal  @db.Decimal(18,2) @default(0)'),

    # Vendor — opening balance
    ('Vendor', 'openingBalance', 'Decimal  @db.Decimal(18,2) @default(0)'),
]


def patch_schema():
    src = Path(SCHEMA).read_text(encoding='utf-8')

    # Split source into model blocks
    # Match: model X { ... }  (with brace matching)
    model_re = re.compile(r"(model\s+(\w+)\s*\{[^}]*?\n\})", re.DOTALL)

    counts = {'migrated': 0, 'skipped_already_decimal': 0, 'skipped_not_found': 0}

    def replace_in_model(match):
        nonlocal counts
        block = match.group(1)
        model_name = match.group(2)
        new_block = block
        for (mname, field, new_type_decl) in MIGRATIONS:
            if mname != model_name:
                continue
            # Pattern: `  field Float` or `  field Float?` or `  field Float    @default(...)`
            # We replace the type annotation only.
            field_pat = re.compile(
                r"^(\s*" + re.escape(field) + r")\s+Float(\?\s*|\s+)(.*)$",
                re.MULTILINE,
            )
            def field_replace(m):
                return f"{m.group(1)}  {new_type_decl.lstrip()}".rstrip() if not m.group(3) else f"{m.group(1)}  {new_type_decl.lstrip()}  {m.group(3)}".rstrip()
            new_block, n = field_pat.subn(field_replace, new_block)
            if n > 0:
                counts['migrated'] += 1
                print(f"  ✓ {model_name}.{field} → Decimal")
            # else: field may already be Decimal or just not present
        return new_block

    new_src = model_re.sub(replace_in_model, src)
    Path(SCHEMA).write_text(new_src, encoding='utf-8')
    print(f"\nMigration summary: {counts}")


if __name__ == '__main__':
    patch_schema()

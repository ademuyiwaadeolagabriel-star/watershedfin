#!/usr/bin/env python3
"""
v51 — Float → Decimal migration, done correctly.

The previous version of this script used `\s+` after Float which matched
across newlines, merging field declarations onto single lines. This version
uses `[ \t]+` so the post-Float whitespace only matches on a single line.
"""

import re
from pathlib import Path

SCHEMA = 'prisma/schema.prisma'

# (model, field, new_type_decl)
# The new_type_decl is the FULL replacement for "Float" (or "Float?") plus
# any inline @default/etc that was there.
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
    # Balance
    ('Balance', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # Transactions
    ('Transactions', 'amount', 'Decimal  @db.Decimal(18,2)'),
    ('Transactions', 'charge', 'Decimal  @db.Decimal(18,2)'),
    # ChartOfAccount
    ('ChartOfAccount', 'balance', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # JournalItem
    ('JournalItem', 'debit', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('JournalItem', 'credit', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # Expense (already migrated by part 1 — keep idempotent)
    ('Expense', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # OnboardingPayment
    ('OnboardingPayment', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # VendorBill
    ('VendorBill', 'subtotal', 'Decimal  @db.Decimal(18,2)'),
    ('VendorBill', 'taxAmount', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('VendorBill', 'totalAmount', 'Decimal  @db.Decimal(18,2)'),
    ('VendorBill', 'totalPaid', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # VendorPayment
    ('VendorPayment', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # Invoice
    ('Invoice', 'subtotal', 'Decimal  @db.Decimal(18,2)'),
    ('Invoice', 'taxAmount', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Invoice', 'totalAmount', 'Decimal  @db.Decimal(18,2)'),
    ('Invoice', 'totalPaid', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Invoice', 'writtenOffAmount', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # InvoicePayment
    ('InvoicePayment', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # Payslip
    ('Payslip', 'basicSalary', 'Decimal  @db.Decimal(18,2)'),
    ('Payslip', 'totalAllowances', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Payslip', 'totalDeductions', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Payslip', 'taxDeduction', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Payslip', 'pensionDeduction', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Payslip', 'otherDeductions', 'Decimal  @db.Decimal(18,2) @default(0)'),
    ('Payslip', 'netPay', 'Decimal  @db.Decimal(18,2)'),
    # StaffSalary
    ('StaffSalary', 'basicSalary', 'Decimal  @db.Decimal(18,2)'),
    # Till
    ('Till', 'balance', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # TillTransaction
    ('TillTransaction', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # TreasuryInvestment
    ('TreasuryInvestment', 'faceValue', 'Decimal  @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'principalInvested', 'Decimal  @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'estimatedTreasury', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'dailyInterestEarned', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'accruedIncome', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryInvestment', 'accruedInterest', 'Decimal? @db.Decimal(18,2)'),
    # TreasuryTransaction
    ('TreasuryTransaction', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # TreasuryBankAsset
    ('TreasuryBankAsset', 'currentBalance', 'Decimal? @db.Decimal(18,2)'),
    ('TreasuryBankAsset', 'balanceLimit', 'Decimal? @db.Decimal(18,2)'),
    # Vendor
    ('Vendor', 'openingBalance', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # Savings
    ('Savings', 'balance', 'Decimal  @db.Decimal(18,2) @default(0)'),
    # BankTransaction
    ('BankTransaction', 'amount', 'Decimal  @db.Decimal(18,2)'),
    # TreasuryDailyAccrual
    ('TreasuryDailyAccrual', 'accrualAmount', 'Decimal  @db.Decimal(18,2)'),
]


def patch_schema():
    src = Path(SCHEMA).read_text(encoding='utf-8')
    # Match each model block. Use non-greedy with explicit brace end on its own line.
    model_re = re.compile(r"(model\s+(\w+)\s*\{(?:[^}]|\n)*?\n\})", re.DOTALL)
    counts = {'migrated': 0, 'already_decimal': 0}

    def replace_in_model(match):
        block = match.group(1)
        model_name = match.group(2)
        new_block = block
        for (mname, field, new_type_decl) in MIGRATIONS:
            if mname != model_name:
                continue
            # Pattern: ^(\s*field)\s+Float(\?)?(\s+.*)?$  -- only on a single line!
            # Use [ \t] (no \n) for whitespace after Float.
            field_pat = re.compile(
                r"^([ \t]*" + re.escape(field) + r")[ \t]+Float(\?)?([ \t]+[^/\n].*?)?(\s*//.*)?$",
                re.MULTILINE,
            )
            def field_replace(m):
                optional = '?' if m.group(2) else ''
                # If new_type_decl already includes the optional marker, use it as-is.
                # Otherwise append the optional marker.
                if optional == '?' and '?' not in new_type_decl:
                    decl = new_type_decl.rstrip()
                    # Insert '?' after Decimal
                    decl = decl.replace('Decimal', 'Decimal?', 1)
                else:
                    decl = new_type_decl
                base = f"{m.group(1)}  {decl.lstrip()}".rstrip()
                # Preserve any inline default attribute that was on the original Float line
                # (the new_type_decl already includes @default(...) when relevant, so we
                # only preserve additional attributes the original had)
                trailing = m.group(3) or ''
                trailing = trailing.rstrip()
                if trailing and not any(attr in decl for attr in trailing.split()):
                    # Only add the trailing if it's a NEW attribute we haven't already set
                    base += "  " + trailing
                comment = m.group(4) or ''
                if comment:
                    base += "  " + comment.strip()
                return base
            new_block, n = field_pat.subn(field_replace, new_block)
            if n > 0:
                counts['migrated'] += 1
                print(f"  ✓ {model_name}.{field} → Decimal")
            else:
                # Check if already Decimal
                check_pat = re.compile(r"^[ \t]*" + re.escape(field) + r"[ \t]+Decimal", re.MULTILINE)
                if check_pat.search(new_block):
                    counts['already_decimal'] += 1
        return new_block

    new_src = model_re.sub(replace_in_model, src)
    Path(SCHEMA).write_text(new_src, encoding='utf-8')
    print(f"\nMigration summary: {counts}")


if __name__ == '__main__':
    patch_schema()

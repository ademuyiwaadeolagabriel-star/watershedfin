#!/usr/bin/env python3
"""v51 part 2 — migrate remaining monetary Float fields."""

import re
from pathlib import Path

SCHEMA = 'prisma/schema.prisma'

MIGRATIONS = [
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
    ('StaffSalary', 'grossPay', 'Decimal  @db.Decimal(18,2)'),
    ('StaffSalary', 'netPay', 'Decimal  @db.Decimal(18,2)'),
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
    # LoanApplicants remaining monetary fields
    ('LoanApplicants', 'payback', 'Decimal? @db.Decimal(18,2)'),
    ('LoanApplicants', 'approvedAmount', 'Decimal? @db.Decimal(18,2)'),
]


def patch_schema():
    src = Path(SCHEMA).read_text(encoding='utf-8')
    model_re = re.compile(r"(model\s+(\w+)\s*\{[^}]*?\n\})", re.DOTALL)
    counts = {'migrated': 0}

    def replace_in_model(match):
        block = match.group(1)
        model_name = match.group(2)
        new_block = block
        for (mname, field, new_type_decl) in MIGRATIONS:
            if mname != model_name:
                continue
            field_pat = re.compile(
                r"^(\s*" + re.escape(field) + r")\s+Float(\?\s*|\s+)(.*)$",
                re.MULTILINE,
            )
            def field_replace(m):
                base = f"{m.group(1)}  {new_type_decl.lstrip()}".rstrip()
                if m.group(3).strip():
                    base += "  " + m.group(3).rstrip()
                return base
            new_block, n = field_pat.subn(field_replace, new_block)
            if n > 0:
                counts['migrated'] += 1
                print(f"  ✓ {model_name}.{field} → Decimal")
        return new_block

    new_src = model_re.sub(replace_in_model, src)
    Path(SCHEMA).write_text(new_src, encoding='utf-8')
    print(f"\nMigration summary: {counts}")


if __name__ == '__main__':
    patch_schema()

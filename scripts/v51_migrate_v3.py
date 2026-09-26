#!/usr/bin/env python3
"""
v51 — Float → Decimal migration, line-based state machine.

Walks the schema line by line, tracking which model block we're in.
When we see a line like `  amount   Float` or `  amount   Float?`, we
replace `Float` with the Decimal equivalent from the migration table.

This avoids regex catastrophic backtracking on the whole file.
"""

from pathlib import Path

SCHEMA = 'prisma/schema.prisma'

# (model, field, decimal_decl) — decimal_decl is the FULL type+attributes
# to replace "Float" (or "Float?") plus any inline @default on the original.
MIGRATIONS = {
    ('LoanApplicants', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('LoanApplicants', 'payback'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'vettedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'structuredAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'finalAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'finalAdminFee'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'approvedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'appraisedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'bmRecommendedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'hocRecommendedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'cfoApprovedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'riskApprovedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('LoanApplicants', 'finalApprovedAmount'): 'Decimal? @db.Decimal(18,2)',
    ('Balance', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('Transactions', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('Transactions', 'charge'): 'Decimal  @db.Decimal(18,2)',
    ('ChartOfAccount', 'balance'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('JournalItem', 'debit'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('JournalItem', 'credit'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Expense', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('OnboardingPayment', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('VendorBill', 'subtotal'): 'Decimal  @db.Decimal(18,2)',
    ('VendorBill', 'taxAmount'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('VendorBill', 'totalAmount'): 'Decimal  @db.Decimal(18,2)',
    ('VendorBill', 'totalPaid'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('VendorPayment', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('Invoice', 'subtotal'): 'Decimal  @db.Decimal(18,2)',
    ('Invoice', 'taxAmount'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Invoice', 'totalAmount'): 'Decimal  @db.Decimal(18,2)',
    ('Invoice', 'totalPaid'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Invoice', 'writtenOffAmount'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('InvoicePayment', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('Payslip', 'basicSalary'): 'Decimal  @db.Decimal(18,2)',
    ('Payslip', 'totalAllowances'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Payslip', 'totalDeductions'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Payslip', 'taxDeduction'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Payslip', 'pensionDeduction'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Payslip', 'otherDeductions'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Payslip', 'netPay'): 'Decimal  @db.Decimal(18,2)',
    ('StaffSalary', 'basicSalary'): 'Decimal  @db.Decimal(18,2)',
    ('Till', 'balance'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('TillTransaction', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('TreasuryInvestment', 'faceValue'): 'Decimal  @db.Decimal(18,2)',
    ('TreasuryInvestment', 'principalInvested'): 'Decimal  @db.Decimal(18,2)',
    ('TreasuryInvestment', 'estimatedTreasury'): 'Decimal? @db.Decimal(18,2)',
    ('TreasuryInvestment', 'dailyInterestEarned'): 'Decimal? @db.Decimal(18,2)',
    ('TreasuryInvestment', 'accruedIncome'): 'Decimal? @db.Decimal(18,2)',
    ('TreasuryInvestment', 'accruedInterest'): 'Decimal? @db.Decimal(18,2)',
    ('TreasuryTransaction', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('TreasuryBankAsset', 'currentBalance'): 'Decimal? @db.Decimal(18,2)',
    ('TreasuryBankAsset', 'balanceLimit'): 'Decimal? @db.Decimal(18,2)',
    ('Vendor', 'openingBalance'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('Savings', 'balance'): 'Decimal  @db.Decimal(18,2) @default(0)',
    ('BankTransaction', 'amount'): 'Decimal  @db.Decimal(18,2)',
    ('TreasuryDailyAccrual', 'accrualAmount'): 'Decimal  @db.Decimal(18,2)',
}


def patch_schema():
    src = Path(SCHEMA).read_text(encoding='utf-8')
    lines = src.split('\n')
    out_lines = []
    current_model = None
    counts = {'migrated': 0, 'already_decimal': 0}

    for line in lines:
        stripped = line.lstrip()
        if stripped.startswith('model '):
            # Extract model name
            parts = stripped.split()
            if len(parts) >= 2:
                current_model = parts[1].rstrip(' {')
            out_lines.append(line)
            continue
        if stripped == '}':
            current_model = None
            out_lines.append(line)
            continue

        # If we're inside a model block, check if this line declares a field
        if current_model:
            # Match: `  fieldName   Float` or `  fieldName   Float?` or with @default
            # Be strict: field name must be a single identifier followed by whitespace + Float
            tokens = stripped.split()
            if len(tokens) >= 2 and tokens[1].split('?')[0] == 'Float':
                field_name = tokens[0]
                key = (current_model, field_name)
                if key in MIGRATIONS:
                    # Replace Float with the new declaration, preserving indentation
                    # and any trailing @default(...) etc. (We've already accounted
                    # for @default in our migration table.)
                    # Find the column where "Float" appears in the line.
                    indent = line[:len(line) - len(stripped)]
                    # The simplest correct approach: re-emit the line with our
                    # pre-baked decimal_decl, preserving any trailing `// comment`.
                    comment_idx = line.find('//')
                    if comment_idx != -1:
                        comment = '  ' + line[comment_idx:].strip()
                    else:
                        comment = ''
                    new_line = f"{indent}{field_name}  {MIGRATIONS[key]}{comment}"
                    out_lines.append(new_line)
                    counts['migrated'] += 1
                    print(f"  ✓ {current_model}.{field_name} → Decimal")
                    continue
                # Already Decimal? Just pass through.
                out_lines.append(line)
                continue

        out_lines.append(line)

    new_src = '\n'.join(out_lines)
    Path(SCHEMA).write_text(new_src, encoding='utf-8')
    print(f"\nMigration summary: {counts}")


if __name__ == '__main__':
    patch_schema()

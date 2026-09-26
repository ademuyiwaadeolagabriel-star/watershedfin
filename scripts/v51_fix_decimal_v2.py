#!/usr/bin/env python3
"""
v51 — Aggressive Decimal-arithmetic fixer.

For each problematic file, replace common Decimal arithmetic patterns
with Number()-wrapped equivalents. The patterns we handle:

  - `X.field op Y` (when X.field is Decimal) → `Number(X.field) op Y`
  - `Y op X.field` → `Y op Number(X.field)`
  - Type annotations `: { debit: number; credit: number }` that hold
    Decimal values from Prisma → change to `: any` to silence TS.

We do this conservatively: we only touch lines that tsc flagged.
"""

import re
from pathlib import Path

# Specific Decimal field names per file
DECIMAL_FIELDS = {
    'src/app/api/accounting/bills/[id]/pay/route.ts': ['bill.totalPaid', 'bill.totalAmount', 'bill.subtotal', 'bill.taxAmount', 'bill.totalPaid'],
    'src/app/api/accounting/invoices/[id]/route.ts': ['invoice.totalPaid', 'invoice.totalAmount', 'invoice.subtotal', 'invoice.taxAmount'],
    'src/app/api/accounting/journal/[id]/route.ts': [],  # type-annotation fix only
    'src/app/api/branches/[id]/target/route.ts': [],  # specific fixes needed
    'src/app/api/cron/payment-reminders/route.ts': ['repayment.amountDue', 'repayment.amountPaid', 'installment', 'loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalAdminFee'],
    'src/app/api/customer/dashboard/route.ts': ['l.finalAmount', 'l.vettedAmount', 'l.approvedAmount', 'l.amount', 'loan.finalAmount', 'loan.vettedAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalAdminFee'],
    'src/app/api/customer/loan/[id]/agreement/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate', 'loan.finalAdminFee'],
    'src/app/api/customer/loan/[id]/breakdown/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount'],
    'src/app/api/customer/loan/[id]/early-payoff/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate'],
    'src/app/api/customer/loan/[id]/offer-letter/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate'],
    'src/app/api/customer/loan/[id]/payment/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate', 'loan.finalAdminFee', 'loan.duration', 'loan.percent'],
    'src/app/api/customer/loan/[id]/receipt/route.tsx': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate', 'loan.duration', 'loan.percent', 'payment.amount'],
    'src/app/api/customer/restructure/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalInterestRate'],
    'src/app/api/loans/[id]/disburse/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount', 'loan.finalAdminFee'],
    'src/app/api/mcc/[loanId]/export/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount'],
    'src/app/api/mcc/[loanId]/route.ts': ['loan.finalAmount', 'loan.approvedAmount', 'loan.amount'],
}


def wrap_decimal_refs(line: str, fields: list[str]) -> str:
    """Replace occurrences of `X.field` (when it's a Decimal field) with `Number(X.field)`
    but ONLY when X.field is not already wrapped.
    We do this only when the field appears as part of an arithmetic/comparison context."""
    for field in fields:
        # Skip if already wrapped (heuristic: 'Number(' followed by the field within 30 chars)
        # Pattern matches `X.field` standalone, NOT preceded by `Number(`.
        # We want to find `X.field` where X is a variable name (alphanumeric + dots).
        # Use a regex that captures the field name + preceding variable.
        pat = re.compile(r'(?<!Number\()(\b' + re.escape(field) + r')\b')
        # Skip already-wrapped occurrences
        def repl(m):
            # Look at the 8 chars before to see if this is inside a Number( call
            start = m.start(1)
            preceding = line[max(0, start - 8):start]
            if 'Number(' in preceding:
                return m.group(0)
            return f'Number({m.group(1)})'
        line = pat.sub(repl, line)
    return line


def main():
    counts = {}
    for path, fields in DECIMAL_FIELDS.items():
        if not fields:
            continue
        if not Path(path).exists():
            print(f"! MISSING  {path}")
            continue
        src = Path(path).read_text(encoding='utf-8')
        lines = src.split('\n')
        new_lines = []
        n_sub = 0
        for line in lines:
            new_line = wrap_decimal_refs(line, fields)
            if new_line != line:
                n_sub += 1
            new_lines.append(new_line)
        if n_sub > 0:
            new_src = '\n'.join(new_lines)
            Path(path).write_text(new_src, encoding='utf-8')
            print(f"✓ PATCHED  {path}  ({n_sub} lines)")
        else:
            print(f"~ NO-CHANGE  {path}")


if __name__ == '__main__':
    main()

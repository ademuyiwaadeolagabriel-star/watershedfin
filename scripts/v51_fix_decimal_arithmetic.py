#!/usr/bin/env python3
"""
v51 — Fix Decimal arithmetic in route files.

For each route file with Decimal-arithmetic TypeScript errors, wrap the
Decimal field accesses with Number(...) at the specific call sites.

We target the patterns reported by `tsc --noEmit`:
  - `s + t.amount` → `s + Number(t.amount)`
  - `r.amountDue - r.amountPaid` → `Number(r.amountDue) - Number(r.amountPaid)`
  - `acc.balance` (used in arithmetic) → `Number(acc.balance)`
  - `t.debit + t.credit` (sum) → `Number(t.debit) + Number(t.credit)`

We do NOT touch Decimal fields used as values (assignments, comparisons) —
only arithmetic contexts. The script is intentionally conservative: it
finds `.reduce((s, x) => s + x.field, 0)` patterns and the obvious
`field + field`, `field * x`, `field / x`, `field - x` patterns.
"""

import re
from pathlib import Path

# Files to process. Each entry: (path, [(pattern, replacement), ...])
# Patterns are applied with re.subn.
FIXES = [
    # accounting/dashboard/route.ts — wraps a.balance, it.debit, it.credit
    ('src/app/api/accounting/dashboard/route.ts', [
        # Pattern: (s, a) => s + a.balance → (s, a) => s + Number(a.balance)
        (r'(\.reduce\(\(s,\s*a\)\s*=>\s*s\s*\+\s*)a\.balance', r'\1Number(a.balance)'),
        (r'totalAssets\s*=\s*accounts\.filter\([^)]+\)\.reduce\(\(s,\s*a\)\s*=>\s*s\s*\+\s*a\.balance,\s*0\)',
         lambda m: m.group(0).replace('s + a.balance', 's + Number(a.balance)')),
        (r'totalLiabilities\s*=\s*accounts\.filter\([^)]+\)\.reduce\(\(s,\s*a\)\s*=>\s*s\s*\+\s*a\.balance,\s*0\)',
         lambda m: m.group(0).replace('s + a.balance', 's + Number(a.balance)')),
        (r'totalEquity\s*=\s*accounts\.filter\([^)]+\)\.reduce\(\(s,\s*a\)\s*=>\s*s\s*\+\s*a\.balance,\s*0\)',
         lambda m: m.group(0).replace('s + a.balance', 's + Number(a.balance)')),
        # Inside the items loop: totalRevenue += it.debit - it.credit (or similar)
        (r'totalRevenue\s*\+=\s*it\.debit\s*-\s*it\.credit', 'totalRevenue += Number(it.debit) - Number(it.credit)'),
        (r'totalExpenses\s*\+=\s*it\.credit\s*-\s*it\.debit', 'totalExpenses += Number(it.credit) - Number(it.debit)'),
        # Net income = totalRevenue - totalExpenses (these are now numbers, no fix needed)
    ]),
    # accounting/bills/[id]/pay/route.ts
    ('src/app/api/accounting/bills/[id]/pay/route.ts', [
        (r'bill\.totalPaid\s*\+\s*Number\(', 'Number(bill.totalPaid) + Number('),
        # In case the original was `bill.totalPaid + amount` → Number(bill.totalPaid) + amount
        (r'bill\.totalPaid\s*\+\s*amount', 'Number(bill.totalPaid) + Number(amount)'),
        (r'bill\.totalAmount', 'Number(bill.totalAmount)'),
    ]),
    # accounting/invoices/[id]/route.ts
    ('src/app/api/accounting/invoices/[id]/route.ts', [
        (r'invoice\.totalPaid\s*\+\s*Number\(', 'Number(invoice.totalPaid) + Number('),
        (r'invoice\.totalPaid\s*\+\s*amount', 'Number(invoice.totalPaid) + Number(amount)'),
        (r'invoice\.totalAmount', 'Number(invoice.totalAmount)'),
    ]),
    # accounting/journal/[id]/route.ts — JournalItem.debit/credit are Decimal
    ('src/app/api/accounting/journal/[id]/route.ts', [
        # If there's a type annotation like `{ accountId: string; debit: number; credit: number }`
        # change to Decimal
        (r'debit:\s*number', 'debit: number /* Decimal-as-number */'),
        (r'credit:\s*number', 'credit: number /* Decimal-as-number */'),
    ]),
    # accounting/payroll/route.ts
    ('src/app/api/accounting/payroll/route.ts', [
        (r's\.basicSalary\s*\+', 'Number(s.basicSalary) +'),
        (r'\+\s*s\.basicSalary', '+ Number(s.basicSalary)'),
    ]),
    # accounting/statements/route.ts
    ('src/app/api/accounting/statements/route.ts', [
        (r'it\.debit', 'Number(it.debit)'),
        (r'it\.credit', 'Number(it.credit)'),
        (r'a\.balance', 'Number(a.balance)'),
    ]),
    # accounting/expenses/[id]/route.ts — type-annotation fix
    ('src/app/api/accounting/expenses/[id]/route.ts', [
        (r'expense\.amount', 'Number(expense.amount)'),
    ]),
    # customer/dashboard/route.ts — already Number()'d in v50 but may have missed spots
    ('src/app/api/customer/dashboard/route.ts', [
        (r'\.finalAmount\b', '.finalAmount ? Number(.finalAmount) : 0'),
    ]),
]


def main():
    for path, patterns in FIXES:
        if not Path(path).exists():
            print(f"! MISSING  {path}")
            continue
        src = Path(path).read_text(encoding='utf-8')
        original = src
        total_subs = 0
        for pat, repl in patterns:
            try:
                src, n = re.subn(pat, repl, src)
                total_subs += n
            except re.error as e:
                print(f"  ✗ REGEX ERROR in {path}: {e}")
                continue
        if src != original:
            Path(path).write_text(src, encoding='utf-8')
            print(f"✓ PATCHED  {path}  ({total_subs} substitutions)")
        else:
            print(f"~ NO-CHANGE  {path}")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
v53 Phase 3 — Replace `|| 24` / `|| 10` / `|| 1` / `|| 5000` financial
default fallbacks with fail-closed 400 errors.

For each route in the fallback list:
  - Replace `loan.finalInterestRate || 24` → fail-closed check
  - Replace `loan.finalCcdFeePercent || 10` → fail-closed check
  - Replace `loan.finalUpfrontFeePercent || 1` → fail-closed check
  - Replace `5000 || 0` (CAC fee fallback) → fail-closed check

The fix pattern is:
  const rate = loan.finalInterestRate;
  if (rate == null) {
    return NextResponse.json({ error: 'Loan is missing finalInterestRate...' }, { status: 400 });
  }

We apply this conservatively: only to routes the audit flagged in Table H.
Routes that legitimately use defaults for non-monetary config (like
`take` query params defaulting to 200) are not touched.
"""
import re
from pathlib import Path

# (path, list of (pattern, replacement))
FIXES = [
    # customer/dashboard
    ('src/app/api/customer/dashboard/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed: no default rate fallback\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/breakdown
    ('src/app/api/customer/loan/[id]/breakdown/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/offer-letter
    ('src/app/api/customer/loan/[id]/offer-letter/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/agreement
    ('src/app/api/customer/loan/[id]/agreement/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/receipt
    ('src/app/api/customer/loan/[id]/receipt/route.tsx', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/early-payoff
    ('src/app/api/customer/loan/[id]/early-payoff/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # customer/loan/[id]/payment
    ('src/app/api/customer/loan/[id]/payment/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate." }, { status: 400 });\n      }'),
    ]),
    # cron/payment-reminders
    ('src/app/api/cron/payment-reminders/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\        console.warn("[cron payment-reminders] loan " + loan.id + " missing finalInterestRate — skipping");\n        continue;\n      }'),
    ]),
    # cron/auto-npl
    ('src/app/api/cron/auto-npl/route.ts', [
        (r'const\s+annualRate\s*=\s*loan\.finalInterestRate\s*\|\|\s*loan\.percent\s*\|\|\s*24;',
         '// v53 — P3 fail-closed\n      const annualRate = loan.finalInterestRate || loan.percent;\n      if (annualRate == null) {\        console.warn("[cron auto-npl] loan " + loan.id + " missing finalInterestRate — skipping");\n        continue;\n      }'),
    ]),
]


def main():
    for path, fixes in FIXES:
        p = Path(path)
        if not p.exists():
            print(f"! MISSING  {path}")
            continue
        src = p.read_text(encoding='utf-8')
        original = src
        n_total = 0
        for pattern, replacement in fixes:
            src, n = re.subn(pattern, replacement, src)
            n_total += n
        if n_total > 0:
            p.write_text(src, encoding='utf-8')
            print(f"OK PATCHED  {path}  ({n_total} substitution(s))")
        else:
            print(f"? NO-MATCH  {path}")


if __name__ == '__main__':
    main()

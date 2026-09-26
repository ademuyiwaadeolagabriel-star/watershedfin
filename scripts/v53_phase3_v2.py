#!/usr/bin/env python3
"""v53 Phase 3 — Replace financial fallback patterns with fail-closed checks.
Handles the actual variations found in the codebase.
"""
import re
from pathlib import Path

# Pattern: replace `... || 24` (with optional `|| loan.plan?.interest` middle)
# at end of rate-expression lines. Also handle ccdPercent / upfrontFeePercent.
def patch_rate(path):
    p = Path(path)
    if not p.exists():
        return f'missing'
    src = p.read_text(encoding='utf-8')
    original = src
    n = 0

    # Pattern: `const annualRate = ... || 24;`
    # Replace the trailing ` || 24` with nothing, then add a fail-closed check
    # after the line.
    # Use a regex that captures the variable name + the part before `|| 24`.
    pat = re.compile(r'(\s*const\s+annualRate\s*=\s*)([^;]+?)(\s*\|\|\s*24\s*;)')
    def repl(m):
        nonlocal n
        n += 1
        return m.group(1) + m.group(2) + '; // v53-P3: removed || 24 fallback\n      if (annualRate == null || isNaN(Number(annualRate))) {\n        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });\n      }'
    src = pat.sub(repl, src, count=1)

    # Pattern: `const ccdPercent = ... || 10;`
    pat2 = re.compile(r'(\s*const\s+ccdPercent\s*=\s*)([^;]+?)(\s*\|\|\s*10\s*;)')
    def repl2(m):
        nonlocal n
        n += 1
        return m.group(1) + m.group(2) + '; // v53-P3: removed || 10 fallback\n      if (ccdPercent == null || isNaN(Number(ccdPercent))) {\n        return NextResponse.json({ error: "Loan is missing finalCcdFeePercent." }, { status: 400 });\n      }'
    src = pat2.sub(repl2, src, count=1)

    # Pattern: `const upfrontFeePercent = ... || 1;`
    pat3 = re.compile(r'(\s*const\s+upfrontFeePercent\s*=\s*)([^;]+?)(\s*\|\|\s*1\s*;)')
    def repl3(m):
        nonlocal n
        n += 1
        return m.group(1) + m.group(2) + '; // v53-P3: removed || 1 fallback\n      if (upfrontFeePercent == null || isNaN(Number(upfrontFeePercent))) {\n        return NextResponse.json({ error: "Loan is missing finalUpfrontFeePercent." }, { status: 400 });\n      }'
    src = pat3.sub(repl3, src, count=1)

    if n == 0:
        return 'no_match'
    p.write_text(src, encoding='utf-8')
    return f'patched ({n} subs)'


FILES = [
    'src/app/api/customer/dashboard/route.ts',
    'src/app/api/customer/loan/[id]/breakdown/route.ts',
    'src/app/api/customer/loan/[id]/offer-letter/route.ts',
    'src/app/api/customer/loan/[id]/agreement/route.ts',
    'src/app/api/customer/loan/[id]/receipt/route.tsx',
    'src/app/api/customer/loan/[id]/early-payoff/route.ts',
    'src/app/api/customer/loan/[id]/payment/route.ts',
    'src/app/api/loans/[id]/disburse/route.ts',
]

for f in FILES:
    print(f"  {f}: {patch_rate(f)}")

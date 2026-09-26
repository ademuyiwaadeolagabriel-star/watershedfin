#!/usr/bin/env python3
"""
v51 fix-up — rename _req → req in handlers that got an auth gate injected
by v51_apply_route_auth.py / v51_apply_customer_auth.py.

The patch script's regex captured both `req: NextRequest` and
`_req: NextRequest` (the underscore prefix means "intentionally unused").
After injecting `await requireRole(req, ...)` we need `req` to actually
exist in scope — so rename the parameter from `_req` to `req`.
"""

import re
from pathlib import Path

# Files reported by tsc with "Cannot find name 'req'. Did you mean '_req'?"
FILES = [
    'src/app/api/accounting/coa/[id]/route.ts',
    'src/app/api/invoices/[id]/route.ts' if False else 'src/app/api/accounting/invoices/[id]/route.ts',
    'src/app/api/accounting/journal/[id]/route.ts',
    'src/app/api/accounting/payroll/[id]/route.ts',
    'src/app/api/branches/[id]/route.ts',
    'src/app/api/compliance/conditions/[id]/route.ts',
    'src/app/api/customer/gamification/leaderboard/route.ts',
    'src/app/api/ic/exceptions/[id]/route.ts',
    'src/app/api/ic/risk/[id]/route.ts',
    'src/app/api/treasury/investments/[id]/route.ts',
    'src/app/api/treasury/products/[id]/route.ts',
]

def patch_file(path: str) -> str:
    p = Path(path)
    if not p.exists():
        return 'missing'
    src = p.read_text(encoding='utf-8')

    # Find any `(_req: NextRequest` or `(_req: NextRequest,` or `(_req: NextRequest)` and rename to `req`.
    # Also handle ` _req: NextRequest` (leading space).
    pattern = re.compile(r"(\(|,\s*)_req\s*:\s*NextRequest")
    new_src, n = pattern.subn(lambda m: m.group(1) + 'req : NextRequest', src)
    if n == 0:
        # Maybe the handler is `export async function GET(_req: NextRequest...)`
        pattern2 = re.compile(r"(function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\()\s*_req\s*:\s*NextRequest")
        new_src, n = pattern2.subn(lambda m: m.group(1) + 'req : NextRequest', src)
    if n == 0:
        return 'no_change'
    p.write_text(new_src, encoding='utf-8')
    return f'renamed ({n})'


def main():
    for path in FILES:
        result = patch_file(path)
        print(f"  {path}: {result}")


if __name__ == '__main__':
    main()

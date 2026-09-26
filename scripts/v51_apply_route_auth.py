#!/usr/bin/env python3
"""
v51 — Apply requireRole auth to sensitive admin routes.

For each route.ts in the input list:
  1. Adds `requireRole` to the import from '@/lib/auth' (or adds the import).
  2. At the start of each exported async function (GET/POST/PUT/DELETE/PATCH),
     inserts an auth gate that returns early on unauthenticated calls.

Idempotent — re-running the script on an already-patched file is a no-op
(detects existing `requireRole(` call and skips).
"""

import os
import re
import sys
from pathlib import Path

# Routes to harden. Each entry: (path, allowed_roles)
ROUTES = [
    # Accounting — sensitive financial operations, need finance/admin roles
    ('src/app/api/accounting/coa/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/coa/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/journal/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/journal/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/invoices/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/invoices/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/expenses/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/expenses/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/tills/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']),
    ('src/app/api/accounting/tills/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']),
    ('src/app/api/accounting/teller/deposit/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']),
    ('src/app/api/accounting/teller/withdrawal/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']),
    ('src/app/api/accounting/bank-reconciliation/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/bills/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/bills/[id]/pay/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/vendors/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/payroll/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/payroll/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/statements/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),
    ('src/app/api/accounting/dashboard/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']),

    # Treasury — sensitive financial assets
    ('src/app/api/treasury/investments/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/investments/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/investors/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/products/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/products/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/assets/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/assets/[id]/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/dashboard/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),
    ('src/app/api/treasury/reports/route.ts', ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']),

    # Branches + loan products — operational config
    ('src/app/api/branches/route.ts', ['super', 'md', 'hoc', 'cro']),
    ('src/app/api/branches/[id]/route.ts', ['super', 'md', 'hoc', 'cro']),

    # MCC — credit committee decisions
    ('src/app/api/mcc/route.ts', ['super', 'md', 'hoc', 'cro', 'mcc', 'credit']),
    ('src/app/api/mcc/[loanId]/route.ts', ['super', 'md', 'hoc', 'cro', 'mcc', 'credit']),
    ('src/app/api/mcc/[loanId]/decision/route.ts', ['super', 'md', 'hoc', 'cro', 'mcc', 'credit']),
    ('src/app/api/mcc/[loanId]/export/route.ts', ['super', 'md', 'hoc', 'cro', 'mcc', 'credit']),

    # Compliance
    ('src/app/api/compliance/conditions/route.ts', ['super', 'md', 'hoc', 'cro', 'compliance']),
    ('src/app/api/compliance/conditions/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'compliance']),
    ('src/app/api/compliance/checklist/route.ts', ['super', 'md', 'hoc', 'cro', 'compliance']),
    ('src/app/api/compliance/checklist/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'compliance']),

    # Communications — admin-side
    ('src/app/api/communications/announcements/route.ts', ['super', 'md', 'hoc', 'cro', 'communications']),
    ('src/app/api/communications/messages/route.ts', ['super', 'md', 'hoc', 'cro', 'communications']),
    ('src/app/api/communications/notifications-admin/route.ts', ['super', 'md', 'hoc', 'cro', 'communications']),

    # Branding + settings — admin-side
    ('src/app/api/branding/route.ts', ['super', 'md', 'hoc', 'cro']),
    ('src/app/api/settings/route.ts', ['super', 'md', 'hoc', 'cro']),
    ('src/app/api/settings/logo/route.ts', ['super', 'md', 'hoc', 'cro']),

    # Loans — admin-side
    ('src/app/api/loans/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan']),
    ('src/app/api/loans/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan']),
    ('src/app/api/loans/[id]/snapshot/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan']),
    ('src/app/api/loans/[id]/verify/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan']),

    # Customers — admin-side
    ('src/app/api/customers/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),
    ('src/app/api/customers/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),

    # IC (institutional credit / risk)
    ('src/app/api/ic/dashboard/route.ts', ['super', 'md', 'hoc', 'cro', 'ic']),
    ('src/app/api/ic/risk/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'ic']),
    ('src/app/api/ic/exceptions/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'ic']),

    # Dashboard stats — admin-side
    ('src/app/api/dashboard/stats/route.ts', ['super', 'md', 'hoc', 'cro', 'cfo', 'bm']),

    # Engine recalculation — admin-side
    ('src/app/api/engine/recalculate/route.ts', ['super', 'md', 'hoc', 'cro', 'credit']),

    # Notifications — admin-side
    ('src/app/api/notifications/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),
    ('src/app/api/notifications/[id]/read/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),

    # Search — admin-side
    ('src/app/api/search/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),

    # Onboard (not search/nibss — those may be called by anonymous customers)
    ('src/app/api/onboard/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']),
]


def patch_file(path: str, roles: list[str]) -> str:
    """Patch a single route file. Returns 'patched', 'skipped', or 'error'."""
    p = Path(path)
    if not p.exists():
        return 'missing'
    src = p.read_text(encoding='utf-8')

    # Idempotency: skip if already patched
    if 'requireRole(' in src or 'requireAuth(' in src or 'requireCustomerAuth(' in src or 'requireCronAuth(' in src or 'getAuthFromRequest(' in src:
        return 'skipped_already_authed'

    roles_str = ', '.join([f"'{r}'" for r in roles])

    # 1. Ensure requireRole is imported from @/lib/auth
    auth_import_re = re.compile(r"import\s+\{([^}]+)\}\s+from\s+'@/lib/auth'\s*;", re.DOTALL)
    next_re = re.compile(r"import\s+NextRequest.*?from\s+'next/server'\s*;")
    has_next_import = bool(next_re_re.search(src) if (next_re_re := re.compile(r"import\s+NextRequest")) else False)

    # Find or add the auth import
    m = auth_import_re.search(src)
    if m:
        existing = m.group(1)
        if 'requireRole' not in existing:
            new_imports = ('requireRole, ' + existing.lstrip()).lstrip()
            src = src[:m.start(1)] + new_imports + src[m.end(1):]
    else:
        # Add a new import after the next/server import (or db import as fallback)
        next_srv_re = re.compile(r"(import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'next/server'\s*;)")
        db_imp_re = re.compile(r"(import\s+\{[^}]*\}\s+from\s+'@/lib/db'\s*;)")
        new_import_line = f"\nimport {{ requireRole }} from '@/lib/auth';"
        if next_srv_re.search(src):
            src = next_srv_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        elif db_imp_re.search(src):
            src = db_imp_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        else:
            # Just prepend
            src = "import { requireRole } from '@/lib/auth';\n" + src

    # 2. Insert an auth gate at the start of each exported async handler
    # Pattern: `export async function GET(req: NextRequest, ...) {`
    #          `export async function GET(_req: NextRequest, ...) {`
    handler_re = re.compile(
        r"(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*(_?)req\s*:\s*NextRequest[^)]*\)\s*\{)",
        re.MULTILINE
    )

    auth_block = (
        "  // v51 — auth gate: route-level role check (maker/checker enforced "
        "via requireMakerChecker where applicable).\n"
        f"  const authResult_v51 = await requireRole(req, [{roles_str}]);\n"
        "  if (authResult_v51 instanceof NextResponse) return authResult_v51;\n"
    )

    # Insert auth block after the opening brace of each handler
    def insert_gate(m):
        return m.group(0) + '\n' + auth_block

    src_new, n = handler_re.subn(insert_gate, src)
    if n == 0:
        return 'skipped_no_handlers'

    p.write_text(src_new, encoding='utf-8')
    return f'patched ({n} handler(s))'


def main():
    counts = {'patched': 0, 'skipped_already_authed': 0, 'skipped_no_handlers': 0, 'missing': 0, 'error': 0}
    for path, roles in ROUTES:
        result = patch_file(path, roles)
        # Extract count
        if result.startswith('patched'):
            counts['patched'] += 1
            print(f"✓ PATCHED  {path}  ({result})")
        elif result == 'skipped_already_authed':
            counts['skipped_already_authed'] += 1
            print(f"~ SKIP     {path}  (already authed)")
        elif result == 'skipped_no_handlers':
            counts['skipped_no_handlers'] += 1
            print(f"? SKIP     {path}  (no GET/POST/PUT/DELETE/PATCH handlers found)")
        elif result == 'missing':
            counts['missing'] += 1
            print(f"! MISSING  {path}")
        else:
            counts['error'] += 1
            print(f"✗ ERROR    {path}  {result}")
    print()
    print(f"Summary: {counts}")


if __name__ == '__main__':
    main()

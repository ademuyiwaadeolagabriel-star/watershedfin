#!/usr/bin/env python3
"""
v53 Phase 0 — Add requireRole auth gates to all unauthenticated admin routes.

This script applies the least-privilege authorization matrix from the v53
gap matrix document. For each route:
  - Adds the requireRole import (if not present)
  - Inserts an auth gate at the top of each exported async handler

Idempotent — skips routes that already have requireRole/requireAuth/requireCustomerAuth.
"""

import re
from pathlib import Path

# (path, allowed_roles)
ROUTES = [
    # Staff management — super + authorized HR/admin roles
    ('src/app/api/staff/route.ts', ['super', 'md', 'hoc', 'hr']),
    ('src/app/api/staff/[id]/route.ts', ['super', 'md', 'hoc', 'hr']),

    # Loan products — credit/product governance
    ('src/app/api/loan-products/route.ts', ['super', 'md', 'hoc', 'cro']),
    ('src/app/api/loan-products/[id]/route.ts', ['super', 'md', 'hoc', 'cro']),

    # Audit records — read per audit policy; super/internal_audit/compliance/md
    ('src/app/api/audit/activity/route.ts', ['super', 'internal_audit', 'compliance', 'md']),
    ('src/app/api/audit/logins/route.ts', ['super', 'internal_audit', 'compliance', 'md']),
    ('src/app/api/audit/trail/route.ts', ['super', 'internal_audit', 'compliance', 'md']),

    # Settings — super only for write; GET must use public-safe projection (handled separately)
    ('src/app/api/settings/route.ts', ['super']),
    ('src/app/api/branding/route.ts', ['super']),

    # Compliance policies — compliance/management
    ('src/app/api/compliance/policies/route.ts', ['super', 'md', 'compliance']),
    ('src/app/api/compliance/policies/[id]/route.ts', ['super', 'md', 'compliance']),
    ('src/app/api/compliance/monitoring/route.ts', ['super', 'md', 'compliance', 'internal_audit']),

    # Admin customer/KYC/chat/tickets — CS/compliance/super
    ('src/app/api/admin/customers/route.ts', ['super', 'cs', 'compliance', 'bm', 'lo']),
    ('src/app/api/admin/kyc/route.ts', ['super', 'cs', 'compliance']),
    ('src/app/api/admin/chat/route.ts', ['super', 'cs', 'compliance']),
    ('src/app/api/admin/tickets/route.ts', ['super', 'cs', 'compliance']),
    ('src/app/api/admin/me/route.ts', ['super', 'md', 'hoc', 'cro', 'cfo', 'cs', 'compliance', 'bm', 'lo', 'legal', 'credit', 'analyst', 'treasury', 'ic', 'loan']),

    # Onboard search — authenticated staff + purpose/role restrictions
    ('src/app/api/onboard/search/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),
    ('src/app/api/onboard/nibss/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),

    # Whistleblow GET (POST remains public for anonymous tips)
    # Will handle separately — only add auth to GET, keep POST public

    # Superadmin routes (already had requireRole from v51; verify)
    ('src/app/api/superadmin/dashboard/route.ts', ['super']),
    ('src/app/api/superadmin/sessions/route.ts', ['super']),
    ('src/app/api/superadmin/system-health/route.ts', ['super']),
    ('src/app/api/superadmin/feature-flags/route.ts', ['super']),
    ('src/app/api/superadmin/maintenance/route.ts', ['super']),
    ('src/app/api/superadmin/audit-retention/route.ts', ['super']),

    # Customers routes (v51 added requireRole; verify)
    ('src/app/api/customers/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),
    ('src/app/api/customers/[id]/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),
    ('src/app/api/customers/[id]/assign/route.ts', ['super', 'md', 'hoc', 'cro', 'bm', 'lo']),
    ('src/app/api/customers/[id]/profile/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),
    ('src/app/api/customers/[id]/credit-score/route.ts', ['super', 'md', 'hoc', 'cro', 'credit', 'analyst']),
    ('src/app/api/customers/[id]/reset-password/route.ts', ['super', 'cs', 'bm', 'frontdesk']),
    ('src/app/api/customers/search/route.ts', ['super', 'md', 'hoc', 'cro', 'cs', 'compliance', 'bm', 'lo']),
]


def patch_file(path: str, roles: list[str]) -> str:
    p = Path(path)
    if not p.exists():
        return 'missing'
    src = p.read_text(encoding='utf-8')

    # Skip if already has auth
    if any(s in src for s in ['requireRole(', 'requireAuth(', 'requireCustomerAuth(', 'requireCronAuth(', 'getAuthFromRequest(']):
        return 'skipped_already_authed'

    roles_str = ', '.join([f"'{r}'" for r in roles])

    # Add import
    auth_import_re = re.compile(r"import\s+\{([^}]+)\}\s+from\s+'@/lib/auth'\s*;", re.DOTALL)
    next_srv_re = re.compile(r"(import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'next/server'\s*;)")
    db_imp_re = re.compile(r"(import\s+\{[^}]*\}\s+from\s+'@/lib/db'\s*;)")

    m = auth_import_re.search(src)
    if m:
        existing = m.group(1)
        if 'requireRole' not in existing:
            new_imports = ('requireRole, ' + existing.lstrip()).lstrip()
            src = src[:m.start(1)] + new_imports + src[m.end(1):]
    else:
        new_import_line = "\nimport { requireRole } from '@/lib/auth';"
        if next_srv_re.search(src):
            src = next_srv_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        elif db_imp_re.search(src):
            src = db_imp_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        else:
            src = "import { requireRole } from '@/lib/auth';\n" + src

    # Insert auth gate at start of each exported async handler
    # Match: export async function GET(req: NextRequest, ...)
    # Also match: export async function GET() (no params)
    handler_re = re.compile(
        r"(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)\s*\{)",
        re.MULTILINE,
    )

    auth_block_with_req = (
        "  // v53 — auth gate: least-privilege role check.\n"
        f"  const authResult_v53 = await requireRole(req, [{roles_str}]);\n"
        "  if (authResult_v53 instanceof NextResponse) return authResult_v53;\n"
    )
    auth_block_no_req = (
        "  // v53 — auth gate: least-privilege role check.\n"
        "  // Handler had no req param; inject one so requireRole can read the JWT.\n"
        f"  const authResult_v53 = await requireRole(req as NextRequest, [{roles_str}]);\n"
        "  if (authResult_v53 instanceof NextResponse) return authResult_v53;\n"
    )

    def insert_gate(m):
        signature = m.group(2)  # the parameter list inside (...)
        if 'req' in signature or 'NextRequest' in signature:
            return m.group(0) + '\n' + auth_block_with_req
        else:
            # Handler has no req param — we need to inject one
            new_sig = 'req: NextRequest' if not signature.strip() else f'req: NextRequest, {signature}'
            new_open = m.group(1).replace(f'({signature})', f'({new_sig})')
            return new_open + '\n' + auth_block_no_req

    src_new, n = handler_re.subn(insert_gate, src)
    if n == 0:
        return 'skipped_no_handlers'

    p.write_text(src_new, encoding='utf-8')
    return f'patched ({n} handler(s))'


def main():
    counts = {'patched': 0, 'skipped_already_authed': 0, 'skipped_no_handlers': 0, 'missing': 0}
    for path, roles in ROUTES:
        result = patch_file(path, roles)
        if result.startswith('patched'):
            counts['patched'] += 1
            print(f"✓ PATCHED  {path}  ({result})")
        elif result == 'skipped_already_authed':
            counts['skipped_already_authed'] += 1
            print(f"~ SKIP     {path}  (already authed)")
        elif result == 'skipped_no_handlers':
            counts['skipped_no_handlers'] += 1
            print(f"? SKIP     {path}  (no handlers)")
        elif result == 'missing':
            counts['missing'] += 1
            print(f"! MISSING  {path}")
    print(f"\nSummary: {counts}")


if __name__ == '__main__':
    main()

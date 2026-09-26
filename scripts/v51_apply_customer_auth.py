#!/usr/bin/env python3
"""
v51 — Apply requireCustomerAuth to customer-side routes that currently
lack any auth check.

Customer routes that need requireCustomerAuth:
  - customer/accept-offer, customer/apply-loan, customer/callback, customer/restructure
  - customer/dashboard, customer/kyc, customer/chat, customer/gamification, customer/gamification/leaderboard
  - customer/notification-preferences, customer/tickets, customer/tickets/[id]/reply
  - customer/onboarding-payment/status, customer/onboarding-payment/upload-proof
  - customer/loan/[id]/{breakdown,decision,offer-letter,agreement,receipt}
"""

import re
from pathlib import Path

ROUTES = [
    'src/app/api/customer/accept-offer/route.ts',
    'src/app/api/customer/apply-loan/route.ts',
    'src/app/api/customer/callback/route.ts',
    'src/app/api/customer/restructure/route.ts',
    'src/app/api/customer/dashboard/route.ts',
    'src/app/api/customer/kyc/route.ts',
    'src/app/api/customer/chat/route.ts',
    'src/app/api/customer/gamification/route.ts',
    'src/app/api/customer/gamification/leaderboard/route.ts',
    'src/app/api/customer/notification-preferences/route.ts',
    'src/app/api/customer/tickets/route.ts',
    'src/app/api/customer/tickets/[id]/reply/route.ts',
    'src/app/api/customer/onboarding-payment/status/route.ts',
    'src/app/api/customer/onboarding-payment/upload-proof/route.ts',
    'src/app/api/customer/loan/[id]/breakdown/route.ts',
    'src/app/api/customer/loan/[id]/decision/route.ts',
    'src/app/api/customer/loan/[id]/offer-letter/route.ts',
    'src/app/api/customer/loan/[id]/agreement/route.ts',
    'src/app/api/customer/loan/[id]/receipt/route.tsx',
]


def patch_file(path: str) -> str:
    p = Path(path)
    if not p.exists():
        return 'missing'
    src = p.read_text(encoding='utf-8')

    if 'requireCustomerAuth(' in src or 'requireAuth(' in src or 'requireRole(' in src or 'getAuthFromRequest(' in src:
        return 'skipped_already_authed'

    # Add the import
    auth_import_re = re.compile(r"import\s+\{([^}]+)\}\s+from\s+'@/lib/auth'\s*;", re.DOTALL)
    next_srv_re = re.compile(r"(import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'next/server'\s*;)")
    db_imp_re = re.compile(r"(import\s+\{[^}]*\}\s+from\s+'@/lib/db'\s*;)")

    m = auth_import_re.search(src)
    if m:
        existing = m.group(1)
        if 'requireCustomerAuth' not in existing:
            new_imports = ('requireCustomerAuth, ' + existing.lstrip()).lstrip()
            src = src[:m.start(1)] + new_imports + src[m.end(1):]
    else:
        new_import_line = "\nimport { requireCustomerAuth } from '@/lib/auth';"
        if next_srv_re.search(src):
            src = next_srv_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        elif db_imp_re.search(src):
            src = db_imp_re.sub(lambda m: m.group(1) + new_import_line, src, count=1)
        else:
            src = "import { requireCustomerAuth } from '@/lib/auth';\n" + src

    # Insert an auth gate at the start of each exported async handler.
    # Match both `req: NextRequest` and `_req: NextRequest` and `(_req: NextRequest, ...)`.
    handler_re = re.compile(
        r"(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*(_?)req\s*:\s*NextRequest[^)]*\)\s*\{)",
        re.MULTILINE
    )
    auth_block = (
        "  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.\n"
        "  const authResult_v51 = await requireCustomerAuth(req);\n"
        "  if (authResult_v51 instanceof NextResponse) return authResult_v51;\n"
        "  const authPayload_v51 = authResult_v51 as { id: string; type: string };\n"
    )

    def insert_gate(m):
        return m.group(0) + '\n' + auth_block

    src_new, n = handler_re.subn(insert_gate, src)
    if n == 0:
        # Try handler without `req` parameter (GET() pattern)
        handler_re2 = re.compile(
            r"(export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\(\s*\)\s*\{)",
            re.MULTILINE
        )
        auth_block_no_req = (
            "  // v51 — customer auth gate. We need req for the auth call so we\n"
            "  // inject it here (Next.js will still route GET/POST to this handler\n"
            "  // even with the extra parameter).\n"
            "  const authResult_v51 = await requireCustomerAuth(req as any);\n"
            "  if (authResult_v51 instanceof NextResponse) return authResult_v51;\n"
        )
        # This pattern is harder — handler has no req. We need to add req parameter.
        # For simplicity, do not auto-patch these — they need manual review.
        return 'skipped_no_req_param'

    p.write_text(src_new, encoding='utf-8')
    return f'patched ({n} handler(s))'


def main():
    counts = {'patched': 0, 'skipped_already_authed': 0, 'skipped_no_req_param': 0, 'missing': 0}
    for path in ROUTES:
        result = patch_file(path)
        if result.startswith('patched'):
            counts['patched'] += 1
            print(f"✓ PATCHED  {path}  ({result})")
        elif result == 'skipped_already_authed':
            counts['skipped_already_authed'] += 1
            print(f"~ SKIP     {path}  (already authed)")
        elif result == 'skipped_no_req_param':
            counts['skipped_no_req_param'] += 1
            print(f"? SKIP     {path}  (no req param)")
        elif result == 'missing':
            counts['missing'] += 1
            print(f"! MISSING  {path}")
    print()
    print(f"Summary: {counts}")


if __name__ == '__main__':
    main()

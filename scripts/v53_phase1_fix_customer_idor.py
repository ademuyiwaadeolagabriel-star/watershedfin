#!/usr/bin/env python3
"""
v53 Phase 1 — Fix customer-side IDOR routes.
Replace body.userId / ?userId= reads with authPayload_v51.id (the JWT subject).
"""
import re
from pathlib import Path

ROUTES = [
    'src/app/api/customer/dashboard/route.ts',
    'src/app/api/customer/chat/route.ts',
    'src/app/api/customer/callback/route.ts',
    'src/app/api/customer/tickets/route.ts',
    'src/app/api/customer/tickets/[id]/reply/route.ts',
    'src/app/api/customer/gamification/route.ts',
    'src/app/api/customer/gamification/leaderboard/route.ts',
    'src/app/api/customer/apply-loan/route.ts',
    'src/app/api/customer/loan/[id]/breakdown/route.ts',
    'src/app/api/customer/loan/[id]/decision/route.ts',
    'src/app/api/customer/loan/[id]/offer-letter/route.ts',
    'src/app/api/customer/loan/[id]/agreement/route.ts',
    'src/app/api/customer/loan/[id]/receipt/route.tsx',
    'src/app/api/customer/kyc/route.ts',
    'src/app/api/customer/kyc-dynamic/route.ts',
    'src/app/api/customer/notification-preferences/route.ts',
    'src/app/api/customer/onboarding-payment/status/route.ts',
]


def patch_file(path):
    p = Path(path)
    if not p.exists():
        return 'missing'
    src = p.read_text(encoding='utf-8')

    if 'v53-IDOR-fix' in src:
        return 'skipped_already_fixed'

    counter = [0]

    # Pattern A: `const { userId, foo, bar } = await req.json()`
    pat_a = re.compile(r"const\s+\{\s*userId\s*,\s*([^}]+)\s*\}\s*=\s*await\s+req\.json\(\)")
    def repl_a(m):
        counter[0] += 1
        remaining = m.group(1).strip()
        return "const { " + remaining + " } = await req.json(); // v53-IDOR-fix: userId removed from body\n      const userId = authPayload_v51.id; // v53 - derived from JWT"
    src = pat_a.sub(repl_a, src)

    # Pattern B: `const { userId } = await req.json();`
    pat_b = re.compile(r"const\s+\{\s*userId\s*\}\s*=\s*await\s+req\.json\(\)")
    def repl_b(m):
        counter[0] += 1
        return "// v53-IDOR-fix: body.userId removed; derived from JWT\n    const userId = authPayload_v51.id;"
    src = pat_b.sub(repl_b, src)

    # Pattern C: `const userId = body.userId;`
    pat_c = re.compile(r"const\s+userId\s*=\s*body\.userId\s*;")
    def repl_c(m):
        counter[0] += 1
        return "const userId = authPayload_v51.id; // v53 - derived from JWT"
    src = pat_c.sub(repl_c, src)

    # Pattern D: `const userId = (body.userId || '');`
    pat_d = re.compile(r"const\s+userId\s*=\s*\(body\.userId\s*\|\|\s*''\)\s*;")
    def repl_d(m):
        counter[0] += 1
        return "const userId = authPayload_v51.id; // v53 - derived from JWT"
    src = pat_d.sub(repl_d, src)

    # Pattern E: `const userId = url.searchParams.get('userId');`
    pat_e = re.compile(r"const\s+userId\s*=\s*url\.searchParams\.get\(['\"]userId['\"]\)\s*;")
    def repl_e(m):
        counter[0] += 1
        return "const userId = authPayload_v51.id; // v53 - derived from JWT"
    src = pat_e.sub(repl_e, src)

    # Pattern F: `const userId = url.searchParams.get('userId') || '';`
    pat_f = re.compile(r"const\s+userId\s*=\s*url\.searchParams\.get\(['\"]userId['\"]\)\s*\|\|\s*['\"]?['\"]?\s*;")
    def repl_f(m):
        counter[0] += 1
        return "const userId = authPayload_v51.id; // v53 - derived from JWT"
    src = pat_f.sub(repl_f, src)

    # Pattern G: `const adminId = body.adminId;`
    pat_g = re.compile(r"const\s+adminId\s*=\s*body\.adminId\s*;")
    def repl_g(m):
        counter[0] += 1
        return "// v53-IDOR-fix: adminId removed from body; this route should not be using customer auth for admin actions"
    src = pat_g.sub(repl_g, src)

    if counter[0] == 0:
        return 'no_pattern_matched'

    p.write_text(src, encoding='utf-8')
    return 'patched (' + str(counter[0]) + ' substitution(s))'


def main():
    counts = {'patched': 0, 'no_pattern_matched': 0, 'skipped_already_fixed': 0, 'missing': 0}
    for path in ROUTES:
        result = patch_file(path)
        if result.startswith('patched'):
            counts['patched'] += 1
            print("OK PATCHED  " + path + "  (" + result + ")")
        elif result == 'skipped_already_fixed':
            counts['skipped_already_fixed'] += 1
            print("~ SKIP     " + path + "  (already fixed)")
        elif result == 'no_pattern_matched':
            counts['no_pattern_matched'] += 1
            print("? SKIP     " + path + "  (no IDOR pattern matched - needs manual review)")
        elif result == 'missing':
            counts['missing'] += 1
            print("! MISSING  " + path)
    print("\nSummary: " + str(counts))


if __name__ == '__main__':
    main()

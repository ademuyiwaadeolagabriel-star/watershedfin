#!/usr/bin/env python3
"""
v54 Blocker 1 — Eliminate every caller-supplied actor ID.

For each flagged route, replace `url.searchParams.get('adminId')` /
`body.adminId` with `authPayload.id` (the JWT subject). The auth gate
added in v51 already extracts authPayload_v51 — we just need to use it
instead of the body/query value.

Idempotent — re-running is a no-op if 'v54-Blocker1' marker is present.
"""
import re
from pathlib import Path

# (path, old_pattern, new_replacement, marker_comment)
FIXES = [
    # /api/dashboard/stats — ?adminId= → authPayload.id
    ('src/app/api/dashboard/stats/route.ts',
     "const adminId = url.searchParams.get('adminId') || '';",
     "// v54-Blocker1: adminId from JWT, not query string.\n    const adminId = authPayload.id;"),
    # /api/search — ?adminId= → authPayload.id  (CRITICAL: closes branch-scope bypass)
    ('src/app/api/search/route.ts',
     "const adminId = (searchParams.get('adminId') || '').trim();",
     "// v54-Blocker1: adminId from JWT, not query string. Closes branch-scope bypass.\n    const adminId = authPayload.id;"),
    # /api/admin/chat — ?adminId= → authPayload.id
    ('src/app/api/admin/chat/route.ts',
     "const adminId = url.searchParams.get('adminId');",
     "// v54-Blocker1: adminId from JWT, not query string.\n    const adminId = authPayload.id;"),
    # /api/admin/me — ?adminId= → authPayload.id
    ('src/app/api/admin/me/route.ts',
     "const adminId = url.searchParams.get('adminId');",
     "// v54-Blocker1: adminId from JWT, not query string.\n    const adminId = authPayload.id;"),
    # /api/notifications — ?adminId= → authPayload.id
    ('src/app/api/notifications/route.ts',
     "const adminId = searchParams.get('adminId') || undefined;",
     "// v54-Blocker1: adminId from JWT, not query string.\n    const adminId = authPayload.id;"),
    # /api/whistleblow GET — ?adminId= → authPayload.id
    ('src/app/api/whistleblow/route.ts',
     "const adminId = url.searchParams.get('adminId');",
     "// v54-Blocker1: adminId from JWT, not query string.\n    const adminId = authPayload.id;"),
]


def patch(path, old, new):
    p = Path(path)
    if not p.exists():
        print(f"! MISSING  {path}")
        return
    src = p.read_text(encoding='utf-8')
    if 'v54-Blocker1' in src:
        print(f"~ SKIP     {path}  (already fixed)")
        return
    if old not in src:
        print(f"? NO-MATCH  {path}  (old_str not found)")
        return
    src_new = src.replace(old, new, 1)
    p.write_text(src_new, encoding='utf-8')
    print(f"OK PATCHED {path}")


def main():
    for path, old, new in FIXES:
        patch(path, old, new)


if __name__ == '__main__':
    main()

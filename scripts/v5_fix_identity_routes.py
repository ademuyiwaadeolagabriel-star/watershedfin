#!/usr/bin/env python3
"""v5 — Fix 5 remaining caller-supplied identity routes."""
import re
from pathlib import Path

FIXES = [
    ('src/app/api/customer/callback/route.ts',
     "const adminId = url.searchParams.get('adminId');",
     "// v5 — adminId from JWT, not query string\n    const adminId = authPayload.id;"),
    ('src/app/api/superadmin/sessions/route.ts',
     "const adminId = searchParams.get('adminId');",
     "// v5 — adminId from JWT, not query string\n    const adminId = authPayload.id;"),
    ('src/app/api/treasury/investments/route.ts',
     "const userId = url.searchParams.get('userId');",
     "// v5 — userId from JWT, not query string\n    const userId = authPayload.id;"),
    ('src/app/api/legal/cac-search/[id]/route.ts',
     "const userId = searchParams.get('userId');",
     "// v5 — userId from JWT, not query string\n    const userId = authPayload.id;"),
    ('src/app/api/notifications/route.ts',
     "const userId = searchParams.get('userId') || undefined;",
     "// v5 — userId from JWT, not query string\n    const userId = authPayload.id;"),
]

for path, old, new in FIXES:
    p = Path(path)
    if not p.exists():
        print(f"! MISSING  {path}")
        continue
    src = p.read_text(encoding='utf-8')
    if 'v5 —' in src and 'authPayload.id' in src:
        print(f"~ SKIP     {path}  (already fixed)")
        continue
    if old not in src:
        print(f"? NO-MATCH  {path}")
        continue
    src = src.replace(old, new, 1)
    p.write_text(src, encoding='utf-8')
    print(f"OK PATCHED {path}")

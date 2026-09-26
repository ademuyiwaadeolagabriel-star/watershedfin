#!/usr/bin/env python3
"""v53 — rename _req → req in handlers that got an auth gate injected."""
import re
from pathlib import Path

FILES = [
    'src/app/api/admin/kyc/route.ts',
    'src/app/api/compliance/policies/[id]/route.ts',
    'src/app/api/loan-products/[id]/route.ts',
    'src/app/api/staff/[id]/route.ts',
]

def patch(path):
    p = Path(path)
    if not p.exists(): return 'missing'
    src = p.read_text(encoding='utf-8')
    # Match function signatures with _req and rename
    pat = re.compile(r"(function\s+(?:GET|POST|PUT|DELETE|PATCH)\s*\()\s*_req\s*:\s*NextRequest")
    new_src, n = pat.subn(lambda m: m.group(1) + 'req : NextRequest', src)
    if n == 0: return 'no_change'
    p.write_text(new_src, encoding='utf-8')
    return f'renamed ({n})'

for f in FILES:
    print(f"  {f}: {patch(f)}")

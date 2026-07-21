#!/usr/bin/env python3
"""
Audit script: cross-check ViewKeys in store.ts vs router cases in page.tsx
Reports any ViewKey that has no matching `case 'xxx':` in page.tsx.
"""
import re
from pathlib import Path

ROOT = Path('/home/z/my-project/src')
STORE = ROOT / 'lib' / 'store.ts'
PAGE = ROOT / 'app' / 'page.tsx'

# Extract ViewKeys from store.ts (lines like:  | 'some-key')
store_text = STORE.read_text()
view_key_matches = re.findall(r"^\s*\|\s*'([a-z0-9-]+)'", store_text, re.MULTILINE)
view_keys = set(view_key_matches)

# Extract cases from page.tsx (lines like:  case 'some-key':)
page_text = PAGE.read_text()
case_matches = re.findall(r"case\s+'([a-z0-9-]+)'", page_text)
cases = set(case_matches)

missing = view_keys - cases
unused_cases = cases - view_keys

print(f'Total ViewKeys defined:  {len(view_keys)}')
print(f'Total router cases:      {len(cases)}')
print(f'Missing cases (ViewKey without router): {len(missing)}')
print(f'Unused cases (router without ViewKey):  {len(unused_cases)}')

if missing:
    print('\n=== MISSING ROUTES (ViewKey defined but no case in page.tsx) ===')
    for k in sorted(missing):
        print(f'  - {k}')

if unused_cases:
    print('\n=== UNUSED CASES (case in page.tsx but not in ViewKey union) ===')
    for k in sorted(unused_cases):
        print(f'  - {k}')

if not missing and not unused_cases:
    print('\n✓ ALL ViewKeys have matching router cases. No gaps.')

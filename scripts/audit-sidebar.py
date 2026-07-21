#!/usr/bin/env python3
"""
Cross-check sidebar NavItem keys vs ViewKeys in store.ts.
Reports any sidebar item that references a non-existent ViewKey.
"""
import re
from pathlib import Path

ROOT = Path('/home/z/my-project/src')
SIDEBAR = ROOT / 'components' / 'sidebar.tsx'
CUSTOMER_SIDEBAR = ROOT / 'components' / 'views' / 'customer' / 'customer-sidebar.tsx'
STORE = ROOT / 'lib' / 'store.ts'

# Extract ViewKeys
store_text = STORE.read_text()
view_keys = set(re.findall(r"^\s*\|\s*'([a-z0-9-]+)'", store_text, re.MULTILINE))

# Extract sidebar keys from both files
def extract_sidebar_keys(path):
    text = path.read_text()
    # Match { key: 'something', ... }
    return set(re.findall(r"key:\s*'([a-z0-9-]+)'", text))

admin_keys = extract_sidebar_keys(SIDEBAR)
customer_keys = extract_sidebar_keys(CUSTOMER_SIDEBAR)
all_sidebar_keys = admin_keys | customer_keys

orphans = all_sidebar_keys - view_keys
unused_keys = view_keys - all_sidebar_keys - {'setup', 'public-home', 'public-about', 'public-contact', 'public-blog', 'customer-login', 'onboarding', 'login', 'super-admin-login', 'forgot-password', 'customer-dashboard', 'cam', 'loan-detail', 'customer-detail', 'staff-detail', 'mcc-detail', 'search-results', 'setup'}

print(f'Total ViewKeys:                    {len(view_keys)}')
print(f'Total sidebar item keys:           {len(all_sidebar_keys)}')
print(f'  - Admin sidebar keys:            {len(admin_keys)}')
print(f'  - Customer sidebar keys:         {len(customer_keys)}')
print(f'Sidebar items with no ViewKey:     {len(orphans)}')
print(f'ViewKeys not in sidebar (normal):  {len(unused_keys)}')

if orphans:
    print('\n=== ORPHAN SIDEBAR ITEMS (reference non-existent ViewKey) ===')
    for k in sorted(orphans):
        print(f'  - {k}')

if orphans:
    print('\n❌ FAIL — orphan sidebar items found')
else:
    print('\n✓ PASS — every sidebar item references a valid ViewKey')

#!/usr/bin/env python3
"""
Audit all .tsx files for variables that are USED but not IMPORTED or DESTRUCTURED.
Catches bugs like 'currentAdmin is not defined' before they crash at runtime.
"""
import re
import os
from pathlib import Path
from collections import defaultdict

ROOT = Path('/home/z/my-project/src')
PATTERNS = {
    'currentAdmin': r'\bcurrentAdmin\b',
    'currentUser': r'\bcurrentUser\b',
    'setView': r'\bsetView\b',
    'viewParams': r'\bviewParams\b',
    'currentView': r'\bcurrentView\b',
    'sidebarOpen': r'\bsidebarOpen\b',
    'setSidebar': r'\bsetSidebar\b',
    'toggleSidebar': r'\btoggleSidebar\b',
    'theme': r'\btheme\b(?!s|Color|Provider)',  # avoid themes, themeColor, ThemeProvider
    'toggleTheme': r'\btoggleTheme\b',
    'portal': r'\bportal\b',
    'loginAs': r'\bloginAs\b',
    'loginAsCustomer': r'\bloginAsCustomer\b',
    'logout': r'\blogout\b(?!Customer)',
    'logoutCustomer': r'\blogoutCustomer\b',
}

issues = []
files_scanned = 0

for filepath in ROOT.rglob('*.tsx'):
    files_scanned += 1
    text = filepath.read_text()
    rel_path = str(filepath.relative_to(ROOT))

    for var_name, pattern in PATTERNS.items():
        # Find all uses of the variable
        uses = re.findall(pattern, text)
        if not uses:
            continue

        # Check if it's imported or destructured
        # Pattern 1: import { var } from '...'
        # Pattern 2: const { var, ... } = useAppStore()
        # Pattern 3: const { var, ... } = useSomeOtherHook()
        # Pattern 4: function MyComponent({ var }) {  -- prop
        # Pattern 5: const var = ...

        imported = (
            re.search(rf'import\s+\{{[^}}]*\b{var_name}\b[^}}]*\}}\s+from', text) or
            re.search(rf'import\s+\b{var_name}\b\s+from', text) or
            re.search(rf'const\s+\{{[^}}]*\b{var_name}\b[^}}]*\}}\s*=', text) or
            re.search(rf'function\s+\w+\s*\(\{{[^}}]*\b{var_name}\b[^}}]*\}}', text) or
            re.search(rf'const\s+{var_name}\s*=', text) or
            re.search(rf'let\s+{var_name}\s*=', text) or
            re.search(rf'=\s*\{{[^}}]*\b{var_name}\b[^}}]*\}}\s*[,;)]', text)
        )

        if not imported:
            issues.append((rel_path, var_name, len(uses)))

print(f'Scanned {files_scanned} .tsx files')
print(f'Found {len(issues)} potential undefined variable bugs\n')

if issues:
    # Group by file
    by_file = defaultdict(list)
    for filepath, var, count in issues:
        by_file[filepath].append((var, count))

    for filepath in sorted(by_file.keys()):
        print(f'\n{filepath}:')
        for var, count in by_file[filepath]:
            print(f'  - {var} (used {count}x, not imported/destructured)')
else:
    print('No undefined variable bugs found!')

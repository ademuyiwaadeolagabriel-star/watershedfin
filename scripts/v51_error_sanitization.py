#!/usr/bin/env python3
"""
v5.1 P0 #4 — Error sanitization sweep.

Replaces patterns like:
  return NextResponse.json({ error: e.message }, { status: 500 });
with:
  return safeError('An unexpected error occurred.', 500);

Also replaces:
  return NextResponse.json({ error: e?.message }, { status: 500 });

The goal: NEVER expose internal error messages (Prisma errors, SQL, file paths,
stack traces) to API clients in production.

This script is conservative — it only replaces the EXACT catch pattern at
the end of route handlers. Custom error messages (e.g. 'Loan not found')
are left untouched.
"""
import re
from pathlib import Path
import os

# Patterns to replace (catch-block returns)
PATTERNS = [
    # { error: e.message } → safeError(...)
    (re.compile(r'return\s+NextResponse\.json\(\s*\{\s*error:\s*e\.message\s*\}\s*,\s*\{\s*status:\s*500\s*\}\s*\)'),
     "return safeError('An unexpected error occurred.', 500);"),
    # { error: e?.message } → safeError(...)
    (re.compile(r'return\s+NextResponse\.json\(\s*\{\s*error:\s*e\?\.message\s*\}\s*,\s*\{\s*status:\s*500\s*\}\s*\)'),
     "return safeError('An unexpected error occurred.', 500);"),
    # { error: e.message || '...' } → safeError (keeps the custom message)
    (re.compile(r"return\s+NextResponse\.json\(\s*\{\s*error:\s*e\.message\s*\|\|\s*'[^']*'\s*\}\s*,\s*\{\s*status:\s*500\s*\}\s*\)"),
     "return safeError('An unexpected error occurred.', 500);"),
]

# Need to add the import to files that don't have it
IMPORT_LINE = "import { safeError } from '@/lib/security/errors';"

def process_file(filepath):
    """Process a single file. Returns (was_modified, num_replacements)."""
    try:
        src = Path(filepath).read_text(encoding='utf-8')
    except:
        return False, 0

    original = src
    total_replacements = 0

    for pattern, replacement in PATTERNS:
        src, count = pattern.subn(replacement, src)
        total_replacements += count

    if total_replacements == 0:
        return False, 0

    # Add the import if not already present
    if IMPORT_LINE not in src and 'safeError' in src:
        # Find the last import line and add after it
        import_match = re.search(r'^(import\s+.*?;)\s*$', src, re.MULTILINE)
        if import_match:
            # Find the LAST import
            imports = list(re.finditer(r'^import\s+.*?;\s*$', src, re.MULTILINE))
            if imports:
                last_import = imports[-1]
                insert_pos = last_import.end()
                src = src[:insert_pos] + '\n' + IMPORT_LINE + src[insert_pos:]
        else:
            src = IMPORT_LINE + '\n' + src

    Path(filepath).write_text(src, encoding='utf-8')
    return True, total_replacements

def main():
    # Find all route files
    import subprocess
    result = subprocess.run(
        ['find', 'src/app/api', '-name', 'route.ts', '-o', '-name', 'route.tsx'],
        capture_output=True, text=True, cwd='/home/z/my-project'
    )
    files = [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]

    total_files = 0
    total_replacements = 0

    for filepath in files:
        full_path = os.path.join('/home/z/my-project', filepath)
        modified, count = process_file(full_path)
        if modified:
            total_files += 1
            total_replacements += count

    print(f"Processed {len(files)} files")
    print(f"Modified {total_files} files")
    print(f"Total replacements: {total_replacements}")

if __name__ == '__main__':
    main()

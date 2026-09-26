#!/usr/bin/env python3
"""
v53 Phase 1 — Manual IDOR fixes for routes the regex script missed.
Each route needs custom surgery — we do it inline.
"""
import re
from pathlib import Path

def patch(path, old, new):
    p = Path(path)
    if not p.exists():
        print(f"! MISSING  {path}")
        return False
    src = p.read_text(encoding='utf-8')
    if old not in src:
        print(f"? NO-MATCH  {path} (old_str not found)")
        return False
    if 'v53-IDOR-fix' in src and 'v53-IDOR-fix' in new:
        # already patched
        print(f"~ SKIP     {path}  (already has v53 marker)")
        return False
    src_new = src.replace(old, new, 1)
    p.write_text(src_new, encoding='utf-8')
    print(f"OK PATCHED {path}")
    return True


# kyc-dynamic GET: searchParams.get('userId') → authPayload_v51.id
patch(
    'src/app/api/customer/kyc-dynamic/route.ts',
    """    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }""",
    """    // v53-IDOR-fix: userId from JWT, not query string.
    const userId = authPayload_v51.id;""",
)

# kyc-dynamic POST: body.userId → authPayload_v51.id
patch(
    'src/app/api/customer/kyc-dynamic/route.ts',
    """    const { userId, values, submit } = body as {
      userId: string;
      values: Array<{ fieldId: string; value: string; fileName?: string; filePath?: string }>;
      submit?: boolean;
    };

    if (!userId || !Array.isArray(values)) {
      return NextResponse.json({ error: 'userId and values[] are required' }, { status: 400 });
    }""",
    """    // v53-IDOR-fix: userId from JWT, not body.
    const { values, submit } = body as {
      values: Array<{ fieldId: string; value: string; fileName?: string; filePath?: string }>;
      submit?: boolean;
    } || {};
    const userId = authPayload_v51.id;

    if (!Array.isArray(values)) {
      return NextResponse.json({ error: 'values[] is required' }, { status: 400 });
    }""",
)

# notification-preferences GET
patch(
    'src/app/api/customer/notification-preferences/route.ts',
    """    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });""",
    """    // v53-IDOR-fix: userId from JWT, not query string.
    const userId = authPayload_v51.id;""",
)

# notification-preferences PUT
patch(
    'src/app/api/customer/notification-preferences/route.ts',
    """    const { userId, preferences } = body as {
      userId: string;
      preferences: any;
    };

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });""",
    """    // v53-IDOR-fix: userId from JWT, not body.
    const { preferences } = body as { preferences: any } || {};
    const userId = authPayload_v51.id;""",
)

# onboarding-payment/status GET
patch(
    'src/app/api/customer/onboarding-payment/status/route.ts',
    """    const userId = url.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }""",
    """    // v53-IDOR-fix: userId from JWT, not query string.
    const userId = authPayload_v51.id;""",
)

print("\nDone.")

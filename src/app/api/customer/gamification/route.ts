import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import {
  getGamificationProfile,
  checkPaymentBadges,
  BADGE_DEFINITIONS,
} from '@/lib/gamification';

// ============================================================================
// /api/customer/gamification
//   GET  — return the authenticated customer's gamification profile + badge catalog
//   POST { loanId, paymentDate, dueDate } — customer-initiated "I just paid"
//        notification (the server-side payment webhook is the authoritative
//        caller of checkPaymentBadges; this route is a no-op fallback that
//        just returns the current profile)
//
// v54 — Blocker 1 fix (business-integrity vuln): the previous implementation
// accepted `action: 'award_points'` / `'award_badge'` from the customer
// themselves. A customer could self-award 99,999 points or any badge.
// Now: award_points + award_badge actions are REMOVED from the customer
// route entirely. They are only callable from internal server-side code
// (e.g. the payment webhook's checkPaymentBadges helper, which awards
// points server-side when a payment is verified).
//
// The customer POST now only accepts `action: 'payment'` (and even that
// is a no-op — the real award happens server-side when the payment is
// verified by the webhook). This prevents any customer-initiated reward
// manipulation.
// ============================================================================

export async function GET(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    // v53 — IDOR fix: userId from JWT.
    const userId = authPayload_v51.id;

    const profile = await getGamificationProfile(userId);

    // Also expose the full badge catalog so the UI can show locked/unlocked
    const earnedTypes = new Set(profile.badges.map((b) => b.badgeType));
    const badgeCatalog = BADGE_DEFINITIONS.map((b) => ({
      ...b,
      earned: earnedTypes.has(b.type),
      earnedAt: profile.badges.find((x) => x.badgeType === b.type)?.earnedAt || null,
    }));

    return NextResponse.json({ ...profile, badgeCatalog });
  } catch (e: any) {
    console.error('Gamification GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const body = await req.json().catch(() => ({}));
    // v53 — IDOR fix: userId from JWT, not body.
    const userId = authPayload_v51.id;
    const { action } = body || {};

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    switch (action) {
      case 'payment': {
        // v54 — Blocker 1: customer-initiated "I just paid" is a NO-OP.
        // The real award happens server-side when the payment is
        // verified by the webhook (which calls checkPaymentBadges
        // internally). This route just returns the current profile.
        // We do NOT call checkPaymentBadges here because the customer
        // could lie about the payment date / due date to trigger
        // on-time badges they didn't earn.
        const profile = await getGamificationProfile(userId);
        return NextResponse.json({
          success: true,
          action,
          message: 'Payment badge check is performed server-side when the payment is verified by the gateway. Your profile is current.',
          profile,
        });
      }

      // v54 — award_points + award_badge are REMOVED. These actions are
      // business-integrity vulnerabilities when callable by the customer.
      // They are now only callable from internal server-side code (the
      // payment webhook's checkPaymentBadges helper awards points when a
      // payment is verified). Any customer POST with action=award_points
      // or action=award_badge will fall through to the default 400.
      case 'award_points':
      case 'award_badge':
        return NextResponse.json(
          {
            error: `Action '${action}' is not available via the customer API. Rewards are awarded server-side when payments are verified by the gateway.`,
          },
          { status: 403 },
        );

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error('Gamification POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

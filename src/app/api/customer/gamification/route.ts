import { NextRequest, NextResponse } from 'next/server';
import {
  getGamificationProfile,
  checkPaymentBadges,
  awardPoints,
  awardBadge,
  BADGE_DEFINITIONS,
} from '@/lib/gamification';

// ============================================================================
// /api/customer/gamification
// GET  ?userId=          — return the customer's gamification profile
// POST { userId, action, loanId?, paymentDate?, dueDate?, points?, reason?, badgeType? }
//      action: 'payment' | 'award_points' | 'award_badge'
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });
    }

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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
    }

    switch (action) {
      case 'payment': {
        const { loanId, paymentDate, dueDate } = body;
        if (!loanId || !paymentDate || !dueDate) {
          return NextResponse.json(
            { error: 'loanId, paymentDate and dueDate are required for payment action' },
            { status: 400 },
          );
        }
        const result = await checkPaymentBadges(
          userId,
          loanId,
          new Date(paymentDate),
          new Date(dueDate),
        );
        return NextResponse.json({ success: true, action, result });
      }

      case 'award_points': {
        const { points, reason, loanId } = body;
        if (typeof points !== 'number' || !reason) {
          return NextResponse.json(
            { error: 'points and reason are required for award_points action' },
            { status: 400 },
          );
        }
        const result = await awardPoints(userId, points, reason, loanId);
        return NextResponse.json({ success: true, action, result });
      }

      case 'award_badge': {
        const { badgeType } = body;
        if (!badgeType) {
          return NextResponse.json(
            { error: 'badgeType is required for award_badge action' },
            { status: 400 },
          );
        }
        await awardBadge(userId, badgeType);
        return NextResponse.json({ success: true, action });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    console.error('Gamification POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

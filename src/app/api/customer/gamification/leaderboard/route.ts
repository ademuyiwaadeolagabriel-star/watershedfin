import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TIER_THRESHOLDS } from '@/lib/gamification';

// ============================================================================
// /api/customer/gamification/leaderboard
// GET — admin view: top 20 customers by total loyalty points
// ============================================================================

export async function GET(_req: NextRequest) {
  try {
    // Pull top 20 customers by total points
    const topTiers = await db.creditTier.findMany({
      orderBy: { totalPoints: 'desc' },
      take: 20,
    });

    // Enrich with user details + badge counts
    const userIds = topTiers.map((t) => t.userId);
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        accountNumber: true,
        phone: true,
        business: { select: { name: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const badgeCounts = await db.achievementBadge.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    });
    const badgeMap = new Map(badgeCounts.map((b) => [b.userId, b._count._all]));

    const leaderboard = topTiers.map((t, idx) => {
      const user = userMap.get(t.userId);
      const tierKey = (t.tier || 'BRONZE') as keyof typeof TIER_THRESHOLDS;
      return {
        rank: idx + 1,
        userId: t.userId,
        firstName: user?.firstName || 'Unknown',
        lastName: user?.lastName || '',
        accountNumber: user?.accountNumber || '—',
        phone: user?.phone || '—',
        businessName: user?.business?.name || 'Personal Account',
        tier: t.tier || 'BRONZE',
        tierLabel: TIER_THRESHOLDS[tierKey].label,
        tierIcon: TIER_THRESHOLDS[tierKey].icon,
        totalPoints: t.totalPoints,
        streak: t.streak,
        bestStreak: t.bestStreak,
        interestDiscount: t.interestDiscount,
        badgeCount: badgeMap.get(t.userId) || 0,
      };
    });

    return NextResponse.json({ leaderboard, total: leaderboard.length });
  } catch (e: any) {
    console.error('Leaderboard GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

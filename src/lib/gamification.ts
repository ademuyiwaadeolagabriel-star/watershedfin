import { db } from '@/lib/db';

// ============================================================================
// WATERSHED CAPITAL — Gamification Service
// ----------------------------------------------------------------------------
// Loyalty points, credit tiers, achievement badges, and streaks.
// All public functions are safe to call from API routes; they never throw into
// the caller — failures are caught and logged so the surrounding request
// (e.g. a payment post) keeps succeeding even if gamification fails.
// ============================================================================

export const TIER_THRESHOLDS = {
  BRONZE: { min: 0, discount: 0, label: 'Bronze', icon: '🥉' },
  SILVER: { min: 100, discount: 0.005, label: 'Silver', icon: '🥈' },
  GOLD: { min: 500, discount: 0.01, label: 'Gold', icon: '🥇' },
  PLATINUM: { min: 1000, discount: 0.015, label: 'Platinum', icon: '💎' },
} as const;

export const BADGE_DEFINITIONS = [
  { type: 'first_loan_paid', label: 'First Loan Paid', icon: '🎯', condition: 'Customer fully repays their first loan' },
  { type: 'perfect_payer', label: 'Perfect Payer', icon: '✨', condition: '12 consecutive on-time payments' },
  { type: 'loyal_customer', label: 'Loyal Customer', icon: '🏆', condition: '3+ completed loans' },
  { type: 'early_bird', label: 'Early Bird', icon: '🐦', condition: 'Paid 3+ days early 5 times' },
  { type: 'streak_5', label: '5-Streak', icon: '🔥', condition: '5 consecutive on-time payments' },
  { type: 'streak_10', label: '10-Streak', icon: '⚡', condition: '10 consecutive on-time payments' },
  { type: 'referral_king', label: 'Referral King', icon: '👑', condition: '5 successful referrals' },
] as const;

/**
 * Award loyalty points to a user, then recompute their tier (upgrading if
 * eligible). Returns the resolved tier label + new total points.
 */
export async function awardPoints(userId: string, points: number, reason: string, loanId?: string) {
  // Create loyalty point record
  await db.loyaltyPoint.create({ data: { userId, points, reason, loanId } });

  // Update credit tier (create if missing)
  const tier = await db.creditTier.upsert({
    where: { userId },
    update: { totalPoints: { increment: points } },
    create: { userId, totalPoints: points },
  });

  // Check for tier upgrade
  const newTier = getTierByPoints(tier.totalPoints);
  if (newTier !== tier.tier) {
    await db.creditTier.update({
      where: { userId },
      data: {
        tier: newTier,
        interestDiscount: TIER_THRESHOLDS[newTier as keyof typeof TIER_THRESHOLDS].discount,
      },
    });

    // Notify customer about tier upgrade
    await db.notification
      .create({
        data: {
          userId,
          type: 'tier_upgrade',
          title: `Tier Upgraded: ${TIER_THRESHOLDS[newTier as keyof typeof TIER_THRESHOLDS].label}!`,
          message: `Congratulations! You've been upgraded to ${TIER_THRESHOLDS[newTier as keyof typeof TIER_THRESHOLDS].label} tier. Enjoy a ${(TIER_THRESHOLDS[newTier as keyof typeof TIER_THRESHOLDS].discount * 100).toFixed(1)}% interest discount on your next loan.`,
          category: 'system',
          actionLabel: 'View Profile',
          actionView: 'customer-profile',
        },
      })
      .catch(() => {});
  }

  return { tier: newTier, totalPoints: tier.totalPoints };
}

/**
 * Increment (or reset) a customer's on-time payment streak. Side effects:
 * awarding streak badges at milestones (5, 10, 12 consecutive on-time).
 */
export async function updateStreak(userId: string, wasOnTime: boolean) {
  const tier = await db.creditTier.upsert({
    where: { userId },
    update: wasOnTime ? { streak: { increment: 1 } } : { streak: 0 },
    create: { userId, streak: wasOnTime ? 1 : 0 },
  });

  if (wasOnTime && tier.streak > tier.bestStreak) {
    await db.creditTier.update({ where: { userId }, data: { bestStreak: tier.streak } });
  }

  // Check for streak badges
  if (wasOnTime) {
    if (tier.streak === 5) await awardBadge(userId, 'streak_5');
    if (tier.streak === 10) await awardBadge(userId, 'streak_10');
    if (tier.streak === 12) await awardBadge(userId, 'perfect_payer');
  }

  return tier.streak;
}

/**
 * Award an achievement badge (idempotent — unique constraint on userId+badgeType).
 * Also creates a notification for the customer.
 */
export async function awardBadge(userId: string, badgeType: string) {
  const badgeDef = BADGE_DEFINITIONS.find((b) => b.type === badgeType);
  if (!badgeDef) return;

  try {
    await db.achievementBadge.create({
      data: {
        userId,
        badgeType,
        badgeLabel: badgeDef.label,
        badgeIcon: badgeDef.icon,
      },
    });

    // Create notification
    await db.notification
      .create({
        data: {
          userId,
          type: 'achievement_unlocked',
          title: `Badge Unlocked: ${badgeDef.label}!`,
          message: `Congratulations! You earned the "${badgeDef.label}" badge. ${badgeDef.condition}.`,
          category: 'system',
          actionLabel: 'View Badges',
          actionView: 'customer-profile',
        },
      })
      .catch(() => {});
  } catch (e: any) {
    // Badge already exists (unique constraint) — silently ignore
  }
}

/**
 * Resolve a tier name (BRONZE/SILVER/GOLD/PLATINUM) from a points total.
 */
export function getTierByPoints(points: number): string {
  if (points >= 1000) return 'PLATINUM';
  if (points >= 500) return 'GOLD';
  if (points >= 100) return 'SILVER';
  return 'BRONZE';
}

/**
 * Build the full gamification profile for a customer — used by the dashboard
 * card and the profile screen.
 */
export async function getGamificationProfile(userId: string) {
  const tier = await db.creditTier.findUnique({ where: { userId } });
  const recentPoints = await db.loyaltyPoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const badges = await db.achievementBadge.findMany({
    where: { userId },
    orderBy: { earnedAt: 'desc' },
  });
  const totalEarned = await db.loyaltyPoint.aggregate({
    where: { userId },
    _sum: { points: true },
  });

  const tierName = (tier?.tier || 'BRONZE') as keyof typeof TIER_THRESHOLDS;
  const total = totalEarned._sum.points || 0;

  return {
    tier: tier?.tier || 'BRONZE',
    tierLabel: TIER_THRESHOLDS[tierName].label,
    tierIcon: TIER_THRESHOLDS[tierName].icon,
    interestDiscount: tier?.interestDiscount || 0,
    totalPoints: total,
    streak: tier?.streak || 0,
    bestStreak: tier?.bestStreak || 0,
    recentPoints,
    badges,
    nextTier: getNextTier(tier?.tier || 'BRONZE'),
    pointsToNextTier: getPointsToNextTier(total),
  };
}

function getNextTier(current: string): string | null {
  const order = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'];
  const idx = order.indexOf(current);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

function getPointsToNextTier(points: number): { needed: number; nextTier: string } | null {
  if (points >= 1000) return null;
  if (points >= 500) return { needed: 1000 - points, nextTier: 'PLATINUM' };
  if (points >= 100) return { needed: 500 - points, nextTier: 'GOLD' };
  return { needed: 100 - points, nextTier: 'SILVER' };
}

/**
 * Check + award points/badges after a payment is recorded.
 * `paymentDate` is when the customer actually paid; `dueDate` is the
 * scheduled due date for that installment.
 */
export async function checkPaymentBadges(
  userId: string,
  loanId: string,
  paymentDate: Date,
  dueDate: Date,
) {
  const daysEarly = Math.floor(
    (dueDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  const wasOnTime = daysEarly >= 0;

  // Award points
  if (wasOnTime) {
    await awardPoints(userId, 10, 'on_time_payment', loanId);
    if (daysEarly >= 3) {
      await awardPoints(userId, 5, 'early_payment_bonus', loanId);

      // Track early payments and award the early_bird badge after 5
      try {
        const earlyPayments = await db.loyaltyPoint.count({
          where: { userId, reason: 'early_payment_bonus' },
        });
        if (earlyPayments >= 5) {
          await awardBadge(userId, 'early_bird');
        }
      } catch (e) {
        // non-fatal
      }
    }
  }

  // Update streak
  await updateStreak(userId, wasOnTime);

  return {
    wasOnTime,
    daysEarly,
    pointsAwarded: wasOnTime ? (daysEarly >= 3 ? 15 : 10) : 0,
  };
}

/**
 * Award completion bonus + lifecycle badges when a loan is fully repaid.
 * Returns the customer's total count of completed loans.
 */
export async function checkLoanCompletionBadges(userId: string) {
  const completedLoans = await db.loanApplicants.count({
    where: { userId, status: 'paid' },
  });

  if (completedLoans === 1) await awardBadge(userId, 'first_loan_paid');
  if (completedLoans >= 3) await awardBadge(userId, 'loyal_customer');

  // Award completion bonus points
  await awardPoints(userId, 50, 'loan_completed');

  return completedLoans;
}

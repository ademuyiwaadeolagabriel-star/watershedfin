import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/customers/[id]/credit-score
 * Calculates an internal credit score (0-100) based on:
 * - Repayment history (40%)
 * - CAM risk grade (20%)
 * - Loan cycle history (15%)
 * - Bank statement consistency (15%)
 * - KYC completeness (10%)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { id: userId } = await params;
    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        loans: {
          select: { id: true, status: true, amount: true, currentStep: true, riskGrade: true },
        },
      },
    });
    if (!user) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

    let score = 0;
    const breakdown: any = {};

    // 1. Repayment history (40 points)
    const runningLoans = user.loans?.filter((l: any) => l.status === 'running') || [];
    const paidLoans = user.loans?.filter((l: any) => l.status === 'paid') || [];
    const defaultedLoans = user.loans?.filter((l: any) => l.status === 'declined') || [];

    if (paidLoans.length > 0 && defaultedLoans.length === 0) {
      breakdown.repayment = 40;
    } else if (paidLoans.length > defaultedLoans.length) {
      breakdown.repayment = 25;
    } else if (paidLoans.length === 0 && runningLoans.length === 0) {
      breakdown.repayment = 20; // New customer — neutral
    } else {
      breakdown.repayment = 5;
    }
    score += breakdown.repayment;

    // 2. CAM risk grade (20 points)
    const latestAppraisal = await db.creditAppraisal.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { riskGrade: true },
    });
    const gradeMap: Record<string, number> = { A: 20, B: 16, C: 12, D: 6, F: 0 };
    breakdown.riskGrade = gradeMap[latestAppraisal?.riskGrade || ''] ?? 10;
    score += breakdown.riskGrade;

    // 3. Loan cycle history (15 points)
    const totalLoans = (user.loans?.length || 0);
    breakdown.loanCycle = Math.min(15, totalLoans * 5);
    score += breakdown.loanCycle;

    // 4. KYC completeness (15 points)
    const kycFields = [user.bvn, user.nin, user.email, user.phone, user.address, user.accountNumber];
    const filledFields = kycFields.filter(Boolean).length;
    breakdown.kyc = Math.round((filledFields / kycFields.length) * 15);
    score += breakdown.kyc;

    // 5. Account age (10 points)
    const accountAgeMonths = user.createdAt
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000))
      : 0;
    breakdown.accountAge = Math.min(10, accountAgeMonths);
    score += breakdown.accountAge;

    // Determine grade
    let grade = 'F';
    if (score >= 80) grade = 'A';
    else if (score >= 65) grade = 'B';
    else if (score >= 50) grade = 'C';
    else if (score >= 35) grade = 'D';

    return NextResponse.json({
      score,
      grade,
      maxScore: 100,
      breakdown,
      label: score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : score >= 35 ? 'Poor' : 'Very Poor',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

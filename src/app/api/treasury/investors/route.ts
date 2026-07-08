import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: list investor profiles (with user) OR search users by query (?q=)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const mode = url.searchParams.get('mode'); // 'search' to search users

    if (mode === 'search' && q) {
      const users = await db.user.findMany({
        where: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 20,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          accountType: true,
        },
      });
      return NextResponse.json({ users });
    }

    const profiles = await db.investorProfile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, accountType: true } },
      },
    });
    return NextResponse.json({ profiles });
  } catch (e: any) {
    console.error('Investors GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: create investor profile (and optionally upgrade user accountType to 'investor')
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      sourceOfFunds,
      investmentGoal,
      riskTolerance,
      nokName,
      nokPhone,
      nokRelationship,
      nokEmail,
      bankName,
      accountNumber,
      accountName,
    } = body;

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const existing = await db.investorProfile.findUnique({ where: { userId } });
    if (existing) return NextResponse.json({ error: 'Investor profile already exists for this user' }, { status: 400 });

    const profile = await db.investorProfile.create({
      data: {
        userId,
        sourceOfFunds: sourceOfFunds || null,
        investmentGoal: investmentGoal || null,
        riskTolerance: riskTolerance || 'low',
        nokName: nokName || null,
        nokPhone: nokPhone || null,
        nokRelationship: nokRelationship || null,
        nokEmail: nokEmail || null,
        bankName: bankName || null,
        accountNumber: accountNumber || null,
        accountName: accountName || null,
        status: 'active',
      },
      include: { user: true },
    });

    // Promote user accountType
    await db.user.update({ where: { id: userId }, data: { accountType: 'investor' } });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (e: any) {
    console.error('Investor POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

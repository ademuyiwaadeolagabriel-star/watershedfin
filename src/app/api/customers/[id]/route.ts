import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/customers/[id]
 * Returns the customer's user record, business, loans, and transactions.
 * Passwords are stripped.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      include: {
        business: true,
        branch: { select: { id: true, name: true, code: true, state: true } },
        loanOfficer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            role: true,
          },
        },
        loans: {
          orderBy: { createdAt: 'desc' },
          include: {
            plan: { select: { id: true, name: true, interest: true, duration: true } },
            branch: { select: { id: true, name: true, code: true } },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { password, token, verificationCode, googlefaSecret, pin, ...safeUser } =
      user as any;

    return NextResponse.json({ user: safeUser });
  } catch (e: any) {
    console.error('Customer detail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { notifyPasswordReset } from '@/lib/notification-service';

/**
 * POST /api/customers/[id]/reset-password
 * Frontdesk resets a customer's password.
 * Generates a random temporary password, hashes it, saves to DB,
 * and sends both a dashboard notification and an email to the customer.
 *
 * Accessible by: super, frontdesk, bm
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Only frontdesk, bm, and super can reset passwords
    const allowedRoles = ['super', 'frontdesk', 'bm'];
    if (!allowedRoles.includes(authPayload.role)) {
      return NextResponse.json({ error: 'Only Front Desk, Branch Manager, or Super Admin can reset passwords' }, { status: 403 });
    }

    const { id: userId } = await params;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Generate a random 8-character temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 8; i++) {
      tempPassword += chars[Math.floor(Math.random() * chars.length)];
    }

    // Hash and save
    const hash = bcrypt.hashSync(tempPassword, 10);
    await db.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    // Send notifications (dashboard + email)
    const customerName = `${user.firstName} ${user.lastName}`.trim();
    await notifyPasswordReset(userId, customerName, user.email || '', tempPassword);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully. Temporary password sent to customer via email.',
      tempPassword: tempPassword, // Return to frontdesk so they can tell the customer in person
    });
  } catch (e: any) {
    console.error('Password reset error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

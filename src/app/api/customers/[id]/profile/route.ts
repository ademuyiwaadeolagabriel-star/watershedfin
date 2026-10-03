import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * PUT /api/customers/[id]/profile
 * Frontdesk or BM updates a customer's profile (walk-in completion).
 * Can update personal info, contact, business info, etc.
 *
 * Accessible by: super, frontdesk, bm
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(req, ['super', 'frontdesk', 'bm']);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult;

    const { id: userId } = await params;
    const body = await req.json();

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    if (authPayload.role === 'bm' && authPayload.branchId && user.branchId &&
        authPayload.branchId !== user.branchId) {
      return NextResponse.json({ error: 'Access denied — customer belongs to a different branch.' }, { status: 403 });
    }

    if (body.sectorId) {
      const sector = await db.sector.findUnique({ where: { id: String(body.sectorId) }, select: { id: true } });
      if (!sector) return NextResponse.json({ error: 'Selected sector does not exist.' }, { status: 400 });
    }

    // Allowed fields for profile update
    const allowedFields = [
      'firstName', 'lastName', 'email', 'phone', 'bvn', 'nin',
      'gender', 'maritalStatus', 'dob', 'address', 'nearestLandmark',
      'houseOwnership', 'yearsAtResidence', 'state', 'lga', 'town',
      'bankName', 'accountNumber', 'bankAccountVerified',
    ];

    const updateData: any = {};
    for (const f of allowedFields) {
      if (body[f] !== undefined) {
        updateData[f] = body[f];
      }
    }

    // Check if profile is now complete (required fields filled)
    const requiredFields = ['firstName', 'lastName', 'phone', 'bvn', 'address', 'state'];
    const allFilled = requiredFields.every(f => updateData[f] !== undefined || user[f]);
    if (allFilled && user.profileStatus === 'incomplete') {
      updateData.profileStatus = 'complete';
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: updateData,
    });

    // Also update business if business fields provided
    if (body.businessName || body.shopAddress || body.sectorId) {
      if (user.businessId) {
        await db.business.update({
          where: { id: user.businessId },
          data: {
            ...(body.businessName && { name: body.businessName }),
            ...(body.shopAddress && { shopAddress: body.shopAddress }),
            ...(body.sectorId && { sectorId: body.sectorId }),
          },
        });
      } else {
        // Create business record if it doesn't exist
        const biz = await db.business.create({
          data: {
            userId,
            name: body.businessName || `${user.firstName}'s Business`,
            shopAddress: body.shopAddress || null,
            sectorId: body.sectorId || null,
            kycStatus: 'DRAFT',
          },
        });
        await db.user.update({ where: { id: userId }, data: { businessId: biz.id } });
      }
    }

    const { password: _pw, ...safeUser } = updated as any;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (e: any) {
    console.error('Profile update error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

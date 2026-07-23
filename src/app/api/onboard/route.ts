import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { notifyWelcome } from '@/lib/notification-service';
import { createNotification } from '@/lib/notifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a 10-digit NUBAN-style account number, retrying until unique. */
async function generateUniqueAccountNumber(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const num = Math.floor(10_000_000_0 + Math.random() * 9_000_000_000).toString();
    const existing = await db.user.findUnique({
      where: { accountNumber: num },
      select: { id: true },
    });
    if (!existing) return num;
  }
  // Fallback — extremely unlikely collision
  return Date.now().toString().slice(-10);
}

/** Generate an 8-char alphanumeric merchantId, retrying until unique. */
async function generateUniqueMerchantId(): Promise<string> {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 25; i++) {
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const existing = await db.user.findUnique({
      where: { merchantId: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** Generate the next application reference in the LN-YYYY-NNNN format. */
async function generateApplicationRef(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LN-${year}-`;

  // Find any existing app ref that starts with the prefix for this year.
  const existing = await db.loanApplicants.findFirst({
    where: { applicationRef: { startsWith: prefix } },
    orderBy: { applicationRef: 'desc' },
    select: { applicationRef: true },
  });

  let next = 1;
  if (existing?.applicationRef) {
    const parts = existing.applicationRef.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) next = last + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// POST handler — create customer (and optional loan + appraisal)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const adminId = url.searchParams.get('adminId') || undefined;

    const body = await req.json();

    // G6: Input validation
    const { personal, business, loan } = body;
    if (!personal?.firstName || !personal?.lastName) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }
    if (personal.bvn && !/^\d{11}$/.test(String(personal.bvn).replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'BVN must be exactly 11 digits' }, { status: 400 });
    }
    if (personal.nin && !/^\d{11}$/.test(String(personal.nin).replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'NIN must be exactly 11 digits' }, { status: 400 });
    }
    if (personal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal.email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    if (personal.phone && String(personal.phone).replace(/\D/g, '').length < 10) {
      return NextResponse.json({ error: 'Phone number must be at least 10 digits' }, { status: 400 });
    }
    if (loan?.loanAmount && Number(loan.loanAmount) <= 0) {
      return NextResponse.json({ error: 'Loan amount must be greater than 0' }, { status: 400 });
    }
    if (loan?.loanDuration && Number(loan.loanDuration) <= 0) {
      return NextResponse.json({ error: 'Loan duration must be at least 1 month' }, { status: 400 });
    }

    // S2: Smart duplicate detection
    if (personal.bvn || personal.email || personal.phone) {
      const existing = await db.user.findFirst({
        where: {
          OR: [
            ...(personal.bvn ? [{ bvn: String(personal.bvn).replace(/\s/g, '') }] : []),
            ...(personal.email ? [{ email: personal.email.toLowerCase() }] : []),
            ...(personal.phone ? [{ phone: personal.phone }] : []),
          ],
        },
        select: { id: true, firstName: true, lastName: true, email: true, accountNumber: true },
      });
      if (existing) {
        return NextResponse.json({
          error: 'Duplicate account detected',
          duplicate: existing,
          message: `A customer account already exists for ${existing.firstName} ${existing.lastName} (Account: ${existing.accountNumber || 'N/A'}). Please use the existing account or contact support.`,
        }, { status: 409 });
      }
    }

    const {
      channel,
      assignment,
    } = body as {
      channel: 'self_onboard' | 'desk_onboard' | 'bm_onboard' | 'field_onboard';
      personal: {
        title?: string;
        firstName: string;
        lastName: string;
        email?: string;
        phone: string;
        password?: string; // v37: customer sets their own password during self-onboarding
        altPhone?: string;
        bvn: string;
        nin: string;
        dob: string;
        gender?: string;
        maritalStatus?: string;
        state?: string;
        lga?: string;
        residentialAddress?: string;
        town?: string;
        nearestLandmark?: string;
        houseOwnershipStatus?: string;
        yearsAtResidence?: number;
        religion?: string;
      };
      business: {
        businessName: string;
        sectorId: string;
        shopAddress?: string;
        businessDateEstablished?: string;
        legalStructure?: string;
        rcBnNumber?: string;
        numberOfEmployees?: number;
      };
      loan: {
        loanAmount: number;
        loanDuration: number;
        planId?: string;
        loanPurpose?: string;
        hasExternalLoans?: boolean;
        isGuarantorsewhere?: boolean;
      };
      assignment: {
        branchId?: string;
        staffId?: string;
      };
    };

    if (!channel || !personal || !business) {
      return NextResponse.json(
        { error: 'Missing required fields (channel, personal, business)' },
        { status: 400 }
      );
    }

    // ----- generate identifiers -----
    // v37: Account number is NOT assigned at onboarding — only after Legal CAC approval.
    // merchantId is still generated here (used for internal tracking).
    const merchantId = await generateUniqueMerchantId();

    // ----- password handling -----
    // v37: For self_onboard, the customer sets their OWN password.
    // For staff-created accounts, a random temp password is generated.
    let passwordHash: string;
    let tempPasswordPlain: string | null = null;

    if (channel === 'self_onboard' && personal.password) {
      // Customer chose their own password during self-onboarding
      if (personal.password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }
      passwordHash = bcrypt.hashSync(personal.password, 10);
    } else {
      // Staff onboarding — generate random temp password
      tempPasswordPlain = Math.random().toString(36).slice(-8);
      passwordHash = bcrypt.hashSync(tempPasswordPlain, 10);
    }

    // ----- determine branch & staff assignment -----
    let assignedBranchId: string | undefined = assignment?.branchId;
    let assignedStaffId: string | undefined = assignment?.staffId;

    // ANY staff onboarding (field, desk, bm) → if the creator is a Loan Officer, auto-assign to them
    if (adminId && !assignedStaffId) {
      const creatorAdmin = await db.admin.findUnique({
        where: { id: adminId },
        select: { role: true, roleType: true, branchId: true, loanOrigination: true },
      });
      if (creatorAdmin && (creatorAdmin.role === 'loan' || creatorAdmin.roleType === 'loan' || creatorAdmin.loanOrigination)) {
        assignedStaffId = adminId;
        if (creatorAdmin.branchId && !assignedBranchId) {
          assignedBranchId = creatorAdmin.branchId;
        }
      }
    }

    // Field onboarding → assign to the current admin (creator) directly.
    if (channel === 'field_onboard' && adminId && !assignedStaffId) {
      assignedStaffId = adminId;
      const admin = await db.admin.findUnique({
        where: { id: adminId },
        select: { branchId: true },
      });
      if (admin?.branchId && !assignedBranchId) {
        assignedBranchId = admin.branchId;
      }
    }

    // BM onboarding → assign to selected loan officer; default branch to BM's branch.
    if (channel === 'bm_onboard' && adminId && !assignedBranchId) {
      const admin = await db.admin.findUnique({
        where: { id: adminId },
        select: { branchId: true },
      });
      if (admin?.branchId) assignedBranchId = admin.branchId;
    }

    const assignmentStatus =
      assignedStaffId || assignedBranchId ? 'assigned' : 'unassigned';

    // v40: If a branch was selected (self_onboard or desk_onboard), find and assign the BM
    let assignedBmId: string | undefined = undefined;
    if (assignedBranchId) {
      try {
        const branch = await db.branch.findUnique({
          where: { id: assignedBranchId },
          select: { managerId: true },
        });
        if (branch?.managerId) {
          assignedBmId = branch.managerId;
        }
      } catch (e) {
        // non-blocking
      }
    }

    // ----- create user -----
    const user = await db.user.create({
      data: {
        firstName: personal.firstName,
        lastName: personal.lastName,
        // Persist title in username (no dedicated column) — title is for display only.
        username: personal.title
          ? `${personal.title}.${personal.firstName}`.toLowerCase()
          : personal.firstName.toLowerCase(),
        email: personal.email || null,
        phone: personal.phone || null,
        password: passwordHash,
        accountType: 'customer',
        // v37: accountNumber NOT set here — only after Legal CAC approval
        // accountNumberStatus defaults to 'pending' per schema
        merchantId,
        branch: assignedBranchId ? { connect: { id: assignedBranchId } } : undefined,
        loanOfficer: assignedStaffId ? { connect: { id: assignedStaffId } } : undefined,
        assignedBranchId: assignedBranchId || null,
        assignedBmId: assignedBmId || null, // v40: assign BM of selected branch
        assignedBy: adminId || null,
        assignedAt: new Date(),
        assignmentStatus,
        onboardingChannel: channel,
        createdBy: adminId || null,
        bvn: personal.bvn || null,
        nin: personal.nin || null,
        bvnVerified: false,
        dob: personal.dob ? new Date(personal.dob) : null,
        gender: personal.gender || null,
        maritalStatus: personal.maritalStatus || null,
        religion: personal.religion || null,
        state: personal.state || null,
        lga: personal.lga || null,
        town: personal.town || null,
        address: personal.residentialAddress || null,
        nearestLandmark: personal.nearestLandmark || null,
        houseOwnership: personal.houseOwnershipStatus || null,
        yearsAtResidence:
          personal.yearsAtResidence != null ? Number(personal.yearsAtResidence) : null,
        kycStatus: 'DRAFT',
        // v37: Set onboarding stage to CS KYC review
        onboardingStage: 'cs_kyc_review',
        accountNumberStatus: 'pending',
        otpRequired: 'on',
        loanPurpose: loan?.loanPurpose || null,
        hasExternalLoans: !!loan?.hasExternalLoans,
        isGuarantorElsewhere: !!loan?.isGuarantorsewhere,
        nationality: 'Nigerian',
      },
    });

    // ----- create business -----
    let yearsInOperation: number | undefined;
    if (business.businessDateEstablished) {
      const established = new Date(business.businessDateEstablished);
      const diffMs = Date.now() - established.getTime();
      yearsInOperation = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    }

    const businessRow = await db.business.create({
      data: {
        user: { connect: { id: user.id } },
        name: business.businessName,
        sectorRef: business.sectorId ? { connect: { id: business.sectorId } } : undefined,
        shopAddress: business.shopAddress || null,
        legalStructure: business.legalStructure || null,
        rcBnNumber: business.rcBnNumber || null,
        dateEstablished: business.businessDateEstablished
          ? new Date(business.businessDateEstablished)
          : null,
        yearsInOperation,
        kycStatus: 'DRAFT',
      },
    });

    // link business back to user
    await db.user.update({
      where: { id: user.id },
      data: { businessId: businessRow.id },
    });

    // ----- create loan (if amount > 0) -----
    let loanRow: any = null;
    let appraisalRow: any = null;
    const loanAmount = Number(loan?.loanAmount || 0);

    if (loanAmount > 0) {
      // resolve branch for the loan — staff's branch or selected branch
      let loanBranchId = assignedBranchId;
      if (!loanBranchId && assignedStaffId) {
        const officer = await db.admin.findUnique({
          where: { id: assignedStaffId },
          select: { branchId: true },
        });
        loanBranchId = officer?.branchId || undefined;
      }

      const applicationRef = await generateApplicationRef();

      loanRow = await db.loanApplicants.create({
        data: {
          user: { connect: { id: user.id } },
          loanOfficer: assignedStaffId ? { connect: { id: assignedStaffId } } : undefined,
          branch: loanBranchId ? { connect: { id: loanBranchId } } : undefined,
          plan: loan?.planId ? { connect: { id: loan.planId } } : undefined,
          amount: loanAmount,
          duration: Number(loan?.loanDuration) || 0,
          reason: loan?.loanPurpose || null,
          status: 'pending',
          currentStep: 'LO_ENTRY',
          complianceStatus: 'pending',
          applicationRef,
          createdVia: channel,
          submittedAt: new Date(),
        },
      });

      // ----- create credit appraisal (draft) -----
      appraisalRow = await db.creditAppraisal.create({
        data: {
          loan: { connect: { id: loanRow.id } },
          user: { connect: { id: user.id } },
          staffId: assignedStaffId || null,
          branchId: loanBranchId || null,
          sectorId: business.sectorId || null,
          loanPurpose: loan?.loanPurpose || null,
          businessStartDate: business.businessDateEstablished
            ? new Date(business.businessDateEstablished)
            : null,
          yearsInOperation: yearsInOperation ?? null,
          status: 'draft',
        },
      });
    }

    // ----- strip sensitive fields -----
    const { password: _pw, ...safeUser } = user as any;
    const safeBusiness = businessRow;

    // ----- send welcome notification (email + dashboard) -----
    const customerName = `${user.firstName} ${user.lastName}`.trim();
    void notifyWelcome(user.id, customerName, user.email || '');

    // v38: Notify all Customer Service staff that a new application needs KYC review
    try {
      const csStaff = await db.admin.findMany({
        where: { role: 'cs', status: 1, csKycVerify: true },
        select: { id: true },
      });
      if (csStaff.length > 0) {
        await Promise.all(csStaff.map(cs =>
          createNotification({
            adminId: cs.id,
            type: 'kyc_review_request',
            title: 'New Customer Application — KYC Review Needed',
            message: `A new application from ${customerName} requires KYC verification. Please review the submitted documents.`,
            category: 'kyc',
            actionLabel: 'Review KYC',
            actionView: 'kyc',
            metadata: { userId: user.id, onboardingStage: 'cs_kyc_review' },
          })
        ));
      }
    } catch (notifErr) {
      console.error('[ONBOARD] CS notification failed (non-blocking):', notifErr);
    }

    // ----- send loan submitted notification if loan was created -----
    if (loanRow) {
      const { notifyLoanSubmitted } = await import('@/lib/notification-service');
      void notifyLoanSubmitted(loanRow);
    }

    return NextResponse.json(
      {
        user: safeUser,
        business: safeBusiness,
        loan: loanRow,
        appraisal: appraisalRow,
        // For staff-created accounts, surface the temp password so they can
        // share it with the customer. For self_onboard we don't return it.
        temporaryPassword:
          channel === 'self_onboard' ? undefined : tempPasswordPlain,
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error('Onboard API error:', e);
    return NextResponse.json({ error: e.message || 'Onboarding failed' }, { status: 500 });
  }
}

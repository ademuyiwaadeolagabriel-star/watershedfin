import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { notifyWelcome } from '@/lib/notification-service';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';
import { get, put } from '@vercel/blob';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

type StagedOnboardingFile = {
  docType: string;
  storagePath: string;
  originalName: string;
  size: number;
  contentType: string;
  uploadedAt: string;
};

async function promoteStagedDocument(file: StagedOnboardingFile, userId: string): Promise<string> {
  if (!file.storagePath.startsWith('onboarding-staging/')) {
    throw new Error('Invalid staged KYC storage path.');
  }

  const ext = file.storagePath.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const filename = `${crypto.randomUUID()}-${file.docType}.${ext}`;
  const proxyPath = `/api/customer/kyc-file/${userId}/${filename}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const source = await get(`kyc-private/${file.storagePath}`, { access: 'private' });
    if (!source || source.statusCode !== 200) {
      throw new Error(`Staged document not found: ${file.docType}`);
    }

    const reader = source.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    await put(`kyc-private/${userId}/${filename}`, Buffer.concat(chunks), {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.contentType,
    });
  } else {
    const sourcePath = join('/tmp', 'uploads', 'kyc-private', ...file.storagePath.split('/'));
    const bytes = await readFile(sourcePath);
    const destinationDir = join('/tmp', 'uploads', 'kyc-private', userId);
    await mkdir(destinationDir, { recursive: true });
    await writeFile(join(destinationDir, filename), bytes);
  }

  return proxyPath;
}


import { safeError } from '@/lib/security/errors';
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
  // v53 — P5 #28 fix: dual-mode auth.
  //   - self_onboard channel → public, no Bearer token required
  //   - desk_onboard / bm_onboard / field_onboard → admin JWT required
  //
  // We peek at the body's `channel` field first. If it's self_onboard,
  // no auth required (customer is creating their own account). For staff
  // channels, requireRole(['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']).
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const channel: string = body?.channel;
  const isSelfOnboard = channel === 'self_onboard';

  let adminId: string | undefined = undefined;
  if (!isSelfOnboard) {
    // Staff onboarding — admin JWT required.
    const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo']);
    if (authResult_v51 instanceof NextResponse) return authResult_v51;
    const authPayload = authResult_v51 as { id: string; role: string };
    adminId = authPayload.id;
  } else {
    // Self-onboard — verify NO valid admin token is being misused to spoof
    // adminId. If a Bearer token is present, we IGNORE it for self_onboard
    // (adminId stays undefined → createdBy is null, which is the correct
    // audit trail for a self-registered customer).
    adminId = undefined;
  }

  try {
    // v52 — P0-G5 cleanup: adminId derived from JWT (or undefined for self).
    // v53 — body was already read above for channel detection; do NOT
    // re-invoke req.json() (Next.js throws on second read).

    // G6: Input validation
    const { personal, business, loan, documents, consent } = body;
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

    // ── v52 — P0-G7: KYC DOCUMENT COMPLETENESS IS SERVER-ENFORCED ──────
    // The audit's #3 finding was that documents? was entirely optional,
    // so an API client could bypass the UI and submit onboarding with
    // zero documents. The server now requires:
    //   - passportPhoto (selfie)
    //   - idCardFront OR meansOfId (acceptable ID)
    //   - proofOfAddress (utility bill)
    // For business customers with rcBnNumber (a registered business), the
    // CAC certificate is also required.
    // A new customer must present a valid capability; do not trust client-supplied paths.
    const uploadCapabilityToken = String(body.uploadCapabilityToken || '').trim();
    if (!uploadCapabilityToken) {
      return NextResponse.json({ error: 'Please upload the required KYC documents again before submitting.' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(uploadCapabilityToken).digest('hex');
    const uploadCapability = await db.onboardingUploadCapability.findUnique({
      where: { capabilityToken: tokenHash },
    });

    if (!uploadCapability || uploadCapability.consumedAt || uploadCapability.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'The document upload session has expired. Please upload the documents again.' }, { status: 401 });
    }

    const expectedOnboardingKey = crypto
      .createHash('sha256')
      .update(`${personal.email || ''}|${personal.phone || ''}|${personal.bvn || ''}`)
      .digest('hex');

    if (uploadCapability.onboardingKey !== expectedOnboardingKey) {
      return NextResponse.json({ error: 'The uploaded documents do not match the submitted customer details. Please re-upload them.' }, { status: 403 });
    }

    let stagedFiles: StagedOnboardingFile[];
    try {
      stagedFiles = JSON.parse(uploadCapability.uploadedFiles || '[]') as StagedOnboardingFile[];
    } catch {
      return NextResponse.json({ error: 'The uploaded-document session is invalid. Please re-upload the documents.' }, { status: 400 });
    }

    const stagedByType: Record<string, StagedOnboardingFile> = {};
    for (const file of stagedFiles) {
      if (file && typeof file.docType === 'string' && typeof file.storagePath === 'string') {
        stagedByType[file.docType] = file;
      }
    }

    const requiredDocs: string[] = [];
    if (!stagedByType.passport) requiredDocs.push('passportPhoto (selfie)');
    if (!stagedByType.id_front && !stagedByType.means_of_id) {
      requiredDocs.push('idCardFront or meansOfId (acceptable ID)');
    }
    if (!stagedByType.proof_of_address) requiredDocs.push('proofOfAddress (utility bill)');
    if (business?.rcBnNumber && !stagedByType.cac_certificate) {
      requiredDocs.push('cacCertificate (required for registered businesses)');
    }

    if (requiredDocs.length > 0) {
      return NextResponse.json({
        error: 'KYC document completeness check failed.',
        missingDocuments: requiredDocs,
      }, { status: 400 });
    }
    if (!consent || !consent.feeKey) {
      return NextResponse.json(
        {
          error: 'CAC search consent is required. The customer must explicitly accept the CAC search fee before onboarding can be submitted.',
        },
        { status: 400 },
      );
    }

    // Look up the actual configured fee from SystemSetting.
    const feeSetting = await db.systemSetting.findUnique({
      where: { key: consent.feeKey },
    });
    if (!feeSetting || feeSetting.active === false) {
      return NextResponse.json(
        {
          error: `CAC fee key '${consent.feeKey}' is not configured or is inactive. Please contact admin to configure the current CAC search fee.`,
        },
        { status: 400 },
      );
    }
    const serverFeeAmount = Number(feeSetting.value);
    if (isNaN(serverFeeAmount) || serverFeeAmount <= 0) {
      return NextResponse.json(
        {
          error: `CAC fee '${consent.feeKey}' is configured with an invalid amount: '${feeSetting.value}'. Please contact admin to fix.`,
        },
        { status: 500 },
      );
    }

    // Sanity-check: if the caller's claimed feeAmount differs from the
    // server's configured fee, log the discrepancy but DO NOT trust the
    // caller's value. The OnboardingConsent row will record the SERVER's
    // fee amount, not the caller's.
    if (consent.feeAmount != null && Number(consent.feeAmount) !== serverFeeAmount) {
      console.warn(
        `[ONBOARD] Consent fee mismatch: caller claimed ₦${consent.feeAmount}, server configured ₦${serverFeeAmount}. Using server value.`,
      );
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

    // v53 — body type annotation (channel + assignment already destructured
    // at the top of the handler for dual-mode auth; we re-extract assignment
    // here for clarity, and use the existing `channel` variable from line 84).
    const { assignment } = body as {
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
      // v43: KYC document paths (uploaded before submit via /api/customer/kyc-upload)
      documents?: {
        passportPhoto?: string;
        idCardFront?: string;
        meansOfId?: string;
        proofOfAddress?: string;
        cacCertificate?: string;
        additionalDocs?: string;
      };
      // v41: CAC consent metadata (persisted to OnboardingConsent table)
      consent?: {
        feeKey: string;
        feeAmount: number;
        acceptedAt?: string;
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

    // v53 — P5 #31: atomic onboarding. The entire create sequence (user +
    // business + user.update(businessId) + loan + appraisal + consent) is
    // wrapped in db.$transaction so a partial failure rolls back the
    // whole onboarding. Previously a failure on step 4 (loan create)
    // after step 1 (user create) would leave an orphaned user record.
    const onboardResult = await db.$transaction(async (tx) => {
    // ----- create user -----
    const user = await tx.user.create({
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

    // Resolve private staged uploads to user-scoped paths before persisting the Business record.
    const finalDocuments = {
      passportPhoto: stagedByType.passport
        ? await promoteStagedDocument(stagedByType.passport, user.id)
        : null,
      idCardFront: stagedByType.id_front
        ? await promoteStagedDocument(stagedByType.id_front, user.id)
        : stagedByType.means_of_id
          ? await promoteStagedDocument(stagedByType.means_of_id, user.id)
          : null,
      proofOfAddress: stagedByType.proof_of_address
        ? await promoteStagedDocument(stagedByType.proof_of_address, user.id)
        : null,
      cacCertificate: stagedByType.cac_certificate
        ? await promoteStagedDocument(stagedByType.cac_certificate, user.id)
        : null,
    };
    // ----- create business -----
    let yearsInOperation: number | undefined;
    if (business.businessDateEstablished) {
      const established = new Date(business.businessDateEstablished);
      const diffMs = Date.now() - established.getTime();
      yearsInOperation = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    }

    const businessRow = await tx.business.create({
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
        // v43: Persist KYC document paths uploaded during onboarding (removed id_back + shop_photo)
        selfie: finalDocuments.passportPhoto,
        docFront: finalDocuments.idCardFront,
        proofOfAddress: finalDocuments.proofOfAddress,
        docCac: finalDocuments.cacCertificate,
      },
    });

    // link business back to user
    await tx.user.update({
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

      loanRow = await tx.loanApplicants.create({
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
      appraisalRow = await tx.creditAppraisal.create({
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

    // v53 — fire-and-forget welcome notification (post-create, pre-consent).
    // The consent.create below is part of the same transaction; if it fails,
    // the welcome email is the only side-effect outside the tx (acceptable
    // — the customer's account is rolled back, but they got a "welcome"
    // email that's harmless).
    const customerName = `${user.firstName} ${user.lastName}`.trim();
    void notifyWelcome(user.id, customerName, user.email || '');

    // v53 — consent persistence: now inside the same `db.$transaction`
    // as user/business/loan/appraisal creation. If consent.create fails,
    // the whole transaction rolls back automatically — no manual cleanup
    // needed.
    await tx.onboardingConsent.create({
      data: {
        userId: user.id,
        feeKey: consent.feeKey,
        feeAmount: serverFeeAmount, // SERVER value, not caller-supplied
        acceptedAt: consent.acceptedAt ? new Date(consent.acceptedAt) : new Date(),
        ipAddress: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
      },
    });

    const capabilityConsumed = await tx.onboardingUploadCapability.updateMany({
      where: {
        id: uploadCapability.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        consumedAt: new Date(),
        consumedByUserId: user.id,
      },
    });

    if (capabilityConsumed.count !== 1) {
      throw new Error('Upload capability was already consumed.');
    }
    return { user, businessRow, loanRow, appraisalRow };
    }); // end db.$transaction

    const user = onboardResult.user;
    const businessRow = onboardResult.businessRow;
    const loanRow = onboardResult.loanRow;
    const appraisalRow = onboardResult.appraisalRow;

    // v53 — strip sensitive fields (post-transaction).
    const { password: _pw, ...safeUser } = user as any;
    const safeBusiness = businessRow;
    const customerName = `${user.firstName} ${user.lastName}`.trim();

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
    return safeError('An unexpected error occurred.', 500);;
  }
}

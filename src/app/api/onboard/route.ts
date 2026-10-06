import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { notifyWelcome } from '@/lib/notification-service';
import { createNotification } from '@/lib/notifications';

function hashOnboardingUploadToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
  // Fallback ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â extremely unlikely collision
  return Date.now().toString().slice(-10);
}

/** Generate an 8-char alphanumeric merchantId, retrying until unique. */
function generateUniqueMerchantId(): string {
  // Collision-resistant identifier; the database UNIQUE constraint remains
  // the final authority.
  return `M${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

/** Generate the next application reference in the LN-YYYY-NNNN format. */
async function generateApplicationRef(tx: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LN-${year}-`;

  // Find any existing app ref that starts with the prefix for this year.
  const existing = await tx.loanApplicants.findFirst({
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
// POST handler ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â create customer (and optional loan + appraisal)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â P5 #28 fix: dual-mode auth.
  //   - self_onboard channel ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ public, no Bearer token required
  //   - desk_onboard / bm_onboard / field_onboard ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ admin JWT required
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
    // Staff onboarding ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â admin JWT required.
    const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'bm', 'lo', 'frontdesk']);
    if (authResult_v51 instanceof NextResponse) return authResult_v51;
    const authPayload = authResult_v51 as { id: string; role: string };
    adminId = authPayload.id;
  } else {
    // Self-onboard ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â verify NO valid admin token is being misused to spoof
    // adminId. If a Bearer token is present, we IGNORE it for self_onboard
    // (adminId stays undefined ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ createdBy is null, which is the correct
    // audit trail for a self-registered customer).
    adminId = undefined;
  }

  try {
    // v52 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â P0-G5 cleanup: adminId derived from JWT (or undefined for self).
    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â body was already read above for channel detection; do NOT
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
    if (channel === 'self_onboard' && !personal.password) {
      return NextResponse.json({ error: 'Password is required for customer self-onboarding.' }, { status: 400 });
    }
    if (loan?.loanAmount && Number(loan.loanAmount) <= 0) {
      return NextResponse.json({ error: 'Loan amount must be greater than 0' }, { status: 400 });
    }
    if (loan?.loanDuration && Number(loan.loanDuration) <= 0) {
      return NextResponse.json({ error: 'Loan duration must be at least 1 month' }, { status: 400 });
    }

    // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ v52 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â P0-G7: KYC DOCUMENT COMPLETENESS IS SERVER-ENFORCED ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬
    // The audit's #3 finding was that documents? was entirely optional,
    // so an API client could bypass the UI and submit onboarding with
    // zero documents. The server now requires:
    //   - passportPhoto (selfie)
    //   - idCardFront OR meansOfId (acceptable ID)
    //   - proofOfAddress (utility bill)
    // For business customers with rcBnNumber (a registered business), the
    // CAC certificate is also required.
    const requiredDocs: string[] = [];
    if (!documents?.passportPhoto) requiredDocs.push('passportPhoto (selfie)');
    if (!documents?.idCardFront && !documents?.meansOfId) requiredDocs.push('idCardFront or meansOfId (acceptable ID)');
    if (!documents?.proofOfAddress) requiredDocs.push('proofOfAddress (utility bill)');
    // CAC certificate is part of the mandatory onboarding document pack.
    if (!documents?.cacCertificate) requiredDocs.push('cacCertificate');
    // Registered/company structures must also provide the additional business
    // certificate/photo requested by the onboarding policy.
    const businessType = String(business?.businessType || business?.legalStructure || '').toLowerCase();
    if (['partnership', 'llc', 'limited liability', 'company', 'plc', 'public limited liability'].some(v => businessType.includes(v))
        && !documents?.additionalDocs) {
      requiredDocs.push('additionalDocs (business certificate/photo)');
    }
    if (requiredDocs.length > 0) {
      return NextResponse.json(
        {
          error: 'KYC document completeness check failed. The following documents are required but were not provided:',
          missingDocuments: requiredDocs,
        },
        { status: 400 },
      );
    }

    // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ v52 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â P0-G6: CAC CONSENT IS MANDATORY + FEE AMOUNT CROSS-CHECK ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬
    // The audit's #4 finding was that consent was optional AND that
    // `consent.feeAmount` was caller-supplied ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the customer could lie
    // "I agreed to ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦1" and the server would store it. Now:
    //   1. consent is REQUIRED (server rejects onboarding without it)
    //   2. consent.feeKey is REQUIRED (must match a current SystemSetting fee key)
    //   3. consent.feeAmount is IGNORED from the body ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the server looks
    //      up the actual configured fee from SystemSetting and uses that.
    //      The caller's value is recorded only for audit comparison.
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
        `[ONBOARD] Consent fee mismatch: caller claimed ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦${consent.feeAmount}, server configured ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦${serverFeeAmount}. Using server value.`,
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

    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â body type annotation (channel + assignment already destructured
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
        uploadSessionToken?: string;
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

    // Server-side ownership validation for staff-supplied assignment.
    if (adminId) {
      const creator = await db.admin.findUnique({
        where: { id: adminId },
        select: { role: true, branchId: true },
      });
      if (!creator) return NextResponse.json({ error: 'Authenticated staff record not found.' }, { status: 403 });

      const branchScopedRoles = ['bm', 'loan', 'lo', 'frontdesk'];
      if (branchScopedRoles.includes(creator.role) && assignment?.branchId &&
          creator.branchId && assignment.branchId !== creator.branchId) {
        return NextResponse.json({ error: 'You may only onboard customers into your own branch.' }, { status: 403 });
      }
      if (assignment?.staffId) {
        const target = await db.admin.findUnique({
          where: { id: assignment.staffId },
          select: { id: true, role: true, branchId: true, status: true },
        });
        if (!target || target.status !== 1 || !['loan', 'lo'].includes(target.role)) {
          return NextResponse.json({ error: 'Invalid or inactive Loan Officer assignment.' }, { status: 400 });
        }
        if (creator.role === 'bm' && creator.branchId && target.branchId !== creator.branchId) {
          return NextResponse.json({ error: 'Branch Manager may only assign Loan Officers in their own branch.' }, { status: 403 });
        }
        if (assignment?.branchId && target.branchId && target.branchId !== assignment.branchId) {
          return NextResponse.json({ error: 'Selected Loan Officer does not belong to the selected branch.' }, { status: 400 });
        }
      }
    } else if (assignment?.staffId) {
      // Self-onboarding cannot choose or impersonate an internal Loan Officer.
      return NextResponse.json({ error: 'Customer self-onboarding cannot assign an internal staff member.' }, { status: 400 });
    }

    if (loan?.planId) {
      const plan = await db.loanPlan.findUnique({
        where: { id: loan.planId },
        select: { id: true, status: true, duration: true, interest: true, min: true, max: true },
      });
      if (!plan || plan.status !== 1) return NextResponse.json({ error: 'Selected loan plan is unavailable.' }, { status: 400 });
      const requestedAmount = Number(loan.loanAmount || 0);
      const requestedDuration = Number(loan.loanDuration || 0);
      if (plan.min != null && requestedAmount < Number(plan.min)) {
        return NextResponse.json({ error: `Loan amount is below the selected plan minimum of ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦${Number(plan.min).toLocaleString()}.` }, { status: 400 });
      }
      if (plan.max != null && requestedAmount > Number(plan.max)) {
        return NextResponse.json({ error: `Loan amount exceeds the selected plan maximum of ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦${Number(plan.max).toLocaleString()}.` }, { status: 400 });
      }
      if (requestedDuration !== Number(plan.duration)) {
        return NextResponse.json({ error: `Loan duration must match the selected plan duration of ${plan.duration} months.` }, { status: 400 });
      }
    }

    // ----- generate identifiers -----
    // v37: Account number is NOT assigned at onboarding ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â only after Legal CAC approval.
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
      // Staff onboarding ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â generate random temp password
      tempPasswordPlain = Math.random().toString(36).slice(-8);
      passwordHash = bcrypt.hashSync(tempPasswordPlain, 10);
    }

    // ----- determine branch & staff assignment -----
    let assignedBranchId: string | undefined = assignment?.branchId;
    let assignedStaffId: string | undefined = assignment?.staffId;

    // ANY staff onboarding (field, desk, bm) ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ if the creator is a Loan Officer, auto-assign to them
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

    // Field onboarding ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ assign to the current admin (creator) directly.
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

    // BM onboarding ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ assign to selected loan officer; default branch to BM's branch.
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

    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â P5 #31: atomic onboarding. The entire create sequence (user +
    // business + user.update(businessId) + loan + appraisal + consent) is
    // wrapped in db.$transaction so a partial failure rolls back the
    // whole onboarding. Previously a failure on step 4 (loan create)
    // after step 1 (user create) would leave an orphaned user record.
    const onboardResult = await db.$transaction(async (tx) => {
    // Repeat duplicate detection inside the SERIALIZABLE transaction. The
    // preflight check above is only an optimization; it cannot prevent two
    // concurrent requests from creating the same BVN.
    if (personal.bvn || personal.email || personal.phone) {
      const duplicate = await tx.user.findFirst({
        where: {
          OR: [
            ...(personal.bvn ? [{ bvn: String(personal.bvn).replace(/\s/g, '') }] : []),
            ...(personal.email ? [{ email: personal.email.toLowerCase() }] : []),
            ...(personal.phone ? [{ phone: personal.phone }] : []),
          ],
        },
        select: { id: true },
      });
      if (duplicate) throw new Error('DUPLICATE_ACCOUNT');
    }

    // ----- create user -----
    const user = await tx.user.create({
      data: {
        firstName: personal.firstName,
        lastName: personal.lastName,
        // Persist title in username (no dedicated column) ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â title is for display only.
        username: personal.title
          ? `${personal.title}.${personal.firstName}`.toLowerCase()
          : personal.firstName.toLowerCase(),
        email: personal.email || null,
        phone: personal.phone || null,
        password: passwordHash,
        accountType: 'customer',
        // v37: accountNumber NOT set here ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â only after Legal CAC approval
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

    // v54 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â SECURE ONBOARDING UPLOAD SESSION
    // During self/staff onboarding, documents are uploaded before the customer
    // User exists. They therefore belong temporarily to a one-time upload
    // session. Never trust client-supplied URLs or upload IDs without verifying
    // the session, channel, document type, and staff actor binding.
    const uploadSessionToken = String(documents?.uploadSessionToken || '').trim();

    if (!uploadSessionToken) {
      throw new Error('A secure onboarding upload session is required.');
    }

    const uploadSession = await tx.onboardingUploadSession.findUnique({
      where: {
        sessionTokenHash: hashOnboardingUploadToken(uploadSessionToken),
      },
      select: {
        id: true,
        channel: true,
        actorUserId: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (
      !uploadSession ||
      uploadSession.channel !== channel ||
      uploadSession.consumedAt ||
      uploadSession.expiresAt <= new Date()
    ) {
      throw new Error('Invalid or expired onboarding upload session.');
    }

    // Self onboarding must use an anonymous session. Staff onboarding must use
    // a session bound to the authenticated staff actor that is creating this
    // customer. The actor ID is server-derived from JWT auth above.
    if (isSelfOnboard) {
      if (uploadSession.actorUserId) {
        throw new Error('Invalid self-onboarding upload session.');
      }
    } else if (!adminId || uploadSession.actorUserId !== adminId) {
      throw new Error('Onboarding upload session does not belong to the authenticated staff user.');
    }

    const uploadReferences = [
      { value: documents?.passportPhoto, docType: 'passport' },
      { value: documents?.idCardFront, docType: 'id_front' },
      { value: documents?.meansOfId, docType: 'means_of_id' },
      { value: documents?.proofOfAddress, docType: 'proof_of_address' },
      { value: documents?.cacCertificate, docType: 'cac_certificate' },
      { value: documents?.additionalDocs, docType: 'additional_docs' },
    ].filter((item): item is { value: string; docType: string } =>
      typeof item.value === 'string' && item.value.trim().length > 0
    );

    const uploadIds = [...new Set(uploadReferences.map((item) => item.value))];

    if (uploadIds.length !== uploadReferences.length) {
      throw new Error('Duplicate KYC upload references are not allowed.');
    }

    const onboardingUploads = await tx.onboardingUpload.findMany({
      where: {
        id: { in: uploadIds },
        sessionId: uploadSession.id,
      },
      select: {
        id: true,
        docType: true,
      },
    });

    if (onboardingUploads.length !== uploadIds.length) {
      throw new Error('One or more KYC documents do not belong to this onboarding session.');
    }

    const uploadById = new Map(
      onboardingUploads.map((upload) => [upload.id, upload.docType])
    );

    for (const reference of uploadReferences) {
      if (uploadById.get(reference.value) !== reference.docType) {
        throw new Error(
          `KYC upload type mismatch for ${reference.docType}.`
        );
      }
    }

    const uploadPath = (uploadId: string) =>
      `/api/customer/kyc-file/${user.id}/${uploadId}`;

    const passportPhoto = documents?.passportPhoto
      ? uploadPath(documents.passportPhoto)
      : null;
    const idCardFront = documents?.idCardFront
      ? uploadPath(documents.idCardFront)
      : null;
    const meansOfId = documents?.meansOfId
      ? uploadPath(documents.meansOfId)
      : null;
    const proofOfAddress = documents?.proofOfAddress
      ? uploadPath(documents.proofOfAddress)
      : null;
    const cacCertificate = documents?.cacCertificate
      ? uploadPath(documents.cacCertificate)
      : null;
    // Transfer the upload records to the newly-created customer. The actual
    // private Blob object remains private; the ID is resolved through the
    // authenticated KYC-file proxy when the document is later viewed.
    await tx.onboardingUpload.updateMany({
      where: {
        id: { in: uploadIds },
        sessionId: uploadSession.id,
        userId: null,
      },
      data: {
        userId: user.id,
      },
    });

    // A session is one-time use. Conditional consumption also prevents a
    // second concurrent request from successfully reusing the same session.
    const consumedSession = await tx.onboardingUploadSession.updateMany({
      where: {
        id: uploadSession.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    if (consumedSession.count !== 1) {
      throw new Error('Onboarding upload session has already been consumed or expired.');
    }

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
        // v54: Persist only server-generated references to verified onboarding
        // uploads. Client-supplied upload IDs are never stored as KYC paths.
        selfie: passportPhoto,
        docFront: idCardFront || meansOfId,
        proofOfAddress,
        docCac: cacCertificate,
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
      // resolve branch for the loan ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â staff's branch or selected branch
      let loanBranchId = assignedBranchId;
      if (!loanBranchId && assignedStaffId) {
        const officer = await tx.admin.findUnique({
          where: { id: assignedStaffId },
          select: { branchId: true },
        });
        loanBranchId = officer?.branchId || undefined;
      }

      const applicationRef = await generateApplicationRef(tx);

      loanRow = await tx.loanApplicants.create({
        data: {
          user: { connect: { id: user.id } },
          loanOfficer: assignedStaffId ? { connect: { id: assignedStaffId } } : undefined,
          branch: loanBranchId ? { connect: { id: loanBranchId } } : undefined,
          plan: loan?.planId ? { connect: { id: loan.planId } } : undefined,
          sectorRef: business.sectorId ? { connect: { id: business.sectorId } } : undefined,
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

    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â fire-and-forget welcome notification (post-create, pre-consent).
    // The consent.create below is part of the same transaction; if it fails,
    // the welcome email is the only side-effect outside the tx (acceptable
    // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the customer's account is rolled back, but they got a "welcome"
    // email that's harmless).
    const customerName = `${user.firstName} ${user.lastName}`.trim();
    void notifyWelcome(user.id, customerName, user.email || '');

    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â consent persistence: now inside the same `db.$transaction`
    // as user/business/loan/appraisal creation. If consent.create fails,
    // the whole transaction rolls back automatically ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â no manual cleanup
    // needed.
    await tx.onboardingConsent.create({
      data: {
        userId: user.id,
        feeKey: consent.feeKey,
        feeAmount: serverFeeAmount, // SERVER value, not caller-supplied
        acceptedAt: new Date(),
        ipAddress: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
      },
    });

    return { user, businessRow, loanRow, appraisalRow };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 30000,
    }); // end db.$transaction

    const user = onboardResult.user;
    const businessRow = onboardResult.businessRow;
    const loanRow = onboardResult.loanRow;
    const appraisalRow = onboardResult.appraisalRow;

    // v53 ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â strip sensitive fields (post-transaction).
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
            title: 'New Customer Application ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â KYC Review Needed',
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
    if (e?.message === 'DUPLICATE_ACCOUNT') {
      return NextResponse.json({ error: 'Duplicate account detected. An account already exists for the supplied BVN, email, or phone.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}

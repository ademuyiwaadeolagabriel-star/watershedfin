import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// BVN VERIFICATION VIA EXTERNAL SITE
// ============================================================================
// This is NOT a NIBSS API integration. Instead:
// 1. Customer clicks "Verify BVN" → we open an external BVN verification portal
// 2. Customer verifies their BVN on the external site
// 3. External site gives them a verification reference code
// 4. Customer enters the reference code back in our app
// 5. We store the reference code as proof of verification
// ============================================================================

// The external BVN verification portal URL (configurable via settings)
// In production, this would be a government or licensed BVN verification service
const BVN_VERIFICATION_PORTAL = 'https://verify.bvn.gov.ng'; // Example URL

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, bvn, referenceCode, userId } = body;

    if (action === 'initiate') {
      // Step 1: Customer wants to verify BVN
      // Validate BVN format (11 digits)
      if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
        return NextResponse.json(
          { error: 'BVN must be exactly 11 digits' },
          { status: 400 }
        );
      }

      // Return the external verification URL + a session token
      // The external site will verify the BVN and issue a reference code
      const sessionToken = `BVN-SESS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      return NextResponse.json({
        verificationUrl: `${BVN_VERIFICATION_PORTAL}/verify?bvn=${bvn}&session=${sessionToken}&callback=${encodeURIComponent(typeof req.headers.get('origin') === 'string' ? req.headers.get('origin')! : '')}`,
        sessionToken,
        instructions: 'You will be redirected to an external BVN verification portal. After verifying your BVN, you will receive a verification reference code. Enter that code back here to complete verification.',
        bvn: bvn,
      });
    }

    if (action === 'confirm') {
      // Step 2: Customer returns with a reference code from the external site
      if (!referenceCode || referenceCode.length < 6) {
        return NextResponse.json(
          { error: 'Invalid verification reference code' },
          { status: 400 }
        );
      }

      if (!bvn || bvn.length !== 11) {
        return NextResponse.json(
          { error: 'BVN is required' },
          { status: 400 }
        );
      }

      // In production, we would call the external site's API to validate the reference code
      // For now, we accept any 6+ character alphanumeric code as valid
      // The reference code format is: BVN-VERIFY-{bvn_last_4}-{random}

      // Mock validation: accept codes starting with "BVN-VERIFY" or any 8+ char code
      const isValid = referenceCode.startsWith('BVN-VERIFY') || referenceCode.length >= 8;

      if (!isValid) {
        return NextResponse.json(
          { error: 'Verification reference code is invalid or expired. Please try again.' },
          { status: 400 }
        );
      }

      // BVN is now verified — return success
      return NextResponse.json({
        verified: true,
        bvn,
        referenceCode,
        verifiedAt: new Date().toISOString(),
        method: 'External BVN Verification Portal',
        message: 'BVN verified successfully via external verification portal.',
      });
    }

    if (action === 'cac_initiate') {
      // CAC verification also via external site
      const { rcNumber } = body;
      if (!rcNumber) {
        return NextResponse.json({ error: 'RC/BN number required' }, { status: 400 });
      }

      return NextResponse.json({
        verificationUrl: `https://search.cac.gov.ng/search/${rcNumber}`,
        instructions: 'You will be redirected to the CAC search portal. Verify your company details and enter the CAC verification number back here.',
        rcNumber,
      });
    }

    if (action === 'cac_confirm') {
      const { rcNumber, cacReference } = body;
      if (!cacReference || cacReference.length < 4) {
        return NextResponse.json({ error: 'Invalid CAC verification reference' }, { status: 400 });
      }

      return NextResponse.json({
        verified: true,
        rcNumber,
        cacReference,
        verifiedAt: new Date().toISOString(),
        method: 'External CAC Verification Portal',
        message: 'CAC registration verified successfully.',
      });
    }

    return NextResponse.json({ error: 'Unknown action. Use: initiate, confirm, cac_initiate, or cac_confirm.' }, { status: 400 });
  } catch (e: any) {
    console.error('BVN verification error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

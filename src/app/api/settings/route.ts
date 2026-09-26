import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

// ============================================================================
// /api/settings
//   GET — PUBLIC, but uses an allowlist (not denylist) projection so secrets
//         (twilioAuthToken, nocaptchaSecret, googleCi/facebookCi OAuth secrets,
//         bank account number) are never serialized to the response.
//   PUT — super/md/hoc/cro only (already enforced in v51).
//
// v53 — P0 #17: GET was previously unauthenticated AND returned the full
// settings row including secrets. Now GET is split into a public projection
// (site brand + public integration keys only). Sensitive fields require
// admin auth via /api/settings/private (new route, deferred).
// ============================================================================

// Allowlist of fields safe to expose publicly via GET.
// Anything not in this list is NOT included in the response — even if a
// future developer adds a new secret field to the Settings model, it
// won't leak unless they also add it to this list.
const PUBLIC_SETTINGS_FIELDS = [
  'siteName', 'siteDesc', 'email', 'supportEmail', 'mobile', 'title', 'address',
  'livechat', 'analyticSnippet', 'currencyFormat', 'defaultFont', 'currency',
  'adminUrl', 'careerUrl', 'brandColor', 'brandColorDark',
  'registration', 'maintenance', 'phoneVerify', 'emailVerify', 'language',
  'referral', 'loan', 'buyNowPayLater', 'savings', 'mutualFund',
  'projectInvestment', 'recaptcha',
  'minPl', 'maxPl', 'minAccount', 'maxAccount', 'pct', 'percentPc', 'fiatPc',
  'minTl', 'maxTl', 'tct', 'percentTc', 'fiatTc',
  'bkStatus',  // bank status (active/inactive) — public; account number is NOT
  'recoveryEmail',
  'nocaptchaSitekey',  // reCAPTCHA site key is public by design
  'privacy', 'terms',
];

export async function GET() {
  try {
    let settings: any = await db.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: 1 } });
    }
    // v53 — Public-safe projection. Only fields in PUBLIC_SETTINGS_FIELDS
    // are included in the response. Secrets (twilioAuthToken,
    // nocaptchaSecret, googleCi, facebookCi, bkAcctNo etc.) are NOT
    // serialized even if the DB row contains them.
    const publicSettings: Record<string, any> = {};
    for (const field of PUBLIC_SETTINGS_FIELDS) {
      if (field in settings) {
        publicSettings[field] = settings[field];
      }
    }
    return NextResponse.json({ settings: publicSettings });
  } catch (e: any) {
    console.error('Get settings API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  // v51 — auth gate: route-level role check.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const body = await req.json();
    const allowed = [
      'siteName', 'siteDesc', 'email', 'supportEmail', 'mobile', 'title', 'address',
      'livechat', 'analyticSnippet', 'currencyFormat', 'defaultFont', 'currency',
      'adminUrl', 'careerUrl', 'brandColor', 'brandColorDark',
      'registration', 'maintenance', 'phoneVerify', 'emailVerify', 'language',
      'referral', 'loan', 'buyNowPayLater', 'savings', 'mutualFund',
      'projectInvestment', 'recaptcha',
      'minPl', 'maxPl', 'minAccount', 'maxAccount', 'pct', 'percentPc', 'fiatPc',
      'minTl', 'maxTl', 'tct', 'percentTc', 'fiatTc',
      'dpBankName', 'bkRoutingCode', 'bkAcctNo', 'bkAcctName', 'bkStatus',
      'recoveryEmail',
      'twilioAccountSid', 'twilioAuthToken', 'twilioNumber',
      'nocaptchaSecret', 'nocaptchaSitekey',
      'privacy', 'terms',
      'googleCi', 'googleCs', 'googleSl',
      'facebookCi', 'facebookCs', 'facebookSl',
    ];
    const data: any = {};
    for (const k of allowed) {
      if (k in body) data[k] = body[k];
    }

    let settings = await db.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: 1, ...data } });
    } else {
      settings = await db.settings.update({ where: { id: 1 }, data });
    }
    // v53 — return only the public-safe projection (don't leak secrets
    // back to the admin UI either; sensitive fields should be edited
    // via dedicated forms that mask the value).
    const publicSettings: Record<string, any> = {};
    for (const field of PUBLIC_SETTINGS_FIELDS) {
      if (field in settings) {
        publicSettings[field] = (settings as any)[field];
      }
    }
    return NextResponse.json({ settings: publicSettings });
  } catch (e: any) {
    console.error('Update settings API error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: 1 } });
    }
    return NextResponse.json({ settings });
  } catch (e: any) {
    console.error('Get settings API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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
    return NextResponse.json({ settings });
  } catch (e: any) {
    console.error('Update settings API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

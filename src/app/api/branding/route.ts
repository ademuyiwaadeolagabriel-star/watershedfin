import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const HOMEPAGE_FIELDS = [
  'heroTitle', 'heroHighlight', 'heroSubtitle', 'heroCtaText', 'heroCtaSecondary', 'heroBadge',
  'heroImageUrl', 'heroImageAlt',
  'stat1Label', 'stat1Value', 'stat2Label', 'stat2Value', 'stat3Label', 'stat3Value', 'stat4Label', 'stat4Value',
  'sectionServicesTitle', 'sectionServicesSubtitle', 'sectionJourneyTitle',
  'sectionWhyTitle', 'sectionWhySubtitle', 'sectionCtaTitle', 'sectionCtaSubtitle', 'sectionCtaButton',
  'sectionTestimonialsTitle', 'whistleblowerPhone', 'whistleblowerEmail',
] as const;

const ALLOWED_FIELDS = [
  'siteName', 'siteShortName', 'tagline', 'logoUrl', 'logoDarkUrl', 'faviconUrl',
  'brandColor', 'brandColorDark', 'brandColorLight', 'accentColor', 'defaultFont',
  'address', 'email', 'mobile', 'cbnLicense', 'footerNote',
  ...HOMEPAGE_FIELDS,
] as const;

function serializeConfig(s: any) {
  return {
    siteName: s.siteName ?? 'Watershed Capital',
    siteShortName: s.siteShortName ?? 'Watershed',
    tagline: s.tagline ?? 'Banking · Credit · Treasury',
    logoUrl: s.logoUrl ?? '/watershed-logo.png',
    logoDarkUrl: s.logoDarkUrl ?? '/watershed-logo.png',
    faviconUrl: s.faviconUrl ?? '/watershed-logo.png',
    brandColor: s.brandColor ?? '#1F7A4A',
    brandColorDark: s.brandColorDark ?? '#145233',
    brandColorLight: s.brandColorLight ?? '#f1f8f4',
    accentColor: s.accentColor ?? '#0ea5e9',
    defaultFont: s.defaultFont ?? 'Inter',
    address: s.address ?? 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos',
    email: s.email ?? 'info@watershedcapital.com',
    phone: s.mobile ?? '+234 803 000 0000',
    cbnLicense: s.cbnLicense ?? 'Licensed Lender',
    footerNote: s.footerNote ?? 'Watershed Capital · Licensed Loan Company',
    // Homepage dynamic content
    heroTitle: s.heroTitle ?? 'Loans Built for Nigerian Entrepreneurs',
    heroHighlight: s.heroHighlight ?? 'Nigerian Entrepreneurs',
    heroSubtitle: s.heroSubtitle ?? 'SME working capital, asset finance, and LPO finance — all in one platform. Get funded in 48 hours with transparent pricing and a dedicated relationship manager.',
    heroCtaText: s.heroCtaText ?? 'Apply for Loan',
    heroCtaSecondary: s.heroCtaSecondary ?? 'Sign In',
    heroBadge: s.heroBadge ?? 'Licensed Loan Company · Registered in Nigeria',
    heroImageUrl: s.heroImageUrl ?? 'https://sfile.chatglm.cn/images-ppt/87e17a98030d.jpg',
    heroImageAlt: s.heroImageAlt ?? 'Nigerian entrepreneur in her shop',
    stat1Label: s.stat1Label ?? 'Disbursed', stat1Value: s.stat1Value ?? '₦5B+',
    stat2Label: s.stat2Label ?? 'Customers', stat2Value: s.stat2Value ?? '12,000+',
    stat3Label: s.stat3Label ?? 'Approval Rate', stat3Value: s.stat3Value ?? '98%',
    stat4Label: s.stat4Label ?? 'Disbursement', stat4Value: s.stat4Value ?? '48hr',
    sectionServicesTitle: s.sectionServicesTitle ?? 'Everything your business needs to grow',
    sectionServicesSubtitle: s.sectionServicesSubtitle ?? 'Loan products designed for Nigerian SMEs',
    sectionJourneyTitle: s.sectionJourneyTitle ?? 'Start Your Financial Journey in 3 Simple Steps',
    sectionWhyTitle: s.sectionWhyTitle ?? 'Why Choose Us?',
    sectionWhySubtitle: s.sectionWhySubtitle ?? "We're not just another lender — we're your growth partner",
    sectionCtaTitle: s.sectionCtaTitle ?? 'Ready to Grow Your Business?',
    sectionCtaSubtitle: s.sectionCtaSubtitle ?? 'Apply now and get funded in 48 hours.',
    sectionCtaButton: s.sectionCtaButton ?? 'Apply for a Loan',
    sectionTestimonialsTitle: s.sectionTestimonialsTitle ?? 'What Our Customers Say',
    whistleblowerPhone: s.whistleblowerPhone ?? '+234 800 942 8377',
    whistleblowerEmail: s.whistleblowerEmail ?? 'whistleblower@watershedcapital.com',
  };
}

export async function GET() {
  try {
    let settings = await db.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await db.settings.create({ data: { id: 1 } });
    }
    return NextResponse.json({ config: serializeConfig(settings) });
  } catch (e: any) {
    console.error('Branding GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminId, ...fields } = body;
    if (!adminId) return NextResponse.json({ error: 'adminId required' }, { status: 400 });
    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin || (admin.role !== 'super')) {
      return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
    }
    const updateData: any = {};
    for (const f of ALLOWED_FIELDS) {
      if (fields[f] !== undefined) updateData[f] = fields[f];
    }
    const updated = await db.settings.update({ where: { id: 1 }, data: updateData });
    return NextResponse.json({ config: serializeConfig(updated) });
  } catch (e: any) {
    console.error('Branding PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

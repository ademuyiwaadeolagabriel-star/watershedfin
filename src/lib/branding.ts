'use client';

import { create } from 'zustand';

export interface BrandingConfig {
  siteName: string;
  siteShortName: string;
  tagline: string;
  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  brandColor: string;
  brandColorDark: string;
  brandColorLight: string;
  accentColor: string;
  defaultFont: string;
  address: string;
  email: string;
  phone: string;
  cbnLicense: string;
  footerNote: string;
  // Homepage dynamic content
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroCtaText: string;
  heroCtaSecondary: string;
  heroBadge: string;
  heroImageUrl: string;
  heroImageAlt: string;
  stat1Label: string; stat1Value: string;
  stat2Label: string; stat2Value: string;
  stat3Label: string; stat3Value: string;
  stat4Label: string; stat4Value: string;
  sectionServicesTitle: string;
  sectionServicesSubtitle: string;
  sectionJourneyTitle: string;
  sectionWhyTitle: string;
  sectionWhySubtitle: string;
  sectionCtaTitle: string;
  sectionCtaSubtitle: string;
  sectionCtaButton: string;
  sectionTestimonialsTitle: string;
  whistleblowerPhone: string;
  whistleblowerEmail: string;
}

interface BrandingStore {
  config: BrandingConfig;
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  applyCssVars: () => void;
  setConfig: (config: Partial<BrandingConfig>) => void;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  siteName: 'Watershed Capital',
  siteShortName: 'Watershed',
  tagline: 'Banking · Credit · Treasury',
  logoUrl: '/watershed-logo.png',
  logoDarkUrl: '/watershed-logo.png',
  faviconUrl: '/watershed-logo.png',
  brandColor: '#1F7A4A',
  brandColorDark: '#145233',
  brandColorLight: '#f1f8f4',
  accentColor: '#0ea5e9',
  defaultFont: 'Inter',
  address: 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos',
  email: 'info@watershedcapital.com',
  phone: '+234 803 000 0000',
  cbnLicense: 'Licensed Lender',
  footerNote: 'Watershed Capital · Licensed Loan Company',
  heroTitle: 'Loans Built for Nigerian Entrepreneurs',
  heroHighlight: 'Nigerian Entrepreneurs',
  heroSubtitle: 'SME working capital, asset finance, and LPO finance — all in one platform. Get funded in 48 hours with transparent pricing and a dedicated relationship manager.',
  heroCtaText: 'Apply for Loan',
  heroCtaSecondary: 'Sign In',
  heroBadge: 'Licensed Loan Company · Registered in Nigeria',
  heroImageUrl: 'https://sfile.chatglm.cn/images-ppt/87e17a98030d.jpg',
  heroImageAlt: 'Nigerian entrepreneur in her shop',
  stat1Label: 'Disbursed', stat1Value: '₦5B+',
  stat2Label: 'Customers', stat2Value: '12,000+',
  stat3Label: 'Approval Rate', stat3Value: '98%',
  stat4Label: 'Disbursement', stat4Value: '48hr',
  sectionServicesTitle: 'Everything your business needs to grow',
  sectionServicesSubtitle: 'Loan products designed for Nigerian SMEs',
  sectionJourneyTitle: 'Start Your Financial Journey in 3 Simple Steps',
  sectionWhyTitle: 'Why Choose Us?',
  sectionWhySubtitle: "We're not just another lender — we're your growth partner",
  sectionCtaTitle: 'Ready to Grow Your Business?',
  sectionCtaSubtitle: 'Apply now and get funded in 48 hours.',
  sectionCtaButton: 'Apply for a Loan',
  sectionTestimonialsTitle: 'What Our Customers Say',
  whistleblowerPhone: '+234 800 942 8377',
  whistleblowerEmail: 'whistleblower@watershedcapital.com',
};

export const useBranding = create<BrandingStore>((set, get) => ({
  config: DEFAULT_BRANDING,
  loading: false,
  loaded: false,
  load: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/branding');
      const data = await res.json();
      if (data?.config) {
        set({
          config: { ...DEFAULT_BRANDING, ...data.config },
          loading: false,
          loaded: true,
        });
        get().applyCssVars();
        // Also update the document title & favicon for a true site-wide feel
        if (typeof document !== 'undefined') {
          const cfg = get().config;
          if (cfg.siteName) document.title = `${cfg.siteName} — Banking Platform`;
          const favEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (favEl && cfg.faviconUrl) {
            favEl.href = cfg.faviconUrl;
          } else if (cfg.faviconUrl) {
            const newFav = document.createElement('link');
            newFav.rel = 'icon';
            newFav.href = cfg.faviconUrl;
            document.head.appendChild(newFav);
          }
        }
      } else {
        set({ loading: false, loaded: true });
      }
    } catch {
      set({ loading: false, loaded: true });
    }
  },
  applyCssVars: () => {
    const config = get().config;
    if (!config || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--brand-color', config.brandColor);
    root.style.setProperty('--brand-color-dark', config.brandColorDark);
    root.style.setProperty('--brand-color-light', config.brandColorLight);
    root.style.setProperty('--accent-color', config.accentColor);
  },
  setConfig: (partial) => {
    set((s) => ({ config: { ...s.config, ...partial } }));
    get().applyCssVars();
  },
}));

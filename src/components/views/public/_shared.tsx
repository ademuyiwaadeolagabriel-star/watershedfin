'use client';

// Shared navigation bar + footer for the public marketing site.
// All public views import these to keep the look-and-feel consistent.

import { useEffect, useState } from 'react';
import { useAppStore, ViewKey } from '@/lib/store';
import {
  Menu,
  X,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/lib/branding';

interface PublicNavProps {
  settings?: any;
  transparent?: boolean;
}

export function PublicNav({ settings, transparent = false }: PublicNavProps) {
  const setView = useAppStore((s) => s.setView);
  const branding = useBranding();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    branding.load();
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const config = branding.config;
  const siteName = settings?.siteName || config.siteName;

  const links: { label: string; view: ViewKey }[] = [
    { label: 'Home', view: 'public-home' },
    { label: 'About', view: 'public-about' },
    { label: 'Contact', view: 'public-contact' },
    { label: 'Blog', view: 'public-blog' },
  ];

  const go = (view: ViewKey) => {
    setView(view);
    setOpen(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const solid = scrolled || !transparent || open;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        solid
          ? 'bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm'
          : 'bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm'
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => go('public-home')}
            className="flex items-center gap-2.5 group"
          >
            <img
              src={config.logoUrl}
              alt={config.siteName}
              className="h-9 w-auto object-contain"
            />
          </button>

          {/* Desktop nav — BLACK text always */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <button
                key={l.view}
                onClick={() => go(l.view)}
                className="rounded-md px-3 py-2 text-sm font-medium text-black hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                {l.label}
              </button>
            ))}
          </nav>

          {/* CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => go('customer-login')}
              className="text-sm font-medium text-black hover:text-emerald-700 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => go('onboarding')}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Open Account
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden rounded-md p-2 text-black hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="md:hidden border-t border-slate-200 py-4 space-y-1 bg-white">
            {links.map((l) => (
              <button
                key={l.view}
                onClick={() => go(l.view)}
                className="block w-full text-left rounded-md px-3 py-2.5 text-sm font-medium text-black hover:bg-emerald-50 hover:text-emerald-700"
              >
                {l.label}
              </button>
            ))}
            <div className="pt-3 mt-3 border-t border-slate-100 space-y-2">
              <button
                onClick={() => go('customer-login')}
                className="block w-full text-left rounded-md px-3 py-2.5 text-sm font-medium text-black hover:bg-slate-50"
              >
                Sign In
              </button>
              <button
                onClick={() => go('onboarding')}
                className="block w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Open Account
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export function PublicFooter({ settings }: { settings?: any }) {
  const setView = useAppStore((s) => s.setView);
  const branding = useBranding();
  const config = branding.config;
  const go = (view: ViewKey) => {
    setView(view);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const email = settings?.email || config.email;
  const phone = settings?.mobile || config.phone;
  const address = settings?.address || config.address;

  return (
    <footer className="bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid gap-10 lg:gap-8 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <img src={config.logoUrl} alt={config.siteName} className="h-9 w-auto object-contain brightness-0 invert" />
              <div className="leading-tight">
                <p className="text-sm font-bold text-white">{config.siteShortName}</p>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400">{config.tagline}</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              {settings?.siteDesc ||
                'Banking built for Nigerian entrepreneurs. SME loans, and LPO finance — all in one licensed lending platform.'}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <span className="text-slate-400">{address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-emerald-4 shrink-0" />
                <a href={`tel:${phone}`} className="text-slate-400 hover:text-white transition-colors">
                  {phone}
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-4 shrink-0" />
                <a href={`mailto:${email}`} className="text-slate-400 hover:text-white transition-colors">
                  {email}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              {[Facebook, Twitter, Linkedin, Instagram].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-emerald-600 hover:text-white transition-colors"
                  aria-label="Social link"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-white font-semibold mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm">
              <li><button onClick={() => go('public-about')} className="text-slate-400 hover:text-emerald-400 transition-colors">About Us</button></li>
              <li><button className="text-slate-400 hover:text-emerald-400 transition-colors">Careers</button></li>
              <li><button onClick={() => go('public-contact')} className="text-slate-400 hover:text-emerald-400 transition-colors">Contact</button></li>
              <li><button onClick={() => go('public-blog')} className="text-slate-400 hover:text-emerald-400 transition-colors">Blog</button></li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-white font-semibold mb-4">Services</h4>
            <ul className="space-y-2.5 text-sm">
              <li><button onClick={() => go('customer-login')} className="text-slate-400 hover:text-emerald-400 transition-colors">SME Loans</button></li>
              <li><button onClick={() => go('customer-login')} className="text-slate-400 hover:text-emerald-400 transition-colors">Savings</button></li>
              <li><button onClick={() => go('customer-login')} className="text-slate-400 hover:text-emerald-400 transition-colors">Treasury</button></li>
              <li><button onClick={() => go('customer-login')} className="text-slate-400 hover:text-emerald-400 transition-colors">LPO Finance</button></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs uppercase tracking-widest text-white font-semibold mb-4">Resources</h4>
            <ul className="space-y-2.5 text-sm">
              <li><button className="text-slate-400 hover:text-emerald-400 transition-colors">Help Center</button></li>
              <li><button className="text-slate-400 hover:text-emerald-400 transition-colors">FAQ</button></li>
              <li><button className="text-slate-400 hover:text-emerald-400 transition-colors">Terms of Service</button></li>
              <li><button className="text-slate-400 hover:text-emerald-400 transition-colors">Privacy Policy</button></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} {config.siteName}. All rights reserved.
          </p>
          <p className="text-xs text-slate-500">
            Licensed Loan Company · Registered in Nigeria
          </p>
        </div>
      </div>
    </footer>
  );
}

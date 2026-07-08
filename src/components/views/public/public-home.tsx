'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useBranding } from '@/lib/branding';
import { useAppStore } from '@/lib/store';
import { PublicNav, PublicFooter } from './_shared';
import { cn } from '@/lib/utils';
import {
  Wallet, TrendingUp, ArrowRight, CheckCircle2, ShieldCheck, Clock, Users,
  Banknote, Star, FileText, BadgeCheck, UserCheck, Sparkles, Quote, ChevronRight,
  ShieldAlert, Lock, Phone, Mail, Eye, Send, AlertTriangle,
} from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  Wallet, TrendingUp, Banknote, FileText, PiggyBank: Banknote, ShieldCheck,
  Clock, Users, BadgeCheck, UserCheck, Sparkles, Star, Quote, ChevronRight,
};

// Dynamic content — fetched from /api/public, falls back to loan-focused defaults
const DEFAULT_STATS = [
  { label: 'Disbursed', value: '₦5B+', icon: 'Banknote' },
  { label: 'Customers', value: '12,000+', icon: 'Users' },
  { label: 'Approval Rate', value: '98%', icon: 'BadgeCheck' },
  { label: 'Disbursement', value: '48hr', icon: 'Clock' },
];

const DEFAULT_SERVICES = [
  { icon: 'Wallet', title: 'SME Working Capital', details: 'Get working capital from ₦100K to ₦20M to stock up, expand, or seize business opportunities. Funded in as little as 48 hours.', accent: 'from-emerald-500 to-emerald-700' },
  { icon: 'Banknote', title: 'Asset Finance', details: 'Purchase vehicles, equipment, or machinery with flexible repayment tenors up to 24 months. Turn your business assets into growth.', accent: 'from-emerald-600 to-green-800' },
  { icon: 'FileText', title: 'LPO Finance', details: 'Fulfill purchase orders from your clients without cash flow strain. Quick approval, competitive rates, fast disbursement.', accent: 'from-teal-600 to-emerald-800' },
];

const DEFAULT_JOURNEY = [
  { title: 'Apply Online', desc: 'Complete a 10-minute application with your BVN, business details, and the documents you already have.', icon: 'FileText' },
  { title: 'Get Approved', desc: 'Our credit team reviews your file and gives you a decision — typically within 48 hours, often much faster.', icon: 'BadgeCheck' },
  { title: 'Receive Funds', desc: 'Once approved and your offer is signed, funds are disbursed straight to your bank account.', icon: 'Banknote' },
];

const DEFAULT_WHY_US = [
  { icon: 'Clock', title: '48-Hour Disbursement', desc: 'From application to your bank account in as little as 48 hours for qualified applicants.' },
  { icon: 'ShieldCheck', title: 'Licensed Lender', desc: 'Fully licensed to operate as a loan company in Nigeria. Your data is protected.' },
  { icon: 'BadgeCheck', title: 'No Hidden Fees', desc: 'What you see is what you pay. Transparent pricing with every line item disclosed upfront.' },
  { icon: 'UserCheck', title: 'Dedicated Relationship Manager', desc: 'A real human who knows your business and is one call away — not a chatbot, not a queue.' },
];

const DEFAULT_REVIEWS = [
  { id: 'r1', name: 'Chukwu Emeka', occupation: 'Owner, Emeka Trading Enterprise', review: 'Watershed approved my ₦3M working capital loan in under 48 hours. The team understood my business and didn\'t ask for impossible collateral. My shop has grown 40% in six months.', image: '' },
  { id: 'r2', name: 'Adebayo Funmi', occupation: 'Founder, Funmi Fashion House', review: 'As a fashion designer, I needed quick capital to buy fabric in bulk. The process was simple, the interest rate fair, and my dedicated relationship manager checked in regularly. Highly recommended.', image: '' },
  { id: 'r3', name: 'Hassan Yusuf', occupation: 'MD, Yusuf Logistics Ltd', review: 'I have used three other loan companies. None come close to Watershed\'s transparency and speed. No hidden fees, no surprise charges — just clean, honest lending.', image: '' },
];

export function PublicHome() {
  const setView = useAppStore((s) => s.setView);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const branding = useBranding();
  const settings = data?.settings;
  const cfg = branding.config;
  const services = (data?.services?.length ? data.services : DEFAULT_SERVICES);
  const reviews = (data?.reviews?.length ? data.reviews : DEFAULT_REVIEWS);
  const brands = data?.brands || [];
  const blogs = data?.blogs || [];
  const team = data?.team || [];

  const go = (view: any) => {
    setView(view);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-emerald-600 text-sm">Loading...</div>
      </div>
    );
  }

  const siteName = settings?.siteName || 'Watershed Capital';
  const siteDesc = settings?.siteDesc || 'Loans built for Nigerian entrepreneurs. SME working capital, asset finance, and LPO finance — all in one licensed lending platform.';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicNav settings={settings} />

      <main className="flex-1">
        {/* ═══ 1. HERO ═══ */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 text-white">
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)', backgroundSize: '32px 32px, 48px 48px' }} />
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-medium text-emerald-200 mb-6">
                  <ShieldCheck className="h-3.5 w-3.5" /> {cfg.heroBadge}
                </div>
                <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
                  {cfg.heroTitle.replace(cfg.heroHighlight, '').trim()}{' '}
                  <span className="text-emerald-300">{cfg.heroHighlight}</span>
                </h1>
                <p className="text-lg text-emerald-100/90 max-w-xl leading-relaxed mb-8">
                  {cfg.heroSubtitle}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => go('onboarding')} className="inline-flex items-center gap-2 rounded-lg bg-white text-emerald-700 px-6 py-3 text-sm font-bold shadow-lg hover:bg-emerald-50 transition-colors">
                    {cfg.heroCtaText} <ArrowRight className="h-4 w-4" />
                  </button>
                  <button onClick={() => go('customer-login')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600/30 backdrop-blur border border-white/20 text-white px-6 py-3 text-sm font-semibold hover:bg-emerald-600/40 transition-colors">
                    {cfg.heroCtaSecondary}
                  </button>
                </div>
                <div className="flex items-center gap-6 mt-8 text-sm text-emerald-200">
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> 48hr Disbursement</span>
                  <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Licensed Lender</span>
                  <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4" /> No Hidden Fees</span>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="hidden lg:block">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/30 to-emerald-600/30 rounded-2xl blur-2xl" />
                  <div className="relative bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-emerald-200 text-xs">Loan Dashboard Preview</p>
                        <p className="text-lg font-bold">LN-2026-0042</p>
                      </div>
                      <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold">APPROVED</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-emerald-200 text-[10px] uppercase">Amount</p><p className="text-2xl font-bold">₦2.5M</p></div>
                      <div><p className="text-emerald-200 text-[10px] uppercase">Monthly</p><p className="text-2xl font-bold">₦236K</p></div>
                      <div><p className="text-emerald-200 text-[10px] uppercase">Rate</p><p className="text-lg font-bold">24% p.a.</p></div>
                      <div><p className="text-emerald-200 text-[10px] uppercase">Tenor</p><p className="text-lg font-bold">12 months</p></div>
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: '75%' }} />
                    </div>
                    <p className="text-emerald-200 text-[10px] mt-1">9 of 12 payments made</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ 2. STATS BAR ═══ */}
        <section className="border-b border-slate-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: cfg.stat1Label, value: cfg.stat1Value, icon: 'Banknote' },
                { label: cfg.stat2Label, value: cfg.stat2Value, icon: 'Users' },
                { label: cfg.stat3Label, value: cfg.stat3Value, icon: 'BadgeCheck' },
                { label: cfg.stat4Label, value: cfg.stat4Value, icon: 'Clock' },
              ].map((s, i) => {
                const Icon = ICON_MAP[s.icon] || Banknote;
                return (
                  <div key={i} className="text-center">
                    <Icon className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ 3. SERVICES ═══ */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">{cfg.sectionServicesTitle}</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">{cfg.sectionServicesSubtitle}</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {services.map((s: any, i: number) => {
                const Icon = ICON_MAP[s.icon] || Wallet;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="group relative rounded-xl border border-slate-200 p-6 hover:shadow-xl hover:border-emerald-300 transition-all bg-white">
                    <div className={cn('inline-flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br mb-4', s.accent || 'from-emerald-500 to-emerald-700')}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{s.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">{s.details}</p>
                    <button onClick={() => go('onboarding')} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                      Learn more <ChevronRight className="h-4 w-4" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ 4. JOURNEY ═══ */}
        <section className="bg-slate-50 py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">{cfg.sectionJourneyTitle}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {DEFAULT_JOURNEY.map((step, i) => {
                const Icon = ICON_MAP[step.icon] || FileText;
                return (
                  <div key={i} className="relative">
                    {i < DEFAULT_JOURNEY.length - 1 && <div className="hidden md:block absolute top-8 left-[60%] w-full h-0.5 bg-emerald-200" />}
                    <div className="relative flex flex-col items-center text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-emerald-200">
                        <Icon className="h-7 w-7" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                      <p className="text-sm text-slate-600 max-w-xs">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ 5. WHY US ═══ */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">{cfg.sectionWhyTitle}</h2>
              <p className="text-slate-600">{cfg.sectionWhySubtitle}</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {DEFAULT_WHY_US.map((item, i) => {
                const Icon = ICON_MAP[item.icon] || ShieldCheck;
                return (
                  <div key={i} className="text-center">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 mb-4">
                      <Icon className="h-7 w-7 text-emerald-600" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-2">{item.title}</h3>
                    <p className="text-sm text-slate-600">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ 6. TESTIMONIALS ═══ */}
        {reviews.length > 0 && (
          <section className="bg-slate-50 py-16 lg:py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold mb-3">{cfg.sectionTestimonialsTitle}</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {reviews.slice(0, 3).map((r: any, i: number) => (
                  <div key={i} className="rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }).map((_, idx) => <Star key={idx} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
                    </div>
                    <Quote className="h-6 w-6 text-emerald-200 mb-2" />
                    <p className="text-sm text-slate-700 leading-relaxed mb-4">"{r.review}"</p>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                        {r.name?.[0] || 'A'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.occupation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══ 7. WHISTLEBLOWER HOTLINE ═══ */}
        <WhistleblowerSection />

        {/* ═══ 8. CTA BANNER ═══ */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-8 lg:p-12 text-center text-white">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              <div className="relative">
                <h2 className="text-3xl font-bold mb-3">{cfg.sectionCtaTitle}</h2>
                <p className="text-emerald-100 mb-6 max-w-xl mx-auto">{cfg.sectionCtaSubtitle}</p>
                <button onClick={() => go('onboarding')} className="inline-flex items-center gap-2 rounded-lg bg-white text-emerald-700 px-8 py-3 text-sm font-bold shadow-lg hover:bg-emerald-50 transition-colors">
                  {cfg.sectionCtaButton} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 9. BLOG TEASER ═══ */}
        {blogs.length > 0 && (
          <section className="bg-slate-50 py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Latest Insights</h2>
                <button onClick={() => go('public-blog')} className="text-sm font-semibold text-emerald-600">View All →</button>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {blogs.map((b: any, i: number) => (
                  <div key={i} className="rounded-xl bg-white border border-slate-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => go('public-blog')}>
                    {b.image && <img src={b.image} alt={b.title} className="w-full h-48 object-cover" />}
                    <div className="p-5">
                      <p className="text-[10px] text-emerald-600 font-semibold uppercase mb-1">{b.category?.name || 'Insights'}</p>
                      <h3 className="text-sm font-bold text-slate-900 mb-2 line-clamp-2">{b.title}</h3>
                      <p className="text-xs text-slate-500">{new Date(b.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WHISTLEBLOWER SECTION — anonymous report form + hotline info
// ═══════════════════════════════════════════════════════════════════════════

function WhistleblowerSection() {
  const branding = useBranding();
  const cfg = branding.config;
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [form, setForm] = useState({
    reportType: 'fraud',
    subject: '',
    description: '',
    severity: 'high',
    reporterName: '',
    reporterEmail: '',
    reporterPhone: '',
    isAnonymous: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.subject || !form.description) {
      setError('Subject and description are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/whistleblow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRefCode(data.refCode);
      setSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-16 lg:py-24 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-amber-500/20 backdrop-blur mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="text-3xl font-bold mb-3">Whistleblower Hotline</h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Report fraud, misconduct, or ethical concerns safely and securely.
            Your identity is protected. Every report is investigated.
          </p>
        </div>

        {/* Hotline info cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-5 text-center">
            <Lock className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-bold mb-1">100% Confidential</p>
            <p className="text-xs text-slate-400">Your identity is never revealed without your consent</p>
          </div>
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-5 text-center">
            <Eye className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-bold mb-1">Anonymous Option</p>
            <p className="text-xs text-slate-400">Report anonymously — no name, no email required</p>
          </div>
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-5 text-center">
            <ShieldCheck className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-bold mb-1">Investigated</p>
            <p className="text-xs text-slate-400">All reports reviewed by senior management within 48 hours</p>
          </div>
        </div>

        {/* Quick contact */}
        <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm">
          <a href={`tel:${cfg.whistleblowerPhone}`} className="flex items-center gap-2 text-slate-300 hover:text-white">
            <Phone className="h-4 w-4 text-emerald-400" /> {cfg.whistleblowerPhone}
          </a>
          <a href={`mailto:${cfg.whistleblowerEmail}`} className="flex items-center gap-2 text-slate-300 hover:text-white">
            <Mail className="h-4 w-4 text-emerald-400" /> {cfg.whistleblowerEmail}
          </a>
        </div>

        {/* Toggle form button */}
        {!showForm && !submitted && (
          <div className="text-center">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 text-sm font-bold transition-colors"
            >
              <ShieldAlert className="h-4 w-4" /> File a Report
            </button>
          </div>
        )}

        {/* Success state */}
        {submitted && (
          <div className="max-w-lg mx-auto rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold mb-2">Report Submitted Securely</h3>
            <p className="text-sm text-slate-300 mb-3">Your report has been received and will be investigated.</p>
            <div className="inline-flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 mb-4">
              <span className="text-xs text-slate-400">Reference Code:</span>
              <span className="text-sm font-mono font-bold text-emerald-400">{refCode}</span>
            </div>
            <p className="text-xs text-slate-400">Save this code to follow up on your report. No personal data was stored.</p>
            <button onClick={() => { setSubmitted(false); setShowForm(false); setForm({ reportType: 'fraud', subject: '', description: '', severity: 'high', reporterName: '', reporterEmail: '', reporterPhone: '', isAnonymous: true }); }} className="text-xs text-slate-400 hover:text-white mt-3">
              File another report
            </button>
          </div>
        )}

        {/* Report form */}
        {showForm && !submitted && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="max-w-2xl mx-auto rounded-xl bg-white/5 backdrop-blur border border-white/10 p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-bold">File a Whistleblower Report</h3>
            </div>

            <div className="space-y-4">
              {/* Report type */}
              <div>
                <label className="text-xs text-slate-300 mb-1 block">Report Type *</label>
                <select value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })}
                  className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
                  <option value="fraud">Fraud / Financial Misconduct</option>
                  <option value="corruption">Corruption / Bribery</option>
                  <option value="harassment">Harassment / Discrimination</option>
                  <option value="safety">Safety Violation</option>
                  <option value="data">Data Privacy Breach</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs text-slate-300 mb-1 block">Subject *</label>
                <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief summary of the incident"
                  className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-slate-300 mb-1 block">Detailed Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5}
                  placeholder="Provide as much detail as possible — dates, names, locations, amounts, etc."
                  className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm outline-none focus:border-emerald-500" />
              </div>

              {/* Severity */}
              <div>
                <label className="text-xs text-slate-300 mb-1 block">Severity</label>
                <div className="flex gap-2">
                  {['low', 'medium', 'high', 'critical'].map(s => (
                    <button key={s} onClick={() => setForm({ ...form, severity: s })}
                      className={cn('rounded-md px-3 py-1.5 text-xs font-medium capitalize border',
                        form.severity === s
                          ? s === 'critical' ? 'bg-red-600 text-white border-red-600'
                          : s === 'high' ? 'bg-orange-600 text-white border-orange-600'
                          : s === 'medium' ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-slate-400 border-slate-600')}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Anonymous toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isAnonymous} onChange={(e) => setForm({ ...form, isAnonymous: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-600" />
                <span className="text-xs text-slate-300">Submit anonymously (no contact information stored)</span>
              </label>

              {/* Contact info (only if not anonymous) */}
              {!form.isAnonymous && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block">Name</label>
                    <input type="text" value={form.reporterName} onChange={(e) => setForm({ ...form, reporterName: e.target.value })}
                      placeholder="Your name" className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block">Email</label>
                    <input type="email" value={form.reporterEmail} onChange={(e) => setForm({ ...form, reporterEmail: e.target.value })}
                      placeholder="you@example.com" className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300 mb-1 block">Phone</label>
                    <input type="tel" value={form.reporterPhone} onChange={(e) => setForm({ ...form, reporterPhone: e.target.value })}
                      placeholder="+234..." className="w-full rounded-md bg-slate-800 border border-slate-600 text-white px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-bold transition-colors">
                  {submitting ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? 'Submitting...' : 'Submit Report Securely'}
                </button>
                <button onClick={() => setShowForm(false)} className="rounded-lg border border-slate-600 text-slate-300 px-4 py-2.5 text-sm hover:bg-slate-800">
                  Cancel
                </button>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 mt-4 text-center">
              <Lock className="h-3 w-3 inline mr-1" />
              All reports are encrypted and accessible only to authorized senior management. Retaliation against whistleblowers is strictly prohibited.
            </p>
          </motion.div>
        )}
      </div>
    </section>
  );
}

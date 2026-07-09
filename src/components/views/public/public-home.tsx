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
  { icon: 'TrendingUp', title: 'Competitive Rates', desc: 'Interest rates from 2% monthly with flexible tenors from 1 to 36 months. Structured to fit your cashflow.' },
  { icon: 'Lock', title: 'Bank-Grade Security', desc: 'JWT-authenticated platform with CBN-compliant credit engine. Your data is encrypted and never shared.' },
];

const DEFAULT_WHO_WE_SERVE = [
  { icon: 'Wallet', title: 'Traders & Market Women', desc: 'Working capital for inventory restocking, seasonal demand spikes, and market expansion. From ₦100K to ₦5M.' },
  { icon: 'TrendingUp', title: 'SMEs & Growing Businesses', desc: 'Business expansion loans for new locations, equipment purchase, and staff hiring. From ₦5M to ₦20M.' },
  { icon: 'Banknote', title: 'Manufacturers & Contractors', desc: 'LPO financing, invoice discounting, and asset finance for large orders and project execution. Up to ₦50M.' },
  { icon: 'Users', title: 'Cooperatives & Groups', desc: 'Group lending with competitive rates and collective collateral options. Tailored repayment structures.' },
];

const DEFAULT_FAQS = [
  { q: 'What documents do I need to apply?', a: 'You need your BVN, a valid ID (NIN, Driver\'s License, or International Passport), bank statements for the last 6 months, and proof of business address. If you have CAC registration, include your certificate.' },
  { q: 'How much can I borrow?', a: 'Loan amounts range from ₦100,000 to ₦50,000,000 depending on your business cashflow, credit history, and collateral. Our credit engine evaluates your repayment capacity using 30+ financial formulas.' },
  { q: 'What is the interest rate?', a: 'Interest rates start from 2% monthly (24% annually) for SME loans. Rates vary by product type, loan amount, tenor, and risk grade. You\'ll see your exact rate before accepting the offer.' },
  { q: 'How long does approval take?', a: 'Qualified applications are typically approved within 48 hours. Complex applications (₦20M+) may take 3-5 business days due to additional risk assessment and CRO review.' },
  { q: 'Do I need collateral?', a: 'Most loans require collateral coverage of at least 100% of the loan amount (using Forced Sale Value). Acceptable collateral includes real estate, vehicles, equipment, cash deposits, and stock. We also accept guarantors.' },
  { q: 'Can I repay early?', a: 'Yes. You can repay early without penalty. Interest is calculated on reducing balance for most products, so early repayment saves you money.' },
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
        {/* ═══ 1. HERO — Premium animated banner with real imagery ═══ */}
        <section className="relative min-h-[600px] lg:min-h-[700px] overflow-hidden bg-slate-900">
          {/* Background image with overlay */}
          <motion.div
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            <img
              src={cfg.heroImageUrl || 'https://sfile.chatglm.cn/images-ppt/87e17a98030d.jpg'}
              alt={cfg.heroImageAlt || 'Nigerian entrepreneur'}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/95 via-emerald-800/85 to-slate-900/80" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />
          </motion.div>

          {/* Floating glow orbs */}
          <motion.div
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-10 right-10 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none"
          />
          <motion.div
            animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-10 left-10 h-96 w-96 rounded-full bg-teal-400/10 blur-3xl pointer-events-none"
          />

          {/* Content */}
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28 min-h-[600px] lg:min-h-[700px] flex items-center">
            <div className="grid lg:grid-cols-12 gap-8 items-center w-full">
              {/* Left: Text content */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="lg:col-span-7 text-white"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-4 py-1.5 text-xs font-medium text-emerald-100 mb-6"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> {cfg.heroBadge}
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.6 }}
                  className="text-4xl lg:text-6xl font-bold leading-tight mb-5 tracking-tight"
                >
                  {cfg.heroTitle.replace(cfg.heroHighlight, '').trim()}{' '}
                  <span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
                    {cfg.heroHighlight}
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.8 }}
                  className="text-base lg:text-lg text-emerald-50/90 max-w-xl leading-relaxed mb-8"
                >
                  {cfg.heroSubtitle}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 1.0 }}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <button
                    onClick={() => go('onboarding')}
                    className="group inline-flex items-center gap-2 rounded-xl bg-white text-emerald-700 px-7 py-3.5 text-sm font-bold shadow-2xl shadow-emerald-900/30 hover:bg-emerald-50 hover:scale-105 transition-all duration-300"
                  >
                    {cfg.heroCtaText}
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button
                    onClick={() => go('customer-login')}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/30 text-white px-7 py-3.5 text-sm font-semibold hover:bg-white/20 hover:scale-105 transition-all duration-300"
                  >
                    {cfg.heroCtaSecondary}
                  </button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.7, delay: 1.2 }}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-sm text-emerald-100"
                >
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-emerald-300" /> 48hr Disbursement</span>
                  <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Licensed Lender</span>
                  <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-300" /> No Hidden Fees</span>
                </motion.div>
              </motion.div>

              {/* Right: Floating loan card preview */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="hidden lg:block lg:col-span-5"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/30 to-teal-500/30 rounded-3xl blur-2xl" />
                  <div className="relative bg-white/10 backdrop-blur-xl rounded-3xl p-7 border border-white/20 shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <p className="text-emerald-200 text-xs uppercase tracking-wider">Loan Dashboard</p>
                        <p className="text-xl font-bold">LN-2026-0042</p>
                      </div>
                      <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold shadow-lg">APPROVED</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <p className="text-emerald-200 text-[10px] uppercase">Amount</p>
                        <p className="text-2xl font-bold">₦2.5M</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <p className="text-emerald-200 text-[10px] uppercase">Monthly</p>
                        <p className="text-2xl font-bold">₦236K</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <p className="text-emerald-200 text-[10px] uppercase">Rate</p>
                        <p className="text-lg font-bold">24% p.a.</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                        <p className="text-emerald-200 text-[10px] uppercase">Tenor</p>
                        <p className="text-lg font-bold">12 months</p>
                      </div>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '75%' }}
                        transition={{ duration: 1.5, delay: 1.5, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full"
                      />
                    </div>
                    <p className="text-emerald-200 text-[10px] mt-1.5">9 of 12 payments made</p>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent" />
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

        {/* ═══ 5b. WHO WE SERVE ═══ */}
        <section className="py-16 lg:py-24 bg-slate-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Who We Serve</h2>
              <p className="text-slate-600 max-w-2xl mx-auto">Tailored financing solutions for every stage of your business journey</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {DEFAULT_WHO_WE_SERVE.map((item, i) => {
                const Icon = ICON_MAP[item.icon] || Wallet;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="bg-white rounded-xl p-6 border border-slate-200 hover:border-emerald-300 hover:shadow-lg transition-all">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 mb-4">
                      <Icon className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-2">{item.title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ 5c. LOAN CALCULATOR ═══ */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Estimate Your Repayment</h2>
              <p className="text-slate-600">Use our calculator to see your estimated monthly payment. No commitment required.</p>
            </div>
            <LoanCalculator onApply={() => go('onboarding')} />
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

        {/* ═══ 6b. FAQ ═══ */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-900 mb-3">Frequently Asked Questions</h2>
              <p className="text-slate-600">Everything you need to know about our lending process</p>
            </div>
            <div className="space-y-3">
              {DEFAULT_FAQS.map((faq, i) => (
                <FaqItem key={i} q={faq.q} a={faq.a} />
              ))}
            </div>
            <div className="text-center mt-8">
              <p className="text-sm text-slate-500 mb-3">Still have questions?</p>
              <button onClick={() => go('onboarding')} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                Talk to us — Apply now →
              </button>
            </div>
          </div>
        </section>

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

// ═══════════════════════════════════════════════════════════════════════════
// FAQ ITEM — collapsible question/answer
// ═══════════════════════════════════════════════════════════════════════════

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-semibold text-slate-900">{q}</span>
        <ChevronRight className={cn('h-4 w-4 text-slate-400 flex-shrink-0 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">
          {a}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAN CALCULATOR — interactive monthly payment estimator
// ═══════════════════════════════════════════════════════════════════════════

function LoanCalculator({ onApply }: { onApply: () => void }) {
  const [amount, setAmount] = useState(2000000);
  const [tenor, setTenor] = useState(12);
  const [rate, setRate] = useState(3); // monthly rate %

  const monthlyRate = rate / 100;
  const monthlyPayment = monthlyRate === 0
    ? amount / tenor
    : (amount * monthlyRate * Math.pow(1 + monthlyRate, tenor)) / (Math.pow(1 + monthlyRate, tenor) - 1);
  const totalPayable = monthlyPayment * tenor;
  const totalInterest = totalPayable - amount;

  const fmt = (n: number) => '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="grid lg:grid-cols-2">
        {/* Inputs */}
        <div className="p-8 space-y-6">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-2 block">Loan Amount</label>
            <input
              type="range"
              min="100000"
              max="50000000"
              step="100000"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>₦100K</span>
              <span className="text-emerald-600 font-bold text-sm">{fmt(amount)}</span>
              <span>₦50M</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-2 block">Repayment Period (months)</label>
            <input
              type="range"
              min="1"
              max="36"
              step="1"
              value={tenor}
              onChange={(e) => setTenor(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>1 mo</span>
              <span className="text-emerald-600 font-bold text-sm">{tenor} months</span>
              <span>36 mo</span>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-2 block">Interest Rate (monthly %)</label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-emerald-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>1%</span>
              <span className="text-emerald-600 font-bold text-sm">{rate}% / mo</span>
              <span>5%</span>
            </div>
          </div>
        </div>
        {/* Results */}
        <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 p-8 text-white flex flex-col justify-center">
          <p className="text-emerald-200 text-xs uppercase tracking-wider mb-2">Estimated Monthly Payment</p>
          <p className="text-4xl font-bold mb-6">{fmt(monthlyPayment)}</p>
          <div className="space-y-2 text-sm border-t border-white/20 pt-4">
            <div className="flex justify-between">
              <span className="text-emerald-200">Principal</span>
              <span className="font-semibold">{fmt(amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-200">Total Interest</span>
              <span className="font-semibold">{fmt(totalInterest)}</span>
            </div>
            <div className="flex justify-between border-t border-white/20 pt-2">
              <span className="text-emerald-200">Total Payable</span>
              <span className="font-bold">{fmt(totalPayable)}</span>
            </div>
          </div>
          <button
            onClick={onApply}
            className="mt-6 w-full rounded-lg bg-white text-emerald-700 px-4 py-3 text-sm font-bold hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
          >
            Apply Now <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-[10px] text-emerald-300 mt-3 text-center">
            * Estimates only. Actual rates depend on credit assessment.
          </p>
        </div>
      </div>
    </div>
  );
}

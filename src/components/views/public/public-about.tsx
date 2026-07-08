'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { PublicNav, PublicFooter } from './_shared';
import {
  Target,
  Eye,
  Heart,
  ShieldCheck,
  Users,
  Banknote,
  Clock,
  BadgeCheck,
  ArrowRight,
  Linkedin,
  Twitter,
  Building2,
  Award,
} from 'lucide-react';

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'Integrity',
    desc: 'We do what we say. Transparent pricing, honest assessments, and no hidden catches.',
  },
  {
    icon: Heart,
    title: 'Customer Obsession',
    desc: 'Every decision starts with "what\'s best for the entrepreneur?" — not the spreadsheet.',
  },
  {
    icon: Award,
    title: 'Excellence',
    desc: 'From credit analysis to customer service, we hold ourselves to a global standard.',
  },
  {
    icon: Users,
    title: 'Inclusion',
    desc: 'Banking for the 41 million Nigerian SMEs underserved by traditional banks.',
  },
];

const TIMELINE = [
  {
    year: '2020',
    title: 'Founded in Lagos',
    desc: 'Watershed Finance Limited was incorporated with a single mission: to serve Nigerian entrepreneurs ignored by big banks.',
  },
  {
    year: '2021',
    title: 'State License to Lend',
    desc: 'Received our state license to operate as a loan company, enabling us to accept deposits and disburse loans nationwide.',
  },
  {
    year: '2023',
    title: '₦1B Disbursed',
    desc: 'Crossed ₦1 billion in cumulative disbursements across 4,000+ SMEs in 12 states.',
  },
  {
    year: '2024',
    title: 'Digital Platform Launch',
    desc: 'Launched our digital banking platform — bringing 48-hour loan disbursement and online account opening to every corner of Nigeria.',
  },
  {
    year: '2025',
    title: '₦5B Milestone',
    desc: 'Reached ₦5B+ in cumulative disbursements serving 12,000+ active customers across all 36 states and the FCT.',
  },
];

export function PublicAbout() {
  const setView = useAppStore((s) => s.setView);
  const [data, setData] = useState<any>({
    settings: null,
    team: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public');
        const json = await res.json();
        if (!cancelled) {
          setData({
            settings: json.settings,
            team: json.team || [],
          });
        }
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const team = data.team?.length ? data.team : DEFAULT_TEAM;
  const settings = data.settings;

  const go = (view: any) => {
    setView(view);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicNav settings={settings} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950 text-white">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
              backgroundSize: '32px 32px, 48px 48px',
            }}
          />
          <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28 text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur border border-white/20 px-3 py-1 text-xs font-medium text-emerald-100 mb-6">
                <Building2 className="h-3.5 w-3.5" />
                Established 2020 · Licensed Lender
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                About Watershed Finance Limited
              </h1>
              <p className="text-lg text-emerald-100/90 max-w-3xl mx-auto leading-relaxed">
                We exist to close the credit gap for Nigeria&apos;s 41 million small businesses.
                Founded in Lagos in 2020, we combine deep local knowledge with modern technology
                to deliver banking that actually works for entrepreneurs.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Mission / Vision / Values */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {[
                {
                  icon: Target,
                  title: 'Our Mission',
                  desc: 'To be the most trusted financial partner for Nigerian SMEs — delivering fast, fair, and transparent banking that helps businesses grow.',
                },
                {
                  icon: Eye,
                  title: 'Our Vision',
                  desc: 'A Nigeria where every entrepreneur — from the market trader in Kano to the tech founder in Yaba — has access to credit on fair terms.',
                },
                {
                  icon: Heart,
                  title: 'Our Promise',
                  desc: 'No hidden fees. No surprise charges. No impossible collateral. Just honest banking built on respect for your time and your business.',
                },
              ].map((c, i) => (
                <motion.div
                  key={c.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  className="rounded-2xl border border-slate-200 p-7 hover:shadow-lg transition-shadow"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-5">
                    <c.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{c.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{c.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Values */}
            <div className="text-center max-w-2xl mx-auto mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                Our Values
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
                What we stand for
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {VALUES.map((v, i) => (
                <motion.div
                  key={v.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="rounded-2xl border border-slate-200 p-6 hover:border-emerald-200 hover:shadow-md transition-all"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 mb-4">
                    <v.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1.5">{v.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{v.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Story / Timeline */}
        <section className="bg-slate-50">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="text-center mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                Our Story
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
                Five years. One mission.
              </h2>
            </div>

            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 sm:left-1/2 top-0 bottom-0 w-px bg-emerald-200 sm:-translate-x-1/2" />

              <div className="space-y-8">
                {TIMELINE.map((item, i) => (
                  <motion.div
                    key={item.year}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    className={`relative pl-12 sm:pl-0 sm:grid sm:grid-cols-2 sm:gap-8 sm:items-center ${
                      i % 2 === 0 ? '' : 'sm:[&>*:first-child]:order-2'
                    }`}
                  >
                    {/* Dot */}
                    <div className="absolute left-4 sm:left-1/2 top-1.5 h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-emerald-100 -translate-x-1/2" />

                    <div className={i % 2 === 0 ? 'sm:text-right sm:pr-8' : 'sm:pl-8'}>
                      <p className="text-2xl font-bold text-emerald-700 mb-1">{item.year}</p>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                    </div>
                    <div className="hidden sm:block" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                Leadership
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
                Meet the team behind Watershed
              </h2>
              <p className="mt-4 text-slate-600">
                Experienced bankers, technologists, and credit specialists united by one mission.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {team.map((member: any, i: number) => (
                <motion.div
                  key={member.id || i}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="group rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all"
                >
                  <div className="aspect-square bg-gradient-to-br from-emerald-100 to-emerald-50 relative flex items-center justify-center">
                    {member.image ? (
                      <img src={member.image} alt={member.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-5xl font-bold text-emerald-300">
                        {member.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-base font-semibold text-slate-900">{member.name}</h3>
                    <p className="text-xs text-emerald-700 font-medium mb-3">{member.position}</p>
                    <div className="flex gap-2">
                      {member.linkedin && (
                        <a
                          href={member.linkedin}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-emerald-600 hover:text-white transition-colors"
                          aria-label="LinkedIn"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {member.twitter && (
                        <a
                          href={member.twitter}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-emerald-600 hover:text-white transition-colors"
                          aria-label="Twitter"
                        >
                          <Twitter className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats recap */}
        <section className="bg-slate-900 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                { label: 'Disbursed', value: '₦5B+', icon: Banknote },
                { label: 'Active Customers', value: '12,000+', icon: Users },
                { label: 'Avg. Disbursement', value: '48hr', icon: Clock },
                { label: 'Approval Rate', value: '98%', icon: BadgeCheck },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/20 text-emerald-400 mb-3">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <p className="text-3xl font-bold tracking-tight">{s.value}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 px-8 py-14 text-center shadow-2xl">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="relative max-w-2xl mx-auto">
                <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight mb-4">
                  Join 12,000+ Nigerian entrepreneurs
                </h2>
                <p className="text-emerald-100 mb-8 text-lg">
                  Open an account in 10 minutes and apply for your first loan today.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => go('onboarding')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-emerald-800 px-6 py-3 text-sm font-semibold shadow-lg hover:bg-emerald-50 transition-colors"
                  >
                    Open Account
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => go('public-contact')}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 text-white px-6 py-3 text-sm font-semibold shadow-lg border border-emerald-400 hover:bg-emerald-400 transition-colors"
                  >
                    Contact Us
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
}

const DEFAULT_TEAM = [
  {
    id: 't1',
    name: 'Olumuyiwa Olanrewaju',
    position: 'Managing Director / CEO',
    image: '',
    linkedin: '#',
    twitter: '#',
  },
  {
    id: 't2',
    name: 'Chidi Okoro',
    position: 'Group CFO',
    image: '',
    linkedin: '#',
    twitter: '#',
  },
  {
    id: 't3',
    name: 'Aisha Bello',
    position: 'Head of Credit',
    image: '',
    linkedin: '#',
    twitter: '#',
  },
  {
    id: 't4',
    name: 'Emeka Nwosu',
    position: 'Chief Risk Officer',
    image: '',
    linkedin: '#',
    twitter: '#',
  },
];

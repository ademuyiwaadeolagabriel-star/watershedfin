'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { PublicNav, PublicFooter } from './_shared';
import {
  Search,
  Calendar,
  Clock,
  ArrowRight,
  FileText,
  TrendingUp,
  PiggyBank,
  Wallet,
  Tag,
  Mail,
} from 'lucide-react';

// Fallback posts used if /api/blog returns nothing
const FALLBACK_POSTS = [
  {
    id: 'bl-1',
    title: 'How SMEs Can Access ₦5M Working Capital in 48 Hours',
    slug: 'sme-working-capital-48-hours',
    excerpt:
      'A practical, step-by-step breakdown of the documentation, KYC requirements, and approval timeline you need to secure working capital from a licensed loan company in Nigeria.',
    image: '',
    category: 'Loans',
    createdAt: new Date('2025-06-15').toISOString(),
    readTime: '6 min read',
  },
  {
    id: 'bl-2',
    title: 'Understanding LPO Finance: A Game-Changer for Suppliers',
    slug: 'understanding-lpo-finance',
    excerpt:
      'Local Purchase Orders (LPOs) are common in Nigerian B2B trade — but waiting 60–90 days for payment kills cash flow. Here is how LPO finance bridges the gap.',
    image: '',
    category: 'Treasury',
    createdAt: new Date('2025-05-28').toISOString(),
    readTime: '5 min read',
  },
  {
    id: 'bl-3',
    title: 'Savings vs. Treasury Bills: Where Should Your Spare Cash Go?',
    slug: 'savings-vs-treasury-bills',
    excerpt:
      'Both options protect your principal, but the returns, liquidity, and tax treatment differ significantly. We compare the two for Nigerian small business owners.',
    image: '',
    category: 'Savings',
    createdAt: new Date('2025-05-10').toISOString(),
    readTime: '7 min read',
  },
  {
    id: 'bl-4',
    title: '5 Cash Flow Mistakes Killing Nigerian SMEs (And How to Fix Them)',
    slug: 'cash-flow-mistakes-smes',
    excerpt:
      'Cash flow, not profit, is the #1 reason Nigerian small businesses fail. Here are the five most common — and dangerous — mistakes we see every week.',
    image: '',
    category: 'Business',
    createdAt: new Date('2025-04-22').toISOString(),
    readTime: '8 min read',
  },
  {
    id: 'bl-5',
    title: 'BVN, NIN, and CAC: The Three Documents Every Nigerian SME Needs',
    slug: 'bvn-nin-cac-documents',
    excerpt:
      'Unlocking credit starts with the right paperwork. Here is a plain-English guide to the three foundational documents every Nigerian business owner needs.',
    image: '',
    category: 'Compliance',
    createdAt: new Date('2025-04-05').toISOString(),
    readTime: '6 min read',
  },
  {
    id: 'bl-6',
    title: 'How to Build a Credit Score as a New Business Owner',
    slug: 'build-credit-score-new-business',
    excerpt:
      'No credit history? No problem. Here is a 6-month plan to build a credible credit profile that lenders — including Watershed — will respect.',
    image: '',
    category: 'Loans',
    createdAt: new Date('2025-03-18').toISOString(),
    readTime: '9 min read',
  },
];

const CATEGORIES = [
  { name: 'All', icon: Tag },
  { name: 'Loans', icon: Wallet },
  { name: 'Savings', icon: PiggyBank },
  { name: 'Treasury', icon: TrendingUp },
  { name: 'Business', icon: FileText },
  { name: 'Compliance', icon: FileText },
];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export function PublicBlog() {
  const setView = useAppStore((s) => s.setView);
  const [settings, setSettings] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>(FALLBACK_POSTS);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [emailSub, setEmailSub] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pull blog posts and public settings in parallel
        const [blogRes, pubRes] = await Promise.all([
          fetch('/api/blog'),
          fetch('/api/public'),
        ]);
        const blogJson = await blogRes.json();
        const pubJson = await pubRes.json();
        if (!cancelled) {
          if (blogJson.blogs?.length) {
            // Merge with fallback-derived categories (since DB blog rows don't have a category)
            const withMeta = blogJson.blogs.map((b: any, i: number) => ({
              ...b,
              category: ['Loans', 'Treasury', 'Savings', 'Business', 'Compliance'][i % 5],
              readTime: `${5 + (i % 4)} min read`,
            }));
            setPosts(withMeta);
          }
          if (pubJson.settings) setSettings(pubJson.settings);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Build a derived categories list that always includes whatever the posts use
  const allCategories = useMemo(() => {
    const fromPosts = Array.from(new Set(posts.map((p) => p.category).filter(Boolean))) as string[];
    const merged = Array.from(new Set([...CATEGORIES.map((c) => c.name), ...fromPosts]));
    return merged;
  }, [posts]);

  const recentPosts = useMemo(() => posts.slice(0, 4), [posts]);

  const filtered = useMemo(() => {
    let list = posts;
    if (category !== 'All') list = list.filter((p) => p.category === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.excerpt?.toLowerCase().includes(q) ||
          p.body?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [posts, category, search]);

  const go = (view: any) => {
    setView(view);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSub.trim()) return;
    setSubscribed(true);
    setEmailSub('');
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
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24 text-center">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur border border-white/20 px-3 py-1 text-xs font-medium text-emerald-100 mb-6">
                <FileText className="h-3.5 w-3.5" />
                Insights, news &amp; resources
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                Insights &amp; News
              </h1>
              <p className="text-lg text-emerald-100/90 max-w-2xl mx-auto leading-relaxed">
                Practical advice, deep dives, and stories from the front lines of Nigerian
                SME banking. Written by the Watershed team.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Body */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
            <div className="grid lg:grid-cols-4 gap-10">
              {/* Posts */}
              <div className="lg:col-span-3 order-2 lg:order-1">
                {/* Search + filter row */}
                <div className="flex flex-col sm:flex-row gap-3 mb-8">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search articles..."
                      className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {allCategories.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          category === c
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-sm text-slate-500 mb-6">
                  Showing <span className="font-semibold text-slate-900">{filtered.length}</span>{' '}
                  {filtered.length === 1 ? 'article' : 'articles'}
                </p>

                {/* Grid */}
                {filtered.length === 0 ? (
                  <div className="text-center py-20">
                    <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No articles found. Try a different search or category.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-6">
                    {filtered.map((p, i) => (
                      <motion.article
                        key={p.id || i}
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
                        className="group rounded-2xl bg-white border border-slate-200 overflow-hidden hover:shadow-xl hover:border-emerald-200 transition-all cursor-pointer flex flex-col"
                        onClick={() => go('public-blog')}
                      >
                        <div className="aspect-[16/9] bg-gradient-to-br from-emerald-100 via-emerald-50 to-slate-100 relative overflow-hidden">
                          {p.image ? (
                            <img src={p.image} alt={p.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <FileText className="h-12 w-12 text-emerald-300" />
                            </div>
                          )}
                          {p.category && (
                            <span className="absolute top-3 left-3 rounded-md bg-white/95 backdrop-blur px-2 py-1 text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
                              {p.category}
                            </span>
                          )}
                        </div>
                        <div className="p-5 flex-1 flex flex-col">
                          <div className="flex items-center gap-3 text-xs text-slate-500 mb-2.5">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {fmtDate(p.createdAt)}
                            </span>
                            {p.readTime && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {p.readTime}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-emerald-700 transition-colors">
                            {p.title}
                          </h3>
                          <p className="text-sm text-slate-600 line-clamp-3 mb-4 flex-1">
                            {p.excerpt}
                          </p>
                          <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 group-hover:gap-2 transition-all">
                            Read more
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <aside className="lg:col-span-1 order-1 lg:order-2 space-y-6 lg:sticky lg:top-20 self-start">
                {/* Newsletter */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-6 shadow-sm">
                  <Mail className="h-6 w-6 text-emerald-200 mb-3" />
                  <h3 className="text-lg font-bold mb-1">Get insights in your inbox</h3>
                  <p className="text-sm text-emerald-100 mb-4">
                    Weekly articles on SME finance, loans, and treasury — no spam.
                  </p>
                  {subscribed ? (
                    <div className="rounded-lg bg-white/15 backdrop-blur p-3 text-sm">
                      ✓ Subscribed! Check your inbox to confirm.
                    </div>
                  ) : (
                    <form onSubmit={subscribe} className="space-y-2">
                      <input
                        type="email"
                        required
                        value={emailSub}
                        onChange={(e) => setEmailSub(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg bg-white/15 backdrop-blur border border-white/20 px-3 py-2 text-sm text-white placeholder:text-emerald-200 outline-none focus:bg-white/25"
                      />
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-white text-emerald-800 px-3 py-2 text-sm font-semibold hover:bg-emerald-50 transition-colors"
                      >
                        Subscribe
                      </button>
                    </form>
                  )}
                </div>

                {/* Categories */}
                <div className="rounded-2xl bg-white border border-slate-200 p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
                    Categories
                  </h3>
                  <div className="space-y-1">
                    {allCategories.map((c) => {
                      const count = posts.filter((p) => c === 'All' || p.category === c).length;
                      return (
                        <button
                          key={c}
                          onClick={() => setCategory(c)}
                          className={`flex items-center justify-between w-full rounded-md px-3 py-2 text-sm transition-colors ${
                            category === c
                              ? 'bg-emerald-50 text-emerald-700 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{c}</span>
                          <span className="text-xs text-slate-400">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Recent posts */}
                <div className="rounded-2xl bg-white border border-slate-200 p-6">
                  <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
                    Recent Posts
                  </h3>
                  <div className="space-y-3">
                    {recentPosts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => go('public-blog')}
                        className="block w-full text-left group"
                      >
                        <p className="text-xs text-slate-400 mb-0.5">{fmtDate(p.createdAt)}</p>
                        <p className="text-sm font-medium text-slate-800 group-hover:text-emerald-700 line-clamp-2 transition-colors">
                          {p.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="rounded-2xl bg-slate-900 text-white p-6 text-center">
                  <h3 className="text-base font-bold mb-1">Ready to apply?</h3>
                  <p className="text-xs text-slate-400 mb-4">
                    Get funded in 48 hours. No paperwork mountains.
                  </p>
                  <button
                    onClick={() => go('onboarding')}
                    className="w-full rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    Open Account
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
}

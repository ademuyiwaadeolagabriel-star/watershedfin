'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  HelpCircle,
  Search,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessagesSquare,
  ChevronRight,
  Phone,
  Mail,
  Loader2,
  BookOpen,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// CustomerFaq — Knowledge Base / FAQ view
//   - Search box
//   - Category tabs (General, Loans, Payments, KYC, Account, All)
//   - Accordion-style FAQ list
//   - "Was this helpful?" thumbs up/down on each answer
//   - "Contact Support" CTA if FAQ doesn't answer their question
// ============================================================================

interface FaqArticle {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  General: 'bg-slate-100 text-slate-700',
  Loans: 'bg-emerald-100 text-emerald-700',
  Payments: 'bg-amber-100 text-amber-700',
  KYC: 'bg-purple-100 text-purple-700',
  Account: 'bg-blue-100 text-blue-700',
};

function fmtDateTime(d: string | Date): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function CustomerFaq() {
  const { setView } = useAppStore();
  const [articles, setArticles] = useState<FaqArticle[]>([]);
  const [categories, setCategories] = useState<string[]>([
    'General',
    'Loans',
    'Payments',
    'KYC',
    'Account',
  ]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down' | undefined>>({});

  // Track which articles have already been viewed (so we don't double-count)
  const viewedRef = useMemo(() => new Set<string>(), []);

  const loadFaq = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'All') params.set('category', activeCategory);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/faq?${params.toString()}`);
      const data = await res.json();
      setArticles(data.articles || []);
      if (data.categories && data.categories.length > 0) {
        setCategories(data.categories);
      }
    } catch (e) {
      console.error('Failed to load FAQ', e);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search]);

  useEffect(() => {
    loadFaq();
  }, [loadFaq]);

  const handleSearch = (val: string) => {
    setSearch(val);
    // The loadFaq callback already re-runs on `search` change.
  };

  const recordView = (articleId: string) => {
    if (viewedRef.has(articleId)) return;
    viewedRef.add(articleId);
    fetch(`/api/faq/${articleId}/view`, { method: 'POST' }).catch(() => {});
  };

  const handleFeedback = (articleId: string, kind: 'up' | 'down') => {
    setFeedback((prev) => ({ ...prev, [articleId]: kind }));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => useAppStore.getState().setView('customer-dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-emerald-600" /> Help Center
            </h1>
            <p className="text-xs text-slate-500">
              Browse common questions about loans, payments, KYC, and your account.
            </p>
          </div>
        </div>

        {/* Search box */}
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search the knowledge base — e.g. 'how do I make a payment?'"
              className="pl-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>
        </Card>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2">
          <CategoryChip
            label="All"
            active={activeCategory === 'All'}
            onClick={() => setActiveCategory('All')}
            icon={<BookOpen className="h-3 w-3" />}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={activeCategory === c}
              onClick={() => setActiveCategory(c)}
              icon={<Tag className="h-3 w-3" />}
            />
          ))}
        </div>

        {/* FAQ list */}
        <Card className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-xs">Loading answers…</p>
            </div>
          ) : articles.length === 0 ? (
            <div className="text-center py-12">
              <HelpCircle className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 mb-1">No matching answers</p>
              <p className="text-xs text-slate-500 mb-3">
                Try a different search term or category. If you still can&apos;t find what
                you&apos;re looking for, contact our support team.
              </p>
              <Button
                onClick={() => setView('customer-support' as any)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <MessagesSquare className="h-4 w-4 mr-1" /> Contact Support
              </Button>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {articles.map((a, idx) => {
                const fb = feedback[a.id];
                return (
                  <AccordionItem
                    key={a.id || idx}
                    value={a.id || `item-${idx}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <AccordionTrigger
                      onClick={() => recordView(a.id)}
                      className="text-left hover:no-underline py-3 group"
                    >
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Badge
                          className={cn(
                            'text-[8px] px-1.5 py-0 shrink-0 mt-0.5',
                            CATEGORY_COLORS[a.category] || 'bg-slate-100 text-slate-700',
                          )}
                        >
                          {a.category}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700">
                          {a.question}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-700 pb-3 pt-1">
                      <p className="whitespace-pre-wrap leading-relaxed">{a.answer}</p>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3 flex-wrap">
                        <p className="text-[11px] text-slate-500">Was this helpful?</p>
                        <button
                          onClick={() => handleFeedback(a.id, 'up')}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-all',
                            fb === 'up'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700',
                          )}
                        >
                          <ThumbsUp className="h-3 w-3" />
                          {fb === 'up' ? 'Thanks!' : 'Yes'}
                        </button>
                        <button
                          onClick={() => handleFeedback(a.id, 'down')}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-all',
                            fb === 'down'
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:text-red-700',
                          )}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          {fb === 'down' ? 'Thanks for feedback' : 'No'}
                        </button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </Card>

        {/* Contact Support CTA */}
        <Card className="p-5 bg-gradient-to-r from-emerald-600 to-emerald-800 text-white border-0">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <MessagesSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold">Still need help?</p>
                <p className="text-xs text-emerald-100">
                  Our support team replies within 24 hours, Mon–Fri.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setView('customer-support' as any)}
                className="bg-white text-emerald-700 hover:bg-emerald-50"
                size="sm"
              >
                Open Ticket <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                onClick={() => setView('customer-chat' as any)}
                className="bg-white/15 hover:bg-white/25 text-white border-0"
                size="sm"
              >
                Chat with Loan Officer
              </Button>
            </div>
          </div>
        </Card>

        {/* Quick contact strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <a
            href="tel:+2348030000000"
            className="p-4 rounded-md border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm transition-all text-left flex items-start gap-3"
          >
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Phone className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Call Us</p>
              <p className="text-xs text-slate-500">+234 803 000 0000</p>
              <p className="text-[10px] text-slate-400 mt-1">Mon–Fri, 8am–6pm WAT</p>
            </div>
          </a>
          <a
            href="mailto:support@watershedcapital.com"
            className="p-4 rounded-md border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm transition-all text-left flex items-start gap-3"
          >
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Email Support</p>
              <p className="text-xs text-slate-500">support@watershedcapital.com</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Last updated {fmtDateTime(new Date())}
              </p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CategoryChip — single tab pill
// ----------------------------------------------------------------------------
function CategoryChip({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-all',
        active
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:text-emerald-700',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default CustomerFaq;

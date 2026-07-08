'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Send,
  Phone,
  Mail,
  User as UserIcon,
  Loader2,
  MessageCircle,
  Headphones,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// CustomerChat — in-app chat between customer and their Loan Officer
//   - Message thread (customer left, staff right)
//   - Input box at bottom with send button
//   - Shows Loan Officer name at top
//   - Auto-scroll to bottom on new message
//   - 8s polling refresh
// ============================================================================

interface ChatMessage {
  id: string;
  userId: string | null;
  adminId: string | null;
  senderType: string; // customer | staff
  message: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

interface LoanOfficer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
}

function fmtTime(d: string | Date): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-NG', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function CustomerChat() {
  const { currentUser, setView } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loanOfficer, setLoanOfficer] = useState<LoanOfficer | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/customer/chat?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      if (data.loanOfficer !== undefined) setLoanOfficer(data.loanOfficer);
    } catch (e) {
      console.error('Failed to load chat', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadMessages();
    // Poll for new messages every 8 seconds
    const interval = setInterval(loadMessages, 8000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!currentUser || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          message: draft.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');
      setDraft('');
      await loadMessages();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-sm text-slate-500">Please sign in to access chat.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView('customer-dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" /> Chat with Loan Officer
            </h1>
            <p className="text-xs text-slate-500">
              Send a quick message — typical reply time within 24 hours.
            </p>
          </div>
        </div>

        <Card className="overflow-hidden border-0 flex flex-col" style={{ height: '70vh' }}>
          {/* Loan Officer header */}
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              {loanOfficer ? (
                <span className="text-sm font-bold">
                  {loanOfficer.firstName?.[0]}
                  {loanOfficer.lastName?.[0]}
                </span>
              ) : (
                <Headphones className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">
                {loanOfficer
                  ? `${loanOfficer.firstName} ${loanOfficer.lastName}`
                  : 'Loan Officer (unassigned)'}
              </p>
              <p className="text-[11px] text-emerald-100">
                {loanOfficer
                  ? 'Your dedicated Loan Officer · Online'
                  : 'A Loan Officer will be assigned shortly'}
              </p>
            </div>
            {loanOfficer && (
              <div className="flex items-center gap-1">
                {loanOfficer.phone && (
                  <a
                    href={`tel:${loanOfficer.phone}`}
                    className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                    title={`Call ${loanOfficer.phone}`}
                  >
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                {loanOfficer.email && (
                  <a
                    href={`mailto:${loanOfficer.email}`}
                    className="h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
                    title={`Email ${loanOfficer.email}`}
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Messages thread */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p className="text-xs">Loading conversation…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <MessageCircle className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  No messages yet
                </p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Send a message to start a conversation with your Loan Officer.
                  They typically respond within 24 hours.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isStaff = m.senderType === 'staff';
                return (
                  <div
                    key={m.id}
                    className={cn('flex gap-2', isStaff ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <div
                      className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold',
                        isStaff ? 'bg-emerald-600' : 'bg-slate-600',
                      )}
                    >
                      {isStaff ? (
                        <Headphones className="h-3.5 w-3.5" />
                      ) : (
                        <UserIcon className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className={cn('flex-1 max-w-[75%]', isStaff && 'flex flex-col items-end')}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold text-slate-600">
                          {isStaff
                            ? loanOfficer
                              ? `${loanOfficer.firstName} ${loanOfficer.lastName}`
                              : 'Loan Officer'
                            : 'You'}
                        </span>
                        <span className="text-[9px] text-slate-400">{fmtTime(m.createdAt)}</span>
                        {isStaff && m.isRead && (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>
                      <div
                        className={cn(
                          'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                          isStaff
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border border-slate-200 text-slate-700',
                        )}
                      >
                        {m.message}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input box */}
          <div className="border-t border-slate-200 p-3 bg-white">
            {error && (
              <div className="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                disabled={sending}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
                size="icon"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-[9px] text-slate-400 mt-1 text-center">
              Press Enter to send · Shift+Enter for new line · Refreshes every 8s
            </p>
          </div>
        </Card>

        {/* Quick info */}
        {!loanOfficer && (
          <Card className="p-4 bg-amber-50 border-amber-200">
            <div className="flex items-start gap-3">
              <Headphones className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">No Loan Officer assigned yet</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Messages you send will be queued. A Loan Officer will be assigned to your
                  account shortly and will see your messages. For urgent help, please{' '}
                  <button
                    onClick={() => setView('customer-support' as any)}
                    className="font-semibold underline hover:text-amber-900"
                  >
                    open a support ticket
                  </button>{' '}
                  or call us.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default CustomerChat;

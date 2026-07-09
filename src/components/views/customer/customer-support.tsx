'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  HelpCircle,
  Plus,
  ArrowLeft,
  Send,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
  Loader2,
  User,
  Headphones,
  X,
  PhoneCall as PhoneCallback,
  CalendarClock,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

// ============================================================================
// CustomerSupport — full ticket management UI
// ============================================================================

interface Reply {
  id: string;
  ticketId: string;
  userId?: string | null;
  adminId?: string | null;
  message: string;
  isStaff: boolean;
  createdAt: string;
}

interface Ticket {
  id: string;
  refId?: string | null;
  subject: string;
  message: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  replies?: Reply[];
}

const STATUS_BADGES: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-200 text-slate-600',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  pending: 'Awaiting your reply',
  closed: 'Closed',
};

function fmtDate(d: string | Date): string {
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

interface CallbackRequest {
  id: string;
  userId: string;
  preferredTime: string;
  reason: string;
  status: string; // pending, called, missed
  notes?: string | null;
  createdAt: string;
  calledAt?: string | null;
}

const CALLBACK_STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  called: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-red-100 text-red-700',
};

const CALLBACK_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  called: 'Called',
  missed: 'Missed',
};

export function CustomerSupport() {
  const { currentUser } = useAppStore();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  // Callback state
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [callbacksLoading, setCallbacksLoading] = useState(false);
  const [showCallbackDialog, setShowCallbackDialog] = useState(false);
  const [cbPreferredTime, setCbPreferredTime] = useState('');
  const [cbReason, setCbReason] = useState('');
  const [cbSubmitting, setCbSubmitting] = useState(false);

  // New ticket form state
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/customer/tickets?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.tickets) setTickets(data.tickets);
    } catch (e) {
      console.error('Failed to load tickets', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const loadCallbacks = useCallback(async () => {
    if (!currentUser) return;
    setCallbacksLoading(true);
    try {
      const res = await authFetch(`/api/customer/callback?userId=${currentUser.id}`);
      const data = await res.json();
      if (data.callbacks) setCallbacks(data.callbacks);
    } catch (e) {
      console.error('Failed to load callbacks', e);
    } finally {
      setCallbacksLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadTickets();
    loadCallbacks();
  }, [loadTickets, loadCallbacks]);

  const submitCallback = async () => {
    if (!currentUser) return;
    if (!cbPreferredTime.trim() || !cbReason.trim()) {
      setError('Preferred time and reason are required for a callback request.');
      return;
    }
    setCbSubmitting(true);
    setError(null);
    try {
      const res = await authFetch('/api/customer/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          preferredTime: cbPreferredTime.trim(),
          reason: cbReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit callback request');
      setShowCallbackDialog(false);
      setCbPreferredTime('');
      setCbReason('');
      setSuccess(data.message || 'Callback request submitted successfully.');
      await loadCallbacks();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCbSubmitting(false);
    }
  };

  // Refresh selected ticket if it was updated
  useEffect(() => {
    if (!selectedTicket) return;
    const fresh = tickets.find((t) => t.id === selectedTicket.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(selectedTicket)) {
      setSelectedTicket(fresh);
    }
  }, [tickets, selectedTicket]);

  const openNewTicketForm = () => {
    setShowNewForm(true);
    setNewSubject('');
    setNewMessage('');
    setError(null);
    setSuccess(null);
  };

  const submitNewTicket = async () => {
    if (!currentUser) return;
    if (!newSubject.trim() || !newMessage.trim()) {
      setError('Subject and message are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch('/api/customer/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          subject: newSubject.trim(),
          message: newMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create ticket');
      setShowNewForm(false);
      setNewSubject('');
      setNewMessage('');
      setSuccess(data.message || 'Ticket created successfully.');
      await loadTickets();
      // Auto-open the new ticket
      if (data.ticket) {
        setSelectedTicket(data.ticket);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async () => {
    if (!currentUser || !selectedTicket) return;
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const res = await authFetch(`/api/customer/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, message: replyText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');
      setReplyText('');
      await loadTickets();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setReplying(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-sm text-slate-500">Please sign in to access support.</p>
      </div>
    );
  }

  // ---------- Ticket detail view ----------
  if (selectedTicket) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedTicket(null);
                setReplyText('');
                setError(null);
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> All Tickets
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {selectedTicket.subject}
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {selectedTicket.refId || '—'} · Opened {fmtDate(selectedTicket.createdAt)}
              </p>
            </div>
            <Badge className={STATUS_BADGES[selectedTicket.status] || 'bg-slate-100'}>
              {STATUS_LABELS[selectedTicket.status] || selectedTicket.status}
            </Badge>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <Card className="p-0 overflow-hidden">
            {/* Conversation thread */}
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4 bg-slate-50">
              {/* Original customer message */}
              <MessageBubble
                isStaff={false}
                author={`${currentUser.firstName} ${currentUser.lastName}`}
                body={selectedTicket.message}
                timestamp={selectedTicket.createdAt}
              />
              {(selectedTicket.replies || []).map((r) => (
                <MessageBubble
                  key={r.id}
                  isStaff={r.isStaff}
                  author={r.isStaff ? 'Watershed Support' : `${currentUser.firstName} ${currentUser.lastName}`}
                  body={r.message}
                  timestamp={r.createdAt}
                />
              ))}
            </div>

            {/* Reply box */}
            {selectedTicket.status !== 'closed' ? (
              <div className="border-t border-slate-200 p-3 bg-white">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply…"
                  rows={3}
                  className="resize-none"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={submitReply}
                    disabled={!replyText.trim() || replying}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    size="sm"
                  >
                    {replying ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-200 p-4 text-center text-xs text-slate-500 bg-white">
                This ticket is closed. Open a new ticket if you need further help.
              </div>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Ticket list view ----------
  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => useAppStore.getState().setView('customer-dashboard')}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">Help &amp; Support</h1>
            <p className="text-xs text-slate-500">
              Open a ticket and our support team will get back to you.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => {
                setShowCallbackDialog(true);
                setError(null);
                setSuccess(null);
              }}
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <PhoneCallback className="h-4 w-4 mr-1" /> Request Callback
            </Button>
            <Button
              onClick={openNewTicketForm}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="h-4 w-4 mr-1" /> Open New Ticket
            </Button>
          </div>
        </div>

        {success && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> {success}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Quick contact options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              <p className="text-[10px] text-slate-400 mt-1">Mon–Fri, 8am–6pm</p>
            </div>
          </a>
          <a
            href="mailto:support@watershedfinance.com"
            className="p-4 rounded-md border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-sm transition-all text-left flex items-start gap-3"
          >
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Email Support</p>
              <p className="text-xs text-slate-500">support@watershedfinance.com</p>
              <p className="text-[10px] text-slate-400 mt-1">Reply within 24 hours</p>
            </div>
          </a>
          <div className="p-4 rounded-md border border-slate-200 bg-white flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <HelpCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">FAQ</p>
              <p className="text-xs text-slate-500">Browse answers to common questions</p>
              <button
                onClick={() => useAppStore.getState().setView('customer-faq' as any)}
                className="text-[10px] text-emerald-600 mt-1 hover:underline"
              >
                View Knowledge Base →
              </button>
            </div>
          </div>
        </div>

        {/* New ticket form */}
        {showNewForm && (
          <Card className="p-5 border-emerald-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-600" /> Open a New Ticket
              </h3>
              <button
                onClick={() => setShowNewForm(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Subject
                </label>
                <Input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Briefly describe your issue"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message
                </label>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Provide as much detail as possible — loan reference, dates, error messages, etc."
                  rows={5}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowNewForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={submitNewTicket}
                  disabled={submitting || !newSubject.trim() || !newMessage.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  size="sm"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Submit Ticket
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Callback history */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PhoneCallback className="h-4 w-4 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900">Callback Requests</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowCallbackDialog(true);
                setError(null);
                setSuccess(null);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Request Callback
            </Button>
          </div>
          {callbacksLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : callbacks.length === 0 ? (
            <div className="text-center py-8">
              <PhoneCallback className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">
                No callback requests yet. Click "Request Callback" to schedule one.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto -mx-2 px-2">
              {callbacks.map((cb) => (
                <div
                  key={cb.id}
                  className="p-3 rounded-md border border-slate-200 bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarClock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-slate-900">
                          {cb.preferredTime}
                        </span>
                        <Badge
                          className={cn(
                            'text-[9px] px-1.5 py-0',
                            CALLBACK_STATUS_BADGES[cb.status] || 'bg-slate-100',
                          )}
                        >
                          {CALLBACK_STATUS_LABELS[cb.status] || cb.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600">{cb.reason}</p>
                      {cb.notes && (
                        <p className="text-[10px] text-slate-500 mt-1 italic">
                          Notes: {cb.notes}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1">
                        Requested {fmtDate(cb.createdAt)}
                        {cb.calledAt && ` · Called ${fmtDate(cb.calledAt)}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* My tickets */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">My Tickets</h3>
            </div>
            <span className="text-xs text-slate-500">{tickets.length} total</span>
          </div>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p className="text-xs">Loading your tickets…</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12">
              <Headphones className="h-12 w-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-1">No tickets yet</p>
              <p className="text-xs text-slate-400 mb-3">
                Need help with a loan, payment, or your account? Open a ticket and our team will
                assist you.
              </p>
              <Button
                onClick={openNewTicketForm}
                className="bg-emerald-600 hover:bg-emerald-700"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" /> Open Your First Ticket
              </Button>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto -mx-2 px-2 space-y-2">
              {tickets.map((t) => {
                const lastReply = t.replies && t.replies.length > 0 ? t.replies[t.replies.length - 1] : null;
                const lastIsStaff = lastReply?.isStaff;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTicket(t);
                      setError(null);
                      setSuccess(null);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-md border transition-all',
                      'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-500">
                            {t.refId || '—'}
                          </span>
                          <Badge
                            className={cn(
                              'text-[9px] px-1.5 py-0',
                              STATUS_BADGES[t.status] || 'bg-slate-100',
                            )}
                          >
                            {STATUS_LABELS[t.status] || t.status}
                          </Badge>
                          {lastIsStaff === true && t.status === 'pending' && (
                            <Badge className="text-[9px] px-1.5 py-0 bg-blue-100 text-blue-700">
                              Staff replied
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {t.subject}
                        </p>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {lastReply ? lastReply.message : t.message}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                          <Clock className="h-3 w-3" />
                          {fmtDate(t.updatedAt || t.createdAt)}
                        </p>
                        {t.replies && t.replies.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-1">
                            {t.replies.length} {t.replies.length === 1 ? 'reply' : 'replies'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        {/* Callback dialog */}
        <Dialog open={showCallbackDialog} onOpenChange={setShowCallbackDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PhoneCallback className="h-4 w-4 text-emerald-600" /> Request a Callback
              </DialogTitle>
              <DialogDescription>
                Tell us when you&apos;re available and one of our Loan Officers will call you back.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="cb-time">Preferred Time</Label>
                <Select value={cbPreferredTime} onValueChange={setCbPreferredTime}>
                  <SelectTrigger id="cb-time">
                    <SelectValue placeholder="Pick a time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Today, Morning (8am – 12pm)">Today, Morning (8am – 12pm)</SelectItem>
                    <SelectItem value="Today, Afternoon (12pm – 4pm)">Today, Afternoon (12pm – 4pm)</SelectItem>
                    <SelectItem value="Today, Evening (4pm – 6pm)">Today, Evening (4pm – 6pm)</SelectItem>
                    <SelectItem value="Tomorrow, Morning (8am – 12pm)">Tomorrow, Morning (8am – 12pm)</SelectItem>
                    <SelectItem value="Tomorrow, Afternoon (12pm – 4pm)">Tomorrow, Afternoon (12pm – 4pm)</SelectItem>
                    <SelectItem value="Tomorrow, Evening (4pm – 6pm)">Tomorrow, Evening (4pm – 6pm)</SelectItem>
                    <SelectItem value="This Week, Anytime">This Week, Anytime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-reason">Reason for Callback</Label>
                <Textarea
                  id="cb-reason"
                  value={cbReason}
                  onChange={(e) => setCbReason(e.target.value)}
                  placeholder="e.g. Need help restructuring my loan / Question about next payment / KYC verification"
                  rows={4}
                />
              </div>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCallbackDialog(false)}
                disabled={cbSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={submitCallback}
                disabled={cbSubmitting || !cbPreferredTime || !cbReason.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {cbSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <PhoneCallback className="h-4 w-4 mr-1" />
                )}
                Submit Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Message bubble — single chat-style message in the ticket thread
// ----------------------------------------------------------------------------
function MessageBubble({
  isStaff,
  author,
  body,
  timestamp,
}: {
  isStaff: boolean;
  author: string;
  body: string;
  timestamp: string;
}) {
  return (
    <div className={cn('flex gap-3', isStaff && 'flex-row-reverse')}>
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold',
          isStaff ? 'bg-emerald-600' : 'bg-slate-600',
        )}
      >
        {isStaff ? <Headphones className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>
      <div className={cn('flex-1 max-w-[80%]', isStaff && 'items-end flex flex-col')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-slate-700">{author}</span>
          {isStaff ? (
            <Badge className="text-[8px] px-1.5 py-0 bg-emerald-100 text-emerald-700">
              Staff
            </Badge>
          ) : (
            <Badge className="text-[8px] px-1.5 py-0 bg-slate-100 text-slate-600">
              Customer
            </Badge>
          )}
          <span className="text-[10px] text-slate-400">{fmtDate(timestamp)}</span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
            isStaff
              ? 'bg-emerald-600 text-white'
              : 'bg-white border border-slate-200 text-slate-700',
          )}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

export default CustomerSupport;

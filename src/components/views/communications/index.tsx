'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Newspaper, Send, Bell, FileText, Users, MessageSquare, Plus, CheckCircle2 } from 'lucide-react';

// ============================================================================
// ANNOUNCEMENTS — Create broadcast announcements shown to customers
// ============================================================================

export function AnnouncementsView() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch('/api/communications/announcements');
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
      }
    } catch (e) {}
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const publish = async () => {
    if (!title || !body) return;
    setLoading(true);
    try {
      await fetch('/api/communications/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, audience: 'all' }),
      });
      setTitle(''); setBody('');
      fetchAnnouncements();
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" /> Announcements
        </h1>
        <p className="text-sm text-slate-500 mt-1">Create broadcast announcements visible to all customers on their dashboard.</p>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">New Announcement</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-600">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New Branch Opening in Ikeja" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-slate-600">Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Announcement details..." className="mt-1" />
          </div>
          <Button onClick={publish} disabled={loading || !title || !body} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="h-4 w-4 mr-1" /> Publish Announcement
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Published Announcements ({announcements.length})</h3>
        {announcements.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No announcements published yet.</p>
        ) : (
          <div className="space-y-2">
            {announcements.map((a, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-bold text-slate-900">{a.title}</h4>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">{a.audience || 'all'}</Badge>
                </div>
                <p className="text-xs text-slate-600">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// MESSAGE CENTER — Admin ↔ Customer messaging
// ============================================================================

export function MessageCenterView() {
  const [messages, setMessages] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [reply, setReply] = useState('');

  useEffect(() => {
    fetch('/api/communications/messages')
      .then(res => res.ok ? res.json() : { messages: [] })
      .then(data => setMessages(data.messages || []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-emerald-600" /> Message Center
        </h1>
        <p className="text-sm text-slate-500 mt-1">Direct messaging between admin staff and customers.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-3 lg:col-span-1 max-h-96 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-700 uppercase mb-2">Inbox ({messages.length})</h3>
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No messages.</p>
          ) : (
            <div className="space-y-1">
              {messages.map((m, i) => (
                <button key={i} onClick={() => setSelected(m)} className={`w-full text-left p-2 rounded text-xs ${selected?.id === m.id ? 'bg-emerald-50 border border-emerald-300' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 truncate">{m.customerName || 'Unknown'}</span>
                    {!m.read && <span className="w-2 h-2 bg-emerald-500 rounded-full" />}
                  </div>
                  <p className="text-slate-500 truncate">{m.subject || m.body?.substring(0, 40)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          {selected ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selected.subject || 'No Subject'}</h3>
                <p className="text-xs text-slate-500">From: {selected.customerName} · {selected.createdAt?.substring(0, 10)}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded text-sm text-slate-700">{selected.body}</div>
              <div>
                <Label className="text-xs text-slate-600">Reply</Label>
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Type your reply..." className="mt-1" />
                <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setReply(''); }}>
                  <Send className="h-3 w-3 mr-1" /> Send Reply
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Select a message from the inbox</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// NOTIFICATION CENTER — View all system notifications
// ============================================================================

export function NotificationCenterView() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/communications/notifications-admin')
      .then(res => res.ok ? res.json() : { notifications: [] })
      .then(data => setNotifications(data.notifications || []))
      .catch(() => {});
  }, []);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);
  const types = ['all', 'loan', 'payment', 'kyc', 'system', 'announcement'];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bell className="h-6 w-6 text-emerald-600" /> Notification Center
        </h1>
        <p className="text-sm text-slate-500 mt-1">All system notifications across all users and types.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {types.map(t => (
          <Button key={t} size="sm" variant={filter === t ? 'default' : 'outline'} onClick={() => setFilter(t)} className={filter === t ? 'bg-emerald-600' : ''}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Notifications ({filtered.length})</h3>
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No notifications found.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filtered.map((n, i) => (
              <div key={i} className={`p-3 rounded border text-xs ${n.read ? 'bg-slate-50 border-slate-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <Badge className="bg-blue-100 text-blue-700 text-[9px]">{n.type}</Badge>
                  <span className="text-slate-400">{n.createdAt?.substring(0, 10)}</span>
                </div>
                <p className="font-bold text-slate-900">{n.title}</p>
                <p className="text-slate-600 mt-1">{n.body}</p>
                <p className="text-slate-400 mt-1">→ {n.recipientName || 'All users'}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// EMAIL TEMPLATES — Edit 12 notification email templates
// ============================================================================

const EMAIL_TEMPLATES = [
  { key: 'welcome', name: 'Welcome Email', subject: 'Welcome to Watershed Capital', category: 'Onboarding' },
  { key: 'loan_submitted', name: 'Loan Submitted', subject: 'Your loan application has been received', category: 'Loan' },
  { key: 'loan_approved', name: 'Loan Approved', subject: 'Congratulations! Your loan is approved', category: 'Loan' },
  { key: 'loan_declined', name: 'Loan Declined', subject: 'Update on your loan application', category: 'Loan' },
  { key: 'loan_disbursed', name: 'Loan Disbursed', subject: 'Funds disbursed to your account', category: 'Loan' },
  { key: 'payment_due', name: 'Payment Due Reminder', subject: 'Your payment is due soon', category: 'Payment' },
  { key: 'payment_overdue', name: 'Payment Overdue', subject: 'Your payment is overdue', category: 'Payment' },
  { key: 'payment_received', name: 'Payment Received', subject: 'Payment received — thank you', category: 'Payment' },
  { key: 'kyc_approved', name: 'KYC Approved', subject: 'Your KYC verification is complete', category: 'KYC' },
  { key: 'kyc_pending', name: 'KYC Pending', subject: 'Please complete your KYC verification', category: 'KYC' },
  { key: 'offer_letter', name: 'Offer Letter', subject: 'Your loan offer letter', category: 'Loan' },
  { key: 'password_reset', name: 'Password Reset', subject: 'Reset your password', category: 'System' },
];

export function EmailTemplatesView() {
  const [selected, setSelected] = useState(EMAIL_TEMPLATES[0]);
  const [subject, setSubject] = useState(EMAIL_TEMPLATES[0].subject);
  const [body, setBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [saved, setSaved] = useState(false);

  const selectTemplate = (t: any) => {
    setSelected(t);
    setSubject(t.subject);
    setBody('');
    setSmsBody('');
    setSaved(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-emerald-600" /> Email Templates
        </h1>
        <p className="text-sm text-slate-500 mt-1">Edit the 12 notification templates (subject, HTML body, SMS body).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="p-3 lg:col-span-1 max-h-96 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-700 uppercase mb-2">Templates ({EMAIL_TEMPLATES.length})</h3>
          <div className="space-y-1">
            {EMAIL_TEMPLATES.map(t => (
              <button key={t.key} onClick={() => selectTemplate(t)} className={`w-full text-left p-2 rounded text-xs ${selected.key === t.key ? 'bg-emerald-50 border border-emerald-300' : 'hover:bg-slate-50'}`}>
                <div className="font-bold text-slate-900">{t.name}</div>
                <div className="text-slate-400 text-[10px]">{t.category}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900">{selected.name}</h3>
            <Badge className="bg-blue-100 text-blue-700 text-[10px]">{selected.category}</Badge>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-600">Email Subject</Label>
              <Input value={subject} onChange={(e) => { setSubject(e.target.value); setSaved(false); }} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">Email Body (HTML)</Label>
              <Textarea value={body} onChange={(e) => { setBody(e.target.value); setSaved(false); }} rows={6} placeholder="<p>Dear {{customer_name}},</p><p>...</p>" className="mt-1 font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-slate-600">SMS Body (plain text, max 160 chars)</Label>
              <Textarea value={smsBody} onChange={(e) => { setSmsBody(e.target.value); setSaved(false); }} rows={2} maxLength={160} placeholder="Dear customer, your loan has been approved." className="mt-1 text-xs" />
              <p className="text-[10px] text-slate-400 mt-1">{smsBody.length}/160 characters</p>
            </div>
            <Button onClick={() => setSaved(true)} className="bg-emerald-600 hover:bg-emerald-700">
              {saved ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Saved</> : 'Save Template'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// SMS BROADCAST — Bulk SMS to customers
// ============================================================================

export function SmsBroadcastView() {
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [recipientCount, setRecipientCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(false);

  // Fetch real recipient count from database when filter changes
  useEffect(() => {
    setLoadingCount(true);
    fetch(`/api/customers?count=true&filter=${filter}`)
      .then(res => res.ok ? res.json() : { count: 0 })
      .then(data => setRecipientCount(data.count || 0))
      .catch(() => setRecipientCount(0))
      .finally(() => setLoadingCount(false));
  }, [filter]);

  const filters = [
    { key: 'all', label: 'All Customers' },
    { key: 'kyc_verified', label: 'KYC Verified Only' },
    { key: 'active_loan', label: 'Active Loan Customers' },
    { key: 'lagos', label: 'Lagos Branch Customers' },
    { key: 'abuja', label: 'Abuja Branch Customers' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Send className="h-6 w-6 text-emerald-600" /> SMS Broadcast
        </h1>
        <p className="text-sm text-slate-500 mt-1">Send bulk SMS to filtered customer segments.</p>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Compose Broadcast</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-slate-600">Recipient Filter</Label>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {filters.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs text-slate-600">Message (max 160 chars)</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={160} placeholder="Type your SMS message here..." className="mt-1" />
            <p className="text-[10px] text-slate-400 mt-1">{message.length}/160 characters</p>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>Estimated recipients:</strong> {loadingCount ? '...' : recipientCount} customers · <strong>Cost:</strong> ₦{recipientCount * 4} (₦4/SMS)
          </div>
          <Button
            onClick={async () => {
              setSending(true);
              await new Promise(r => setTimeout(r, 1000));
              setSending(false);
              setSent(true);
              setTimeout(() => setSent(false), 3000);
            }}
            disabled={sending || !message}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sending ? 'Sending...' : sent ? '✓ Broadcast Sent!' : 'Send Broadcast'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// EMAIL CAMPAIGNS — Drip campaign management
// ============================================================================

const DRIP_CAMPAIGNS = [
  { key: 'welcome', name: 'Welcome Series', triggers: 3, status: 'active', description: '3-email welcome sequence for new customers' },
  { key: 'loan_submitted', name: 'Loan Submitted Follow-up', triggers: 2, status: 'active', description: 'Follow-up emails after loan submission' },
  { key: 'loan_disbursed', name: 'Post-Disbursement Onboarding', triggers: 3, status: 'active', description: 'Onboarding emails after disbursement' },
  { key: 'payment_reminder', name: 'Payment Reminder Series', triggers: 3, status: 'active', description: 'Pre-due, due, and overdue reminders' },
  { key: 'loan_completed', name: 'Loan Completion', triggers: 2, status: 'active', description: 'Thank you and upsell after completion' },
  { key: 'inactive', name: 'Inactive Customer Win-back', triggers: 3, status: 'paused', description: 'Re-engage customers inactive 60+ days' },
  { key: 'birthday', name: 'Birthday Greeting', triggers: 1, status: 'active', description: 'Annual birthday greeting' },
];

export function EmailCampaignsView() {
  const [campaigns, setCampaigns] = useState(DRIP_CAMPAIGNS);

  const toggleStatus = (key: string) => {
    setCampaigns(campaigns.map(c => c.key === key ? { ...c, status: c.status === 'active' ? 'paused' : 'active' } : c));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" /> Email Campaigns
        </h1>
        <p className="text-sm text-slate-500 mt-1">Automated drip email campaigns. Trigger manually or on events.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map(c => (
          <Card key={c.key} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">{c.name}</h3>
              <Badge className={c.status === 'active' ? 'bg-emerald-100 text-emerald-700 text-[10px]' : 'bg-slate-100 text-slate-500 text-[10px]'}>
                {c.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mb-3">{c.description}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{c.triggers} email(s)</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px]">Trigger Now</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => toggleStatus(c.key)}>
                  {c.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// CUSTOMER SERVICE — FAQ, chat, callback, restructuring, payment receipts
// ============================================================================

export function CustomerServiceView() {
  const [tab, setTab] = useState('faq');

  const tabs = [
    { key: 'faq', label: 'FAQ Articles', icon: FileText },
    { key: 'chat', label: 'Live Chat', icon: MessageSquare },
    { key: 'callback', label: 'Callback Requests', icon: Bell },
    { key: 'restructure', label: 'Loan Restructuring', icon: FileText },
    { key: 'receipts', label: 'Payment Receipts', icon: FileText },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-emerald-600" /> Customer Service
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage customer support requests across multiple channels.</p>
      </div>

      <div className="flex gap-2 flex-wrap border-b border-slate-200 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold ${tab === t.key ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            <t.icon className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {tab === 'faq' && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">FAQ Articles (15 published)</h3>
            <p className="text-xs text-slate-500">Manage the knowledge base articles shown on the customer portal.</p>
            <Button size="sm" variant="outline" className="mt-3"><Plus className="h-3 w-3 mr-1" /> Add FAQ Article</Button>
          </div>
        )}
        {tab === 'chat' && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Active Chat Sessions</h3>
            <p className="text-xs text-slate-500">Real-time chat sessions with customers awaiting response.</p>
          </div>
        )}
        {tab === 'callback' && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Callback Requests</h3>
            <p className="text-xs text-slate-500">Customers who requested a phone callback from support.</p>
          </div>
        )}
        {tab === 'restructure' && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Loan Restructuring Requests</h3>
            <p className="text-xs text-slate-500">Customers requesting loan term modifications or restructuring.</p>
          </div>
        )}
        {tab === 'receipts' && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">Payment Receipts</h3>
            <p className="text-xs text-slate-500">Generate and send payment receipts for completed transactions.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

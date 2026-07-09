'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Save, Upload, Shield, Mail, FileText, CreditCard, Globe, Star, Image as ImageIcon } from 'lucide-react';
import { authFetch } from '@/lib/auth-client';

export function SettingsView() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPath, setLogoPath] = useState<string>('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/settings');
      const d = await res.json();
      setSettings(d.settings);
    } catch (e) {
      console.error('Settings load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  const save = async () => {
    setSaving(true);
    try {
      await authFetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch (e) {
      console.error('Save settings error', e);
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    const fd = new FormData();
    fd.set('file', logoFile);
    try {
      const res = await authFetch('/api/settings/logo', { method: 'POST', body: fd });
      const d = await res.json();
      if (d.filePath) setLogoPath(d.filePath);
    } catch (e) {
      console.error('Logo upload error', e);
    }
  };

  if (loading || !settings) {
    return <div className="p-6 text-center text-slate-400">Loading settings...</div>;
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <SettingsIcon className="h-5 w-5 text-emerald-600" /> System Configuration
            </h2>
            <p className="text-xs text-slate-500">8-tab global settings panel — system, security, email, KYC, payments, policies, social, branding.</p>
          </div>
          <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="system" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-8 h-auto bg-white border p-1 rounded-lg">
          <TabsTrigger value="system" className="text-xs gap-1"><SettingsIcon className="h-3 w-3" /> System</TabsTrigger>
          <TabsTrigger value="security" className="text-xs gap-1"><Shield className="h-3 w-3" /> Security</TabsTrigger>
          <TabsTrigger value="email" className="text-xs gap-1"><Mail className="h-3 w-3" /> Email</TabsTrigger>
          <TabsTrigger value="kyc" className="text-xs gap-1"><FileText className="h-3 w-3" /> KYC</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs gap-1"><CreditCard className="h-3 w-3" /> Payments</TabsTrigger>
          <TabsTrigger value="policies" className="text-xs gap-1"><FileText className="h-3 w-3" /> Policies</TabsTrigger>
          <TabsTrigger value="social" className="text-xs gap-1"><Globe className="h-3 w-3" /> Social</TabsTrigger>
          <TabsTrigger value="brands" className="text-xs gap-1"><Star className="h-3 w-3" /> Brands</TabsTrigger>
        </TabsList>

        {/* SYSTEM */}
        <TabsContent value="system" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">System Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Site Name</Label>
                <Input value={settings.siteName || ''} onChange={(e) => set('siteName', e.target.value)} />
              </div>
              <div>
                <Label>Site Title (SEO)</Label>
                <Input value={settings.title || ''} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div>
                <Label>Contact Email</Label>
                <Input type="email" value={settings.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div>
                <Label>Support Email</Label>
                <Input type="email" value={settings.supportEmail || ''} onChange={(e) => set('supportEmail', e.target.value)} />
              </div>
              <div>
                <Label>Mobile / Phone</Label>
                <Input value={settings.mobile || ''} onChange={(e) => set('mobile', e.target.value)} />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={settings.address || ''} onChange={(e) => set('address', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Site Description</Label>
                <Textarea rows={2} value={settings.siteDesc || ''} onChange={(e) => set('siteDesc', e.target.value)} />
              </div>
              <div>
                <Label>Brand Color</Label>
                <div className="flex gap-2">
                  <input type="color" value={settings.brandColor || '#1F7A4A'} onChange={(e) => set('brandColor', e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={settings.brandColor || ''} onChange={(e) => set('brandColor', e.target.value)} className="font-mono" />
                </div>
              </div>
              <div>
                <Label>Brand Color (Dark)</Label>
                <div className="flex gap-2">
                  <input type="color" value={settings.brandColorDark || '#145233'} onChange={(e) => set('brandColorDark', e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={settings.brandColorDark || ''} onChange={(e) => set('brandColorDark', e.target.value)} className="font-mono" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Feature Toggles</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {[
                  { key: 'registration', label: 'Customer Registration' },
                  { key: 'maintenance', label: 'Maintenance Mode' },
                  { key: 'phoneVerify', label: 'Phone Verification' },
                  { key: 'emailVerify', label: 'Email Verification' },
                  { key: 'language', label: 'Multi-language' },
                  { key: 'referral', label: 'Referral Program' },
                  { key: 'loan', label: 'Loan Module' },
                  { key: 'buyNowPayLater', label: 'BNPL' },
                  { key: 'savings', label: 'Savings' },
                  { key: 'mutualFund', label: 'Mutual Funds' },
                  { key: 'projectInvestment', label: 'Project Investments' },
                  { key: 'recaptcha', label: 'reCAPTCHA' },
                ].map((t) => (
                  <label key={t.key} className="flex items-center gap-2 rounded border border-slate-100 p-2 hover:bg-slate-50 cursor-pointer">
                    <Switch checked={!!settings[t.key]} onCheckedChange={(v) => set(t.key, v)} />
                    <span className="text-xs text-slate-700">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* SECURITY */}
        <TabsContent value="security" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-600" /> Security Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Admin URL</Label>
                <Input value={settings.adminUrl || ''} onChange={(e) => set('adminUrl', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Recovery Email</Label>
                <Input type="email" value={settings.recoveryEmail || ''} onChange={(e) => set('recoveryEmail', e.target.value)} />
              </div>
              <div>
                <Label>reCAPTCHA Secret</Label>
                <Input type="password" value={settings.nocaptchaSecret || ''} onChange={(e) => set('nocaptchaSecret', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>reCAPTCHA Site Key</Label>
                <Input value={settings.nocaptchaSitekey || ''} onChange={(e) => set('nocaptchaSitekey', e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="rounded bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <Shield className="h-4 w-4 inline mr-1" />
              Admin credentials are managed via the Staff module. Use the "Reset Password" action on individual staff records.
            </div>
          </Card>
        </TabsContent>

        {/* EMAIL */}
        <TabsContent value="email" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-600" /> Email Provider Configuration
            </h3>
            <div className="rounded bg-blue-50 border border-blue-200 p-3 mb-3">
              <p className="text-xs text-blue-700">
                Configure your email provider in the <code>.env</code> file:
              </p>
              <pre className="text-[10px] mt-2 bg-slate-900 text-emerald-300 p-2 rounded font-mono">
EMAIL_PROVIDER=console{'\n'}
# Options: console, smtp, sendgrid, mailgun, postmark, ses{'\n'}
EMAIL_FROM="Watershed Capital &lt;noreply@watershedcapital.com&gt;"{'\n'}
# SMTP: EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, EMAIL_SMTP_USER, EMAIL_SMTP_PASS{'\n'}
# SendGrid: SENDGRID_API_KEY{'\n'}
# Mailgun: MAILGUN_API_KEY, MAILGUN_DOMAIN{'\n'}
# Postmark: POSTMARK_API_KEY{'\n'}
# SES: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
              </pre>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Twilio Account SID (for SMS)</Label>
                <Input value={settings.twilioAccountSid || ''} onChange={(e) => set('twilioAccountSid', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Twilio Auth Token</Label>
                <Input type="password" value={settings.twilioAuthToken || ''} onChange={(e) => set('twilioAuthToken', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Twilio Number</Label>
                <Input value={settings.twilioNumber || ''} onChange={(e) => set('twilioNumber', e.target.value)} />
              </div>
              <div>
                <Label>LiveChat Code</Label>
                <Input value={settings.livechat || ''} onChange={(e) => set('livechat', e.target.value)} className="font-mono" />
              </div>
              <div className="md:col-span-2">
                <Label>Analytics Snippet</Label>
                <Textarea rows={3} value={settings.analyticSnippet || ''} onChange={(e) => set('analyticSnippet', e.target.value)} className="font-mono text-xs" placeholder="<script>...</script>" />
              </div>
            </div>
          </Card>

          {/* SMS Provider Configuration */}
          <Card className="p-5 space-y-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" /> SMS Provider Configuration
            </h3>
            <div className="rounded bg-blue-50 border border-blue-200 p-3 mb-3">
              <p className="text-xs text-blue-700">
                Configure your SMS provider in the <code>.env</code> file:
              </p>
              <pre className="text-[10px] mt-2 bg-slate-900 text-emerald-300 p-2 rounded font-mono">
SMS_PROVIDER=console{'\n'}
# Options: console, twilio, termii, africas_talking, vonage{'\n'}
# Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER{'\n'}
# Termii (Nigeria): TERMII_API_KEY, TERMII_SENDER_ID{'\n'}
# Africa's Talking: AFRICAS_TALKING_API_KEY, AFRICAS_TALKING_USERNAME{'\n'}
# Vonage: VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM
              </pre>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Recovery Email (for system alerts)</Label>
                <Input value={settings.recoveryEmail || ''} onChange={(e) => set('recoveryEmail', e.target.value)} />
              </div>
              <div>
                <Label>reCAPTCHA Site Key</Label>
                <Input value={settings.nocaptchaSitekey || ''} onChange={(e) => set('nocaptchaSitekey', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>reCAPTCHA Secret</Label>
                <Input type="password" value={settings.nocaptchaSecret || ''} onChange={(e) => set('nocaptchaSecret', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>reCAPTCHA Enabled</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={!!settings.recaptcha} onCheckedChange={(v) => set('recaptcha', v)} />
                  <span className="text-xs text-slate-600">Enable reCAPTCHA v3 on forms</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Notification Templates */}
          <Card className="p-5 space-y-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" /> Notification Templates (12)
            </h3>
            <div className="rounded bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-xs text-emerald-700 mb-2">12 pre-built templates with email + SMS variants:</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[10px]">
                {['welcome', 'loan_submitted', 'loan_approved', 'loan_rejected', 'loan_disbursed', 'offer_ready', 'payment_reminder', 'payment_overdue', 'payment_received', 'kyc_approved', 'kyc_rejected', 'bvn_verified'].map(t => (
                  <div key={t} className="rounded bg-white border border-emerald-100 px-2 py-1 text-slate-700 font-mono">{t}</div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Templates are stored in <code>src/lib/notification-templates.ts</code> and use <code>{'{{variable}}'}</code> syntax.
                Each template has: subject, HTML body, plain text, and SMS body.
              </p>
            </div>
          </Card>

          {/* Email Drip Campaigns */}
          <Card className="p-5 space-y-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Mail className="h-4 w-4 text-emerald-600" /> Email Drip Campaigns (7)
            </h3>
            <div className="rounded bg-purple-50 border border-purple-200 p-3">
              <p className="text-xs text-purple-700 mb-2">7 automated drip campaigns triggered by user actions:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                {[
                  { name: 'Welcome Series', trigger: 'New user registration', emails: 3 },
                  { name: 'KYC Pending', trigger: 'KYC not completed', emails: 1 },
                  { name: 'Loan Submitted', trigger: 'Loan application submitted', emails: 2 },
                  { name: 'Loan Approved', trigger: 'Loan approved by MCC', emails: 1 },
                  { name: 'Loan Disbursed', trigger: 'Loan disbursed', emails: 2 },
                  { name: 'Payment Due', trigger: 'Payment due in 3 days', emails: 1 },
                  { name: 'Loan Completed', trigger: 'Loan fully repaid', emails: 2 },
                ].map(c => (
                  <div key={c.name} className="rounded bg-white border border-purple-100 px-2 py-1.5">
                    <p className="font-semibold text-slate-700">{c.name}</p>
                    <p className="text-slate-500">Trigger: {c.trigger}</p>
                    <p className="text-purple-600">{c.emails} email(s) in sequence</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                Campaigns are configured in <code>src/lib/email-campaigns.ts</code>. The cron job <code>/api/cron/drip-campaigns</code> runs daily.
              </p>
            </div>
          </Card>

          {/* Cron Jobs */}
          <Card className="p-5 space-y-4 mt-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <SettingsIcon className="h-4 w-4 text-emerald-600" /> Automated Cron Jobs (3)
            </h3>
            <div className="rounded bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-700 mb-2">3 automated jobs run daily via cron:</p>
              <div className="space-y-2">
                <div className="rounded bg-white border border-amber-100 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">📅 Payment Reminders</p>
                  <p className="text-[10px] text-slate-500">Schedule: Daily 8:00 AM</p>
                  <p className="text-[10px] text-slate-500">Endpoint: <code>/api/cron/payment-reminders</code></p>
                  <p className="text-[10px] text-slate-500">Sends SMS + email at: 3 days before, 1 day before, due date, 1 day after, 7 days after</p>
                </div>
                <div className="rounded bg-white border border-amber-100 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">📊 NPL Classification</p>
                  <p className="text-[10px] text-slate-500">Schedule: Daily 12:00 AM</p>
                  <p className="text-[10px] text-slate-500">Endpoint: <code>/api/cron/auto-npl</code></p>
                  <p className="text-[10px] text-slate-500">Classifies loans: Performing → Pass & Watch → Watchlist → Substandard → Doubtful → Lost → Write-off</p>
                </div>
                <div className="rounded bg-white border border-amber-100 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">📧 Drip Campaigns</p>
                  <p className="text-[10px] text-slate-500">Schedule: Daily 9:00 AM</p>
                  <p className="text-[10px] text-slate-500">Endpoint: <code>/api/cron/drip-campaigns</code></p>
                  <p className="text-[10px] text-slate-500">Sends scheduled drip emails based on user state</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                See <code>CRON-JOBS.md</code> for setup instructions (Vercel Cron, crontab, Railway, Render).
              </p>
            </div>
          </Card>
        </TabsContent>

        {/* KYC */}
        <TabsContent value="kyc" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" /> KYC Documents
            </h3>
            <div className="rounded bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700 mb-1">Required customer documents:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Passport Photograph</li>
                <li>Government-issued ID (NIN, Driver's License, Int'l Passport, Voters Card)</li>
                <li>Guarantor Form</li>
                <li>Utility Bill (address proof)</li>
                <li>Bank account verification</li>
                <li>BVN (Bank Verification Number)</li>
                <li>CAC documents (for registered businesses)</li>
              </ul>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Default Currency</Label>
                <Input value={settings.currency || ''} onChange={(e) => set('currency', e.target.value)} />
              </div>
              <div>
                <Label>Currency Format</Label>
                <select value={settings.currencyFormat || 'ngn'} onChange={(e) => set('currencyFormat', e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="ngn">NGN (₦)</option>
                  <option value="usd">USD ($)</option>
                  <option value="eur">EUR (€)</option>
                  <option value="gbp">GBP (£)</option>
                </select>
              </div>
              <div>
                <Label>Default Font</Label>
                <Input value={settings.defaultFont || ''} onChange={(e) => set('defaultFont', e.target.value)} />
              </div>
              <div>
                <Label>Language Toggle</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={!!settings.language} onCheckedChange={(v) => set('language', v)} />
                  <span className="text-xs text-slate-600">Enable multi-language support</span>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" /> Payment Gateways & Bank
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Bank Deposit Bank Name</Label>
                <Input value={settings.dpBankName || ''} onChange={(e) => set('dpBankName', e.target.value)} />
              </div>
              <div>
                <Label>Routing Code</Label>
                <Input value={settings.bkRoutingCode || ''} onChange={(e) => set('bkRoutingCode', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input value={settings.bkAcctNo || ''} onChange={(e) => set('bkAcctNo', e.target.value)} className="font-mono" />
              </div>
              <div>
                <Label>Account Name</Label>
                <Input value={settings.bkAcctName || ''} onChange={(e) => set('bkAcctName', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 rounded border border-slate-100 p-2">
                  <Switch checked={!!settings.bkStatus} onCheckedChange={(v) => set('bkStatus', v)} />
                  <span className="text-xs text-slate-700">Enable bank deposit option</span>
                </label>
              </div>
            </div>

            <div className="border-t pt-3">
              <h4 className="text-xs font-semibold text-slate-700 mb-2">Payout Limits</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label>Min P/L</Label>
                  <Input type="number" value={settings.minPl ?? 0} onChange={(e) => set('minPl', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max P/L</Label>
                  <Input type="number" value={settings.maxPl ?? ''} onChange={(e) => set('maxPl', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div>
                  <Label>Min Account</Label>
                  <Input type="number" value={settings.minAccount ?? 0} onChange={(e) => set('minAccount', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max Account</Label>
                  <Input type="number" value={settings.maxAccount ?? ''} onChange={(e) => set('maxAccount', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div>
                  <Label>Min T/L</Label>
                  <Input type="number" value={settings.minTl ?? 0} onChange={(e) => set('minTl', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Max T/L</Label>
                  <Input type="number" value={settings.maxTl ?? ''} onChange={(e) => set('maxTl', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div>
                  <Label>Percent P/C</Label>
                  <Input type="number" step="0.1" value={settings.percentPc ?? ''} onChange={(e) => set('percentPc', e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div>
                  <Label>Fiat P/C</Label>
                  <Input type="number" step="0.1" value={settings.fiatPc ?? ''} onChange={(e) => set('fiatPc', e.target.value ? Number(e.target.value) : null)} />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* POLICIES */}
        <TabsContent value="policies" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" /> Policies (Rich Text)
            </h3>
            <div>
              <Label>Privacy Policy</Label>
              <Textarea rows={10} value={settings.privacy || ''} onChange={(e) => set('privacy', e.target.value)} placeholder="Paste your privacy policy content..." className="font-mono text-xs" />
            </div>
            <div>
              <Label>Terms & Conditions</Label>
              <Textarea rows={10} value={settings.terms || ''} onChange={(e) => set('terms', e.target.value)} placeholder="Paste your terms & conditions..." className="font-mono text-xs" />
            </div>
            <p className="text-[10px] text-slate-500">For richer formatting, use the dedicated Policy Documents module under Compliance.</p>
          </Card>
        </TabsContent>

        {/* SOCIAL */}
        <TabsContent value="social" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Globe className="h-4 w-4 text-emerald-600" /> Social Login Providers
            </h3>
            <div className="rounded border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Google Sign-In</p>
                <Switch checked={!!settings.googleSl} onCheckedChange={(v) => set('googleSl', v)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label>Client ID</Label>
                  <Input value={settings.googleCi || ''} onChange={(e) => set('googleCi', e.target.value)} className="font-mono text-xs" />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input type="password" value={settings.googleCs || ''} onChange={(e) => set('googleCs', e.target.value)} className="font-mono text-xs" />
                </div>
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">Facebook Sign-In</p>
                <Switch checked={!!settings.facebookSl} onCheckedChange={(v) => set('facebookSl', v)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label>App ID</Label>
                  <Input value={settings.facebookCi || ''} onChange={(e) => set('facebookCi', e.target.value)} className="font-mono text-xs" />
                </div>
                <div>
                  <Label>App Secret</Label>
                  <Input type="password" value={settings.facebookCs || ''} onChange={(e) => set('facebookCs', e.target.value)} className="font-mono text-xs" />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* BRANDS */}
        <TabsContent value="brands" className="mt-4">
          <Card className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Star className="h-4 w-4 text-emerald-600" /> Brand Assets & Reviews
            </h3>
            <div>
              <Label>Logo Upload</Label>
              <div className="flex gap-2 items-center mt-1">
                <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="flex-1" />
                <Button onClick={uploadLogo} disabled={!logoFile} variant="outline">
                  <Upload className="h-4 w-4" /> Upload
                </Button>
              </div>
              {logoPath && (
                <div className="mt-2 flex items-center gap-2 rounded bg-slate-50 p-2">
                  <ImageIcon className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-mono text-slate-600">{logoPath}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">stored</Badge>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Career URL</Label>
                <Input value={settings.careerUrl || ''} onChange={(e) => set('careerUrl', e.target.value)} />
              </div>
              <div>
                <Label>Brand Color</Label>
                <div className="flex gap-2">
                  <input type="color" value={settings.brandColor || '#1F7A4A'} onChange={(e) => set('brandColor', e.target.value)} className="h-9 w-12 rounded border" />
                  <Input value={settings.brandColor || ''} onChange={(e) => set('brandColor', e.target.value)} className="font-mono" />
                </div>
              </div>
            </div>

            <div className="rounded bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">Customer Reviews & Testimonials</p>
              <p className="text-[11px] text-slate-500">Customer reviews are managed in the Communications module. Reviews moderation (approve/decline) is available there.</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

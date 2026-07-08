'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { PublicNav, PublicFooter } from './_shared';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  Loader2,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
  MessageSquare,
  Navigation,
} from 'lucide-react';

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

const INITIAL: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
};

export function PublicContact() {
  const [data, setData] = useState<any>({ settings: null });
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public');
        const json = await res.json();
        if (!cancelled) setData({ settings: json.settings });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settings = data.settings || {};
  const email = settings.email || 'info@watershedfinance.com';
  const supportEmail = settings.supportEmail || 'support@watershedfinance.com';
  const phone = settings.mobile || '+234 803 000 0000';
  const address = settings.address || 'No 8, Jubilee/CMD Road, Magodo GRA II, Lagos, Nigeria';

  const update = (k: keyof FormState, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not submit. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('success');
      setForm(INITIAL);
    } catch (e: any) {
      setError(e.message || 'Network error. Please try again.');
      setStatus('error');
    }
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
                <MessageSquare className="h-3.5 w-3.5" />
                We respond within 24 hours
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                Get in Touch
              </h1>
              <p className="text-lg text-emerald-100/90 max-w-2xl mx-auto leading-relaxed">
                Questions about a loan, savings, or treasury? Want to talk to a relationship
                manager before applying? We&apos;re here to help.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Contact + Form */}
        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="grid lg:grid-cols-5 gap-10 lg:gap-12">
              {/* Left: contact info */}
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="lg:col-span-2 space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Contact Information</h2>
                  <p className="text-sm text-slate-600">
                    Reach us through any of the channels below. A real human will respond — no
                    bots, no queues.
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      icon: Mail,
                      label: 'Email',
                      value: email,
                      href: `mailto:${email}`,
                      sub: `Support: ${supportEmail}`,
                    },
                    {
                      icon: Phone,
                      label: 'Phone',
                      value: phone,
                      href: `tel:${phone.replace(/\s+/g, '')}`,
                      sub: 'Mon–Fri, 8am – 6pm WAT',
                    },
                    {
                      icon: MapPin,
                      label: 'Office',
                      value: address,
                      href: '#map',
                      sub: 'Visit us in person — walk-ins welcome',
                    },
                    {
                      icon: Clock,
                      label: 'Hours',
                      value: 'Mon – Fri: 8:00 AM – 6:00 PM',
                      sub: 'Sat: 9:00 AM – 2:00 PM · Sun: Closed',
                    },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className="flex gap-4 p-4 rounded-xl border border-slate-200 hover:border-emerald-200 hover:shadow-md transition-all"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
                        <c.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
                          {c.label}
                        </p>
                        <a
                          href={c.href}
                          className="text-sm font-semibold text-slate-900 hover:text-emerald-700 transition-colors break-words"
                        >
                          {c.value}
                        </a>
                        <p className="text-xs text-slate-500 mt-0.5">{c.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Social */}
                <div className="pt-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
                    Follow us
                  </p>
                  <div className="flex gap-3">
                    {[Facebook, Twitter, Linkedin, Instagram].map((Icon, i) => (
                      <a
                        key={i}
                        href="#"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-emerald-600 hover:text-white transition-colors"
                        aria-label="Social link"
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Right: form */}
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="lg:col-span-3"
              >
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 lg:p-8">
                  {status === 'success' ? (
                    <div className="text-center py-10">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-4">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">Message sent!</h3>
                      <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                        Thank you for reaching out. A member of our team will respond within
                        24 hours during business days.
                      </p>
                      <button
                        onClick={() => setStatus('idle')}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        Send another message
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={submit} className="space-y-5">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-1">Send us a message</h2>
                        <p className="text-sm text-slate-600">
                          Fill in the form below and we&apos;ll get back to you shortly.
                        </p>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field
                          label="First name"
                          required
                          value={form.firstName}
                          onChange={(v) => update('firstName', v)}
                          placeholder="Chukwu"
                        />
                        <Field
                          label="Last name"
                          required
                          value={form.lastName}
                          onChange={(v) => update('lastName', v)}
                          placeholder="Emeka"
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field
                          label="Email"
                          type="email"
                          required
                          value={form.email}
                          onChange={(v) => update('email', v)}
                          placeholder="you@example.com"
                        />
                        <Field
                          label="Phone"
                          type="tel"
                          value={form.phone}
                          onChange={(v) => update('phone', v)}
                          placeholder="+234 803 000 0000"
                        />
                      </div>

                      <Field
                        label="Subject"
                        required
                        value={form.subject}
                        onChange={(v) => update('subject', v)}
                        placeholder="How can we help?"
                      />

                      <div>
                        <label className="text-xs font-medium text-slate-700 mb-1.5 block">
                          Message <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          required
                          value={form.message}
                          onChange={(e) => update('message', e.target.value)}
                          rows={5}
                          placeholder="Tell us a bit more about what you need..."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 resize-none"
                        />
                      </div>

                      {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
                          {error}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={status === 'loading'}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white px-5 py-3 text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        {status === 'loading' ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            Send Message
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Map */}
        <section id="map" className="bg-slate-50 border-t border-slate-100">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
            <div className="text-center mb-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
                Find us
              </p>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
                Visit our Lagos HQ
              </h2>
              <p className="text-slate-600 max-w-xl mx-auto">{address}</p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
              <div className="aspect-[16/9] bg-gradient-to-br from-emerald-50 via-slate-50 to-emerald-100 relative flex items-center justify-center">
                {/* Stylized map placeholder */}
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(31,122,74,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(31,122,74,0.15) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                  }}
                />
                <div className="relative text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg mb-3 animate-bounce">
                    <Navigation className="h-7 w-7" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">
                    Watershed Finance Limited
                  </p>
                  <p className="text-sm text-slate-600 max-w-xs mx-auto mt-1">
                    No 8, Jubilee/CMD Road, Magodo GRA II, Lagos
                  </p>
                  <a
                    href="https://maps.google.com/?q=Magodo+GRA+II+Lagos+Nigeria"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Open in Google Maps
                  </a>
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

// ---------------------------------------------------------------------------
// Reusable input field
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-700 mb-1.5 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
      />
    </div>
  );
}

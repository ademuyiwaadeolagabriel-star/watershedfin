'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppStore } from '@/lib/store';
import { useBranding, DEFAULT_BRANDING, BrandingConfig } from '@/lib/branding';
import { useToast } from '@/hooks/use-toast';
import {
  Palette,
  Upload,
  Save,
  RotateCcw,
  Image as ImageIcon,
  Check,
  Building2,
  Type,
  Eye,
  ShieldAlert,
} from 'lucide-react';

const FONT_OPTIONS = ['Inter', 'HKGroteskPro', 'Graphik', 'System UI'];

export function BrandingSettingsView() {
  const { currentAdmin } = useAppStore();
  const { config, load, setConfig } = useBranding();
  const { toast } = useToast();

  const [form, setForm] = useState<BrandingConfig>(config);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!useBranding.getState().loaded) load();
  }, [load]);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const update = <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // Live preview: update the global store (CSS vars + visible components)
    setConfig({ [key]: value } as Partial<BrandingConfig>);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    // For demo: use a local object URL so the preview updates immediately.
    // In a real deployment this would upload to /public or S3 and return a path.
    const url = URL.createObjectURL(file);
    update('logoUrl', url);
    update('logoDarkUrl', url);
    update('faviconUrl', url);
  };

  const save = async () => {
    if (currentAdmin?.role !== 'super') {
      toast({
        title: 'Access denied',
        description: 'Only Super Admins can modify branding.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentAdmin.id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save branding');
      }
      await load();
      toast({
        title: 'Branding saved',
        description: 'Changes are now live across the entire platform.',
      });
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(DEFAULT_BRANDING);
    setConfig(DEFAULT_BRANDING);
    toast({
      title: 'Reset to defaults',
      description: 'Click Save to persist the default branding.',
    });
  };

  const isSuper = currentAdmin?.role === 'super';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Palette className="h-5 w-5" style={{ color: form.brandColor }} />
              Branding &amp; Identity
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Edit the platform logo, brand colors, site identity, and font.
              Changes apply instantly across every portal via CSS variables.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={reset} disabled={!isSuper}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !isSuper}>
              {saving ? (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Branding
                </>
              )}
            </Button>
          </div>
        </div>
        {!isSuper && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              You are signed in as <strong>{currentAdmin?.role}</strong>. Only
              Super Admins can modify branding. You can preview changes but
              cannot save them.
            </span>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ───── LEFT: Editors ───── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Logo upload */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <ImageIcon className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Logo</h3>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex h-24 w-44 items-center justify-center rounded-md border border-slate-200 bg-white p-3 shrink-0">
                <img
                  src={form.logoUrl}
                  alt={form.siteName}
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Upload new logo</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Upload className="h-3.5 w-3.5" />
                    Choose file
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                      disabled={!isSuper}
                    />
                  </label>
                  <span className="text-[11px] text-slate-500 truncate max-w-[200px]">
                    {logoFile ? logoFile.name : form.logoUrl}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  PNG or SVG, ideally 192×84. For demo, the path is updated
                  instantly; persists on Save.
                </p>
                <div className="mt-2">
                  <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                    Or paste a path
                  </Label>
                  <Input
                    value={form.logoUrl}
                    onChange={(e) => update('logoUrl', e.target.value)}
                    placeholder="/watershed-logo.png"
                    className="mt-1 h-8 text-xs font-mono"
                    disabled={!isSuper}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Brand colors */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Brand Colors</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ColorField
                label="Brand Color (Primary Green)"
                value={form.brandColor}
                onChange={(v) => update('brandColor', v)}
                disabled={!isSuper}
              />
              <ColorField
                label="Brand Color Dark (Hover / Shade)"
                value={form.brandColorDark}
                onChange={(v) => update('brandColorDark', v)}
                disabled={!isSuper}
              />
              <ColorField
                label="Brand Color Light (Tint / Background)"
                value={form.brandColorLight}
                onChange={(v) => update('brandColorLight', v)}
                disabled={!isSuper}
              />
              <ColorField
                label="Accent Color (Secondary)"
                value={form.accentColor}
                onChange={(v) => update('accentColor', v)}
                disabled={!isSuper}
              />
            </div>
          </Card>

          {/* Site identity */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Site Identity</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Site Name (Full)"
                value={form.siteName}
                onChange={(v) => update('siteName', v)}
                disabled={!isSuper}
              />
              <Field
                label="Short Name (Sidebar / Compact)"
                value={form.siteShortName}
                onChange={(v) => update('siteShortName', v)}
                disabled={!isSuper}
              />
              <Field
                label="Tagline"
                value={form.tagline}
                onChange={(v) => update('tagline', v)}
                disabled={!isSuper}
              />
              <Field
                label="CBN License Label"
                value={form.cbnLicense}
                onChange={(v) => update('cbnLicense', v)}
                disabled={!isSuper}
              />
              <Field
                label="Address"
                value={form.address}
                onChange={(v) => update('address', v)}
                disabled={!isSuper}
                full
              />
              <Field
                label="Email"
                value={form.email}
                onChange={(v) => update('email', v)}
                disabled={!isSuper}
              />
              <Field
                label="Phone"
                value={form.phone}
                onChange={(v) => update('phone', v)}
                disabled={!isSuper}
              />
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-600">Footer Note</Label>
                <Textarea
                  value={form.footerNote}
                  onChange={(e) => update('footerNote', e.target.value)}
                  rows={2}
                  className="mt-1 text-xs"
                  disabled={!isSuper}
                />
              </div>
            </div>
          </Card>

          {/* Font */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Type className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Default Font</h3>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Font family</Label>
                <Select
                  value={form.defaultFont}
                  onValueChange={(v) => update('defaultFont', v)}
                  disabled={!isSuper}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
                The quick brown fox — ₦12,345.67
              </div>
            </div>
          </Card>

          {/* ───── HOMEPAGE CONTENT EDITOR ───── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Type className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Homepage Content</h3>
              <span className="text-[10px] text-slate-400">Edit all text on the public homepage</span>
            </div>

            {/* Hero Section */}
            <div className="space-y-3 mb-6">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Hero Section</p>
              <Field label="Hero Title (full text)" value={form.heroTitle} onChange={(v) => update('heroTitle', v)} disabled={!isSuper} full />
              <Field label="Hero Highlight (the highlighted word in title)" value={form.heroHighlight} onChange={(v) => update('heroHighlight', v)} disabled={!isSuper} />
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-600">Hero Subtitle</Label>
                <Textarea value={form.heroSubtitle} onChange={(e) => update('heroSubtitle', e.target.value)} rows={2} className="mt-1 text-xs" disabled={!isSuper} />
              </div>
              <Field label="Hero CTA Button Text" value={form.heroCtaText} onChange={(v) => update('heroCtaText', v)} disabled={!isSuper} />
              <Field label="Hero Secondary Button Text" value={form.heroCtaSecondary} onChange={(v) => update('heroCtaSecondary', v)} disabled={!isSuper} />
              <Field label="Hero Badge Text (shown above title)" value={form.heroBadge} onChange={(v) => update('heroBadge', v)} disabled={!isSuper} full />
              <Field label="Hero Image URL (background photo)" value={form.heroImageUrl} onChange={(v) => update('heroImageUrl', v)} disabled={!isSuper} full />
              <Field label="Hero Image Alt Text (for accessibility)" value={form.heroImageAlt} onChange={(v) => update('heroImageAlt', v)} disabled={!isSuper} full />
            </div>

            {/* Stats Bar */}
            <div className="space-y-3 mb-6">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Stats Bar (4 stats)</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stat 1 Label" value={form.stat1Label} onChange={(v) => update('stat1Label', v)} disabled={!isSuper} />
                <Field label="Stat 1 Value" value={form.stat1Value} onChange={(v) => update('stat1Value', v)} disabled={!isSuper} />
                <Field label="Stat 2 Label" value={form.stat2Label} onChange={(v) => update('stat2Label', v)} disabled={!isSuper} />
                <Field label="Stat 2 Value" value={form.stat2Value} onChange={(v) => update('stat2Value', v)} disabled={!isSuper} />
                <Field label="Stat 3 Label" value={form.stat3Label} onChange={(v) => update('stat3Label', v)} disabled={!isSuper} />
                <Field label="Stat 3 Value" value={form.stat3Value} onChange={(v) => update('stat3Value', v)} disabled={!isSuper} />
                <Field label="Stat 4 Label" value={form.stat4Label} onChange={(v) => update('stat4Label', v)} disabled={!isSuper} />
                <Field label="Stat 4 Value" value={form.stat4Value} onChange={(v) => update('stat4Value', v)} disabled={!isSuper} />
              </div>
            </div>

            {/* Section Titles */}
            <div className="space-y-3 mb-6">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Section Titles</p>
              <Field label="Services Section Title" value={form.sectionServicesTitle} onChange={(v) => update('sectionServicesTitle', v)} disabled={!isSuper} full />
              <Field label="Services Section Subtitle" value={form.sectionServicesSubtitle} onChange={(v) => update('sectionServicesSubtitle', v)} disabled={!isSuper} full />
              <Field label="Journey Section Title" value={form.sectionJourneyTitle} onChange={(v) => update('sectionJourneyTitle', v)} disabled={!isSuper} full />
              <Field label="Why Us Section Title" value={form.sectionWhyTitle} onChange={(v) => update('sectionWhyTitle', v)} disabled={!isSuper} full />
              <Field label="Why Us Section Subtitle" value={form.sectionWhySubtitle} onChange={(v) => update('sectionWhySubtitle', v)} disabled={!isSuper} full />
              <Field label="Testimonials Section Title" value={form.sectionTestimonialsTitle} onChange={(v) => update('sectionTestimonialsTitle', v)} disabled={!isSuper} full />
            </div>

            {/* CTA Banner */}
            <div className="space-y-3 mb-6">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">CTA Banner</p>
              <Field label="CTA Title" value={form.sectionCtaTitle} onChange={(v) => update('sectionCtaTitle', v)} disabled={!isSuper} full />
              <div className="sm:col-span-2">
                <Label className="text-xs text-slate-600">CTA Subtitle</Label>
                <Textarea value={form.sectionCtaSubtitle} onChange={(e) => update('sectionCtaSubtitle', e.target.value)} rows={2} className="mt-1 text-xs" disabled={!isSuper} />
              </div>
              <Field label="CTA Button Text" value={form.sectionCtaButton} onChange={(v) => update('sectionCtaButton', v)} disabled={!isSuper} full />
            </div>

            {/* Whistleblower */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" /> Whistleblower Hotline
              </p>
              <Field label="Whistleblower Phone" value={form.whistleblowerPhone} onChange={(v) => update('whistleblowerPhone', v)} disabled={!isSuper} />
              <Field label="Whistleblower Email" value={form.whistleblowerEmail} onChange={(v) => update('whistleblowerEmail', v)} disabled={!isSuper} />
            </div>
          </Card>
        </div>

        {/* ───── RIGHT: Live preview ───── */}
        <div className="space-y-4">
          <Card className="p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Live Preview</h3>
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Check className="h-2.5 w-2.5" /> Real-time
              </span>
            </div>

            {/* Mini branded card */}
            <div
              className="rounded-lg overflow-hidden border"
              style={{ borderColor: form.brandColor + '40' }}
            >
              <div
                className="p-4 text-white"
                style={{
                  background: `linear-gradient(135deg, ${form.brandColor}, ${form.brandColorDark})`,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src={form.logoUrl}
                    alt={form.siteName}
                    className="h-7 w-auto bg-white/95 rounded px-1.5 py-0.5"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div>
                    <p className="text-sm font-bold leading-tight">
                      {form.siteName}
                    </p>
                    <p
                      className="text-[10px] uppercase tracking-wider opacity-80"
                    >
                      {form.tagline}
                    </p>
                  </div>
                </div>
              </div>
              <div
                className="p-3 space-y-2"
                style={{ backgroundColor: form.brandColorLight }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">Primary</span>
                  <span
                    className="inline-flex rounded-md px-2 py-1 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: form.brandColor }}
                  >
                    Button
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">Accent</span>
                  <span
                    className="inline-flex rounded-md px-2 py-1 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: form.accentColor }}
                  >
                    Accent
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">Tint bg</span>
                  <span
                    className="inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold"
                    style={{
                      borderColor: form.brandColor,
                      color: form.brandColorDark,
                      backgroundColor: form.brandColorLight,
                    }}
                  >
                    Outline
                  </span>
                </div>
              </div>
              <div className="p-3 bg-white border-t border-slate-100">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {form.address}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {form.email} · {form.phone}
                </p>
                <p
                  className="text-[9px] mt-2 font-semibold"
                  style={{ color: form.brandColorDark }}
                >
                  {form.cbnLicense}
                </p>
              </div>
            </div>

            {/* Color swatches */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: 'Primary', color: form.brandColor },
                { label: 'Dark', color: form.brandColorDark },
                { label: 'Light', color: form.brandColorLight },
                { label: 'Accent', color: form.accentColor },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div
                    className="h-10 w-full rounded-md border border-slate-200"
                    style={{ backgroundColor: s.color }}
                  />
                  <p className="text-[9px] text-slate-500 mt-1">{s.label}</p>
                  <p className="text-[8px] text-slate-400 font-mono uppercase">
                    {s.color}
                  </p>
                </div>
              ))}
            </div>

            {/* JSON view */}
            <details className="mt-4">
              <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                View raw config JSON
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-900 p-2 text-[9px] text-emerald-300 font-mono leading-relaxed">
{JSON.stringify(form, null, 2)}
              </pre>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Sub-components ─────────────────────────

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="relative h-9 w-12 rounded-md border border-slate-200 overflow-hidden shrink-0">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <div
            className="pointer-events-none h-full w-full"
            style={{ backgroundColor: value }}
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-xs font-mono"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 text-xs"
        disabled={disabled}
      />
    </div>
  );
}

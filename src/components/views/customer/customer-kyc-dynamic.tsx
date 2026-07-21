'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Loader2, Save, Send, Edit3,
  ShieldCheck, FileText, Clock, XCircle, RefreshCw, Upload,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface KycField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  helpText: string | null;
  type: string;
  options: string[] | null;
  section: string;
  required: boolean;
  editable: boolean;
  needsVerification: boolean;
  placeholder: string | null;
  validationPattern: string | null;
  validationMessage: string | null;
  sortOrder: number;
  adminOnly: boolean;
}

interface Section {
  name: string;
  label: string;
  fields: KycField[];
}

interface Submission {
  id: string;
  value: string;
  fileName: string | null;
  filePath: string | null;
  verified: boolean;
  verifiedAt: string | null;
  verificationNote: string | null;
  editedAt: string | null;
}

export function DynamicKycView() {
  const { currentUser, setView } = useAppStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [kycStatus, setKycStatus] = useState<string>('DRAFT');
  const [activeSection, setActiveSection] = useState<string>('personal');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/customer/kyc-dynamic?userId=${currentUser.id}`);
      if (res.ok) {
        const d = await res.json();
        setSections(d.sections || []);
        setSubmissions(d.submissions || {});
        setKycStatus(d.kycStatus || 'DRAFT');

        // Pre-fill values from existing submissions
        const vals: Record<string, string> = {};
        for (const [fieldId, sub] of Object.entries<any>(d.submissions || {})) {
          vals[fieldId] = sub.value || '';
        }
        setValues(vals);

        if (d.sections && d.sections.length > 0) {
          setActiveSection(d.sections[0].name);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentUser?.id]);

  const isLocked = kycStatus === 'APPROVED' || kycStatus === 'PROCESSING';

  const save = async (submit: boolean = false) => {
    if (!currentUser?.id) return;
    const setter = submit ? setSubmitting : setSaving;
    setter(true);
    try {
      const payload = {
        userId: currentUser.id,
        values: Object.entries(values).map(([fieldId, value]) => ({ fieldId, value })),
        submit,
      };
      const res = await authFetch('/api/customer/kyc-dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const d = await res.json();
        toast({
          title: submit ? 'KYC submitted' : 'Draft saved',
          description: submit
            ? 'Your KYC is now under review. We will notify you within 24 hours.'
            : `${d.upsertedCount} field(s) saved as draft`,
        });
        if (submit) {
          await load();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast({
          title: submit ? 'Submission failed' : 'Save failed',
          description: err.error || `HTTP ${res.status}`,
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setter(false);
    }
  };

  // Calculate completion %
  const allFields = sections.flatMap(s => s.fields);
  const requiredFields = allFields.filter(f => f.required);
  const filledRequired = requiredFields.filter(f => values[f.id] && values[f.id].trim()).length;
  const completionPct = requiredFields.length > 0 ? Math.round((filledRequired / requiredFields.length) * 100) : 0;

  const statusColor = (s: string) => {
    switch (s) {
      case 'APPROVED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'PROCESSING': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'RESUBMIT': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'DECLINED': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const renderField = (f: KycField) => {
    const value = values[f.id] || '';
    const submission = submissions[f.id];
    const fieldLocked = isLocked || (submission?.verified && !f.editable);

    const onChange = (v: string) => {
      setValues({ ...values, [f.id]: v });
    };

    return (
      <div key={f.id} className={cn('space-y-1', fieldLocked && 'opacity-70')}>
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">
            {f.label}
            {f.required && <span className="text-red-500 ml-0.5">*</span>}
            {submission?.verified && (
              <Badge variant="outline" className="ml-2 text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Verified
              </Badge>
            )}
          </Label>
          {submission && !submission.verified && submission.verificationNote && (
            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
              <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> {submission.verificationNote}
            </Badge>
          )}
        </div>

        {f.description && (
          <p className="text-[11px] text-slate-500">{f.description}</p>
        )}

        {f.type === 'textarea' ? (
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={f.placeholder || ''}
            disabled={fieldLocked}
            rows={3}
            className="text-sm"
          />
        ) : f.type === 'select' ? (
          <Select value={value} onValueChange={onChange} disabled={fieldLocked}>
            <SelectTrigger>
              <SelectValue placeholder={f.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {(f.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : f.type === 'checkbox' ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={value === 'true'}
              onCheckedChange={(v) => onChange(v ? 'true' : 'false')}
              disabled={fieldLocked}
            />
            <span className="text-xs text-slate-600">{value === 'true' ? 'Yes' : 'No'}</span>
          </div>
        ) : f.type === 'file' ? (
          <div className="space-y-1">
            <Input
              type="file"
              disabled={fieldLocked}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onChange(file.name);
                }
              }}
              className="text-xs"
            />
            {submission?.fileName && (
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Current: {submission.fileName}
              </p>
            )}
          </div>
        ) : (
          <Input
            type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'date' ? 'date' : f.type === 'phone' ? 'tel' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={f.placeholder || ''}
            disabled={fieldLocked}
            pattern={f.validationPattern || undefined}
            className="text-sm"
          />
        )}

        {f.helpText && (
          <p className="text-[10px] text-slate-400">{f.helpText}</p>
        )}

        {submission?.editedAt && (
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            Last edited: {new Date(submission.editedAt).toLocaleString()}
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 bg-slate-50 min-h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          Loading your KYC form…
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
        <Card className="p-8">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-900">KYC form not configured yet</p>
            <p className="text-xs text-slate-500 mt-1">
              No KYC fields have been set up by the administrator. Please check back later or contact support.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setView('customer-dashboard')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" /> KYC Verification
            </h2>
            <p className="text-xs text-slate-500">
              Fill in your details below. You can save as draft and come back later, or submit for review when ready.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-xs', statusColor(kycStatus))}>
              {kycStatus}
            </Badge>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Progress + warning banners */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700">Completion</p>
          <span className="text-xs text-slate-500">
            {filledRequired} of {requiredFields.length} required fields filled
          </span>
        </div>
        <Progress value={completionPct} className="h-2" />
      </Card>

      {kycStatus === 'APPROVED' && (
        <Card className="p-4 border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Your KYC is approved</p>
              <p className="text-xs text-emerald-700 mt-1">
                You can now apply for loans and access all customer features. To update your information, contact support.
              </p>
            </div>
          </div>
        </Card>
      )}

      {kycStatus === 'PROCESSING' && (
        <Card className="p-4 border-blue-200 bg-blue-50">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">Your KYC is under review</p>
              <p className="text-xs text-blue-700 mt-1">
                Our compliance team is reviewing your submission. You will receive a notification within 24 hours.
                You can still edit fields that have not yet been verified.
              </p>
            </div>
          </div>
        </Card>
      )}

      {kycStatus === 'RESUBMIT' && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">Action required</p>
              <p className="text-xs text-amber-700 mt-1">
                Please review and update the highlighted fields, then resubmit your KYC.
              </p>
            </div>
          </div>
        </Card>
      )}

      {kycStatus === 'DECLINED' && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">KYC declined</p>
              <p className="text-xs text-red-700 mt-1">
                Your KYC submission was declined. Please contact support for assistance.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Section tabs */}
      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 h-auto">
          {sections.map((s) => {
            const sectionFields = s.fields;
            const sectionRequired = sectionFields.filter(f => f.required);
            const sectionFilled = sectionRequired.filter(f => values[f.id] && values[f.id].trim()).length;
            const isComplete = sectionFilled === sectionRequired.length && sectionRequired.length > 0;
            return (
              <TabsTrigger key={s.name} value={s.name} className="flex items-center gap-1.5 py-2">
                {isComplete && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                {s.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {sections.map((s) => (
          <TabsContent key={s.name} value={s.name}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{s.label}</CardTitle>
                <CardDescription>
                  {s.fields.length} field(s) in this section
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {s.fields.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No fields in this section.</p>
                ) : (
                  s.fields.map(renderField)
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Action bar */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 p-3 -mx-4 lg:-mx-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-slate-500">
            {completionPct === 100
              ? <span className="text-emerald-700 font-medium">All required fields filled — ready to submit</span>
              : <span>{filledRequired} of {requiredFields.length} required fields completed</span>
            }
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => save(false)}
              disabled={saving || submitting || isLocked}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Draft
            </Button>
            <Button
              onClick={() => save(true)}
              disabled={saving || submitting || isLocked || completionPct < 100}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
              Submit for Review
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

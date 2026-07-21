'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FormInput, Plus, RefreshCw, Edit3, Trash2, Power, AlertTriangle, Loader2,
  CheckCircle2, ArrowUp, ArrowDown,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (Select)' },
  { value: 'textarea', label: 'Long Text (Textarea)' },
  { value: 'file', label: 'File Upload' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
];

const SECTIONS = [
  { value: 'personal', label: 'Personal Information' },
  { value: 'physical', label: 'Physical / Address' },
  { value: 'business', label: 'Business Details' },
  { value: 'financial', label: 'Financial Information' },
];

const SECTION_LABELS: Record<string, string> = Object.fromEntries(SECTIONS.map(s => [s.value, s.label]));

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 border-blue-200',
  number: 'bg-purple-100 text-purple-700 border-purple-200',
  email: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  phone: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  date: 'bg-amber-100 text-amber-700 border-amber-200',
  select: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  textarea: 'bg-slate-100 text-slate-700 border-slate-200',
  file: 'bg-rose-100 text-rose-700 border-rose-200',
  checkbox: 'bg-teal-100 text-teal-700 border-teal-200',
};

interface KycField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  helpText: string | null;
  type: string;
  options: string | null;
  section: string;
  required: boolean;
  editable: boolean;
  needsVerification: boolean;
  placeholder: string | null;
  validationPattern: string | null;
  validationMessage: string | null;
  sortOrder: number;
  enabled: boolean;
  adminOnly: boolean;
  _count?: { submissions: number };
}

export function KycFieldManagerView() {
  const { toast } = useToast();
  const [fields, setFields] = useState<KycField[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<KycField | null>(null);
  const [saving, setSaving] = useState(false);

  const emptyForm = {
    key: '', label: '', description: '', helpText: '', type: 'text',
    options: '', section: 'personal', required: true, editable: true,
    needsVerification: false, placeholder: '', validationPattern: '',
    validationMessage: '', sortOrder: 0, adminOnly: false,
  };
  const [form, setForm] = useState<any>(emptyForm);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/kyc-fields');
      if (res.ok) {
        const d = await res.json();
        setFields(d.fields || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingField(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (f: KycField) => {
    setEditingField(f);
    setForm({
      key: f.key,
      label: f.label,
      description: f.description || '',
      helpText: f.helpText || '',
      type: f.type,
      options: f.options ? JSON.parse(f.options).join(', ') : '',
      section: f.section,
      required: f.required,
      editable: f.editable,
      needsVerification: f.needsVerification,
      placeholder: f.placeholder || '',
      validationPattern: f.validationPattern || '',
      validationMessage: f.validationMessage || '',
      sortOrder: f.sortOrder,
      adminOnly: f.adminOnly,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.key || !form.label) {
      toast({ title: 'Validation error', description: 'Key and Label are required', variant: 'destructive' });
      return;
    }

    const optionsArray = form.options
      ? form.options.split(',').map((s: string) => s.trim()).filter(Boolean)
      : null;

    const payload = {
      ...form,
      key: form.key.trim().toLowerCase().replace(/\s+/g, '_'),
      options: optionsArray,
      sortOrder: Number(form.sortOrder) || 0,
    };

    setSaving(true);
    try {
      const url = editingField
        ? `/api/admin/kyc-fields/${editingField.id}`
        : '/api/admin/kyc-fields';
      const method = editingField ? 'PATCH' : 'POST';
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast({
          title: editingField ? 'Field updated' : 'Field created',
          description: `${payload.label} has been ${editingField ? 'updated' : 'added'} successfully`,
        });
        setDialogOpen(false);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Save failed', description: err.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (f: KycField) => {
    try {
      await authFetch(`/api/admin/kyc-fields/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !f.enabled }),
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const remove = async (f: KycField) => {
    const hard = confirm(
      `Delete field "${f.label}"?\n\nClick OK to HARD delete (also removes ${f._count?.submissions || 0} submissions).\nClick Cancel to soft-delete (disable only).`
    );
    const soft = !hard && confirm(`Soft-delete (disable) field "${f.label}" instead?`);
    if (!hard && !soft) return;

    try {
      const url = `/api/admin/kyc-fields/${f.id}${hard ? '?hard=true' : ''}`;
      await authFetch(url, { method: 'DELETE' });
      toast({
        title: 'Field removed',
        description: `${f.label} has been ${hard ? 'permanently deleted' : 'disabled'}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const moveOrder = async (f: KycField, direction: -1 | 1) => {
    const newOrder = (f.sortOrder || 0) + direction;
    try {
      await authFetch(`/api/admin/kyc-fields/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: Math.max(0, newOrder) }),
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  // Group fields by section
  const grouped: Record<string, KycField[]> = {};
  for (const f of fields) {
    if (!grouped[f.section]) grouped[f.section] = [];
    grouped[f.section].push(f);
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FormInput className="h-5 w-5 text-emerald-600" /> Dynamic KYC Field Manager
            </h2>
            <p className="text-xs text-slate-500">
              Add, edit, reorder, or remove the fields customers fill in for KYC. Changes are live — no redeploy needed.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Field
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Fields</p>
          <p className="text-2xl font-bold text-slate-900">{fields.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Enabled</p>
          <p className="text-2xl font-bold text-emerald-700">{fields.filter(f => f.enabled).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Required</p>
          <p className="text-2xl font-bold text-amber-700">{fields.filter(f => f.required && f.enabled).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Submissions</p>
          <p className="text-2xl font-bold text-blue-700">
            {fields.reduce((sum, f) => sum + (f._count?.submissions || 0), 0)}
          </p>
        </Card>
      </div>

      {/* Field list grouped by section */}
      {loading ? (
        <Card className="p-8">
          <div className="text-center text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading fields…
          </div>
        </Card>
      ) : fields.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No KYC fields configured yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "New Field" to create your first KYC field.</p>
          </div>
        </Card>
      ) : (
        SECTIONS.map((section) => {
          const sectionFields = grouped[section.value] || [];
          if (sectionFields.length === 0) return null;
          return (
            <Card key={section.value}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {section.label}
                  <Badge variant="outline" className="text-[10px]">{sectionFields.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Label / Key</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Flags</TableHead>
                      <TableHead className="text-center">Submissions</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sectionFields.map((f, idx) => (
                      <TableRow key={f.id} className={cn(!f.enabled && 'opacity-50')}>
                        <TableCell className="text-xs text-slate-400">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => moveOrder(f, -1)}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                              disabled={idx === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => moveOrder(f, 1)}
                              className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
                              disabled={idx === sectionFields.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900">{f.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{f.key}</div>
                          {f.description && (
                            <div className="text-[11px] text-slate-400 mt-0.5">{f.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', TYPE_COLORS[f.type] || '')}>
                            {f.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center flex-wrap">
                            {f.required && (
                              <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">REQ</Badge>
                            )}
                            {f.editable && (
                              <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">EDIT</Badge>
                            )}
                            {f.needsVerification && (
                              <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">VER</Badge>
                            )}
                            {f.adminOnly && (
                              <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-200">ADMIN</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {f._count?.submissions || 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(f)}
                              title="Edit"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleEnabled(f)}
                              title={f.enabled ? 'Disable' : 'Enable'}
                              className={f.enabled ? 'text-emerald-600' : 'text-slate-400'}
                            >
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(f)}
                              title="Delete"
                              className="text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingField ? 'Edit KYC Field' : 'Create KYC Field'}</DialogTitle>
            <DialogDescription>
              {editingField
                ? `Editing "${editingField.label}" (${editingField.key})`
                : 'Add a new field to the customer KYC form. Changes take effect immediately.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div>
              <Label className="text-xs">Field Key (snake_case)</Label>
              <Input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="e.g. bvn, nin, next_of_kin"
                className="mt-1 font-mono text-xs"
                disabled={!!editingField}
              />
            </div>
            <div>
              <Label className="text-xs">Display Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Bank Verification Number"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Section</Label>
              <Select value={form.section} onValueChange={(v) => setForm({ ...form, section: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Description (shown above the field)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short explanation of what this field is for"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Help Text (shown below the field)</Label>
              <Input
                value={form.helpText}
                onChange={(e) => setForm({ ...form, helpText: e.target.value })}
                placeholder="e.g. Enter your 11-digit BVN as printed on your BVN slip"
                className="mt-1"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={form.placeholder}
                onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                placeholder="e.g. 12345678901"
                className="mt-1"
              />
            </div>
            {form.type === 'select' && (
              <div className="md:col-span-2">
                <Label className="text-xs">Dropdown Options (comma-separated)</Label>
                <Input
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                  placeholder="Option 1, Option 2, Option 3"
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Validation Regex (optional)</Label>
              <Input
                value={form.validationPattern}
                onChange={(e) => setForm({ ...form, validationPattern: e.target.value })}
                placeholder="e.g. ^\d{11}$ for 11 digits"
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Validation Error Message</Label>
              <Input
                value={form.validationMessage}
                onChange={(e) => setForm({ ...form, validationMessage: e.target.value })}
                placeholder="e.g. BVN must be exactly 11 digits"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Sort Order (lower = first)</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                className="mt-1"
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 pt-3 border-t">
              <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <Label className="text-xs">Required</Label>
                <Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <Label className="text-xs">Editable</Label>
                <Switch checked={form.editable} onCheckedChange={(v) => setForm({ ...form, editable: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <Label className="text-xs">Needs Verification</Label>
                <Switch checked={form.needsVerification} onCheckedChange={(v) => setForm({ ...form, needsVerification: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <Label className="text-xs">Admin Only</Label>
                <Switch checked={form.adminOnly} onCheckedChange={(v) => setForm({ ...form, adminOnly: v })} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              {editingField ? 'Save Changes' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  UserPlus, Save, Loader2, ArrowLeft, CheckCircle2, Shield,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  PERMISSION_FLAGS, ROLE_PERMISSIONS, ROLE_LABELS, ROLES,
} from '@/lib/constants';

const PERMISSION_LABELS: Record<string, string> = {
  loanOrigination: 'Loan Origination',
  loanVetting: 'Loan Vetting (BM)',
  loanStructuring: 'Loan Structuring (HOC)',
  loanAnalyst: 'Loan Analyst',
  loanRisk: 'Loan Risk (CRO)',
  loanLegal: 'Loan Legal',
  loanCfoReview: 'CFO Review',
  loanFinalization: 'Loan Finalization',
  loanDisbursement: 'Loan Disbursement',
  loanPortfolio: 'Loan Portfolio',
  loanSupervisor: 'Loan Supervisor',
  loanMcc: 'MCC / MD Sanction',
  onboarding: 'Customer Onboarding',
  kycVerify: 'KYC Verification',
  accountingView: 'Accounting — View',
  accountingPost: 'Accounting — Post',
  treasuryOnboard: 'Treasury Onboarding',
  treasuryBook: 'Treasury Book Deals',
  treasuryAssets: 'Treasury Assets',
  branchManage: 'Branch Management',
  auditAccess: 'Audit Access',
  internalControl: 'Internal Control',
  compliance: 'Compliance',
  reportsGlobal: 'Global Reports',
  generalSettings: 'General Settings',
  message: 'Messaging',
  support: 'Support / Tickets',
  csKycVerify: 'CS — KYC Verification',
  csPaymentVerify: 'CS — Payment Verification',
  legalCacSearch: 'Legal — CAC Name Search',
  legalMcc: 'Legal — MCC Compliance',
};

export function StaffCreateView() {
  const { setView } = useAppStore();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '', phone: '',
    password: '', role: 'loan', branchId: '',
  });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load branches
    (async () => {
      try {
        const res = await authFetch('/api/branches');
        if (res.ok) {
          const d = await res.json();
          setBranches(d.branches || []);
        }
      } catch (e) { console.error(e); }
    })();

    // Initialize permissions from role defaults
    applyRoleDefaults('loan');
  }, []);

  const applyRoleDefaults = (role: string) => {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    const newPerms: Record<string, boolean> = {};
    for (const p of PERMISSION_FLAGS) {
      newPerms[p] = rolePerms.includes('*') || rolePerms.includes(p);
    }
    setPerms(newPerms);
  };

  const handleRoleChange = (role: string) => {
    setForm({ ...form, role });
    applyRoleDefaults(role);
  };

  const togglePerm = (flag: string) => {
    setPerms({ ...perms, [flag]: !perms[flag] });
  };

  const save = async () => {
    if (!form.firstName || !form.lastName || !form.username || !form.email || !form.password) {
      toast({ title: 'Validation error', description: 'All fields including password are required', variant: 'destructive' });
      return;
    }
    if (form.password.length < 8) {
      toast({ title: 'Password too short', description: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Normalize branchId: convert "none" or "" to empty (API will set to null)
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone?.trim() || undefined,
        password: form.password,
        role: form.role,
        branchId: (form.branchId && form.branchId !== 'none') ? form.branchId : '',
        permissions: perms,
        adminId: currentAdmin?.id, // v34.1 fallback if JWT token is missing
      };
      console.log('[STAFF CREATE] Sending payload:', { ...payload, password: '[REDACTED]' });
      const res = await authFetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: 'Staff created successfully',
          description: `${form.firstName} ${form.lastName} can now login with username "${form.username}" and the password you set.`,
        });
        setView('staff');
      } else {
        console.error('[STAFF CREATE] Failed:', res.status, d);
        toast({
          title: `Failed to create staff (HTTP ${res.status})`,
          description: d.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.error('[STAFF CREATE] Network error:', e);
      toast({ title: 'Network error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setView('staff')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff
        </Button>
        <h1 className="text-xl font-bold text-slate-900 flex-1 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-emerald-600" /> Create Staff Account
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>The staff member will use these credentials to login.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">First Name *</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Last Name *</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Username *</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="mt-1 font-mono" placeholder="e.g. john.doe" />
          </div>
          <div>
            <Label className="text-xs">Email *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" placeholder="john@watershedcapital.com" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" placeholder="+234 803 000 0000" />
          </div>
          <div>
            <Label className="text-xs">Temporary Password *</Label>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" placeholder="Min 8 characters" />
            <p className="text-[10px] text-slate-400 mt-1">Staff will be asked to change this on first login.</p>
          </div>
          <div>
            <Label className="text-xs">Role *</Label>
            <Select value={form.role} onValueChange={handleRoleChange}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select
              value={form.branchId || 'none'}
              onValueChange={(v) => setForm({ ...form, branchId: v === 'none' ? '' : v })}
            >
              <SelectTrigger className="mt-1"><SelectValue placeholder="HQ / Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">HQ / Unassigned</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-emerald-600" /> Permission Matrix
          </CardTitle>
          <CardDescription>
            Defaults are loaded from the selected role. Toggle any permission ON or OFF — super admin has full control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto pr-2">
            {PERMISSION_FLAGS.map((flag) => {
              const enabled = perms[flag] === true;
              return (
                <div
                  key={flag}
                  className={cn(
                    'flex items-center justify-between rounded-md border p-2.5 transition-colors',
                    enabled ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                  )}
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <p className={cn('text-xs font-semibold truncate', enabled ? 'text-emerald-800' : 'text-slate-600')}>
                      {PERMISSION_LABELS[flag] || flag}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{flag}</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={() => togglePerm(flag)} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setView('staff')}>Cancel</Button>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Create Staff Account
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  PERMISSION_FLAGS,
  ROLE_LABELS,
} from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, User as UserIcon, Mail, Phone, Building2, Calendar,
  ShieldCheck, Loader2, AlertCircle, Wallet, CheckCircle2, FileCheck,
  Clock, MapPin,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';

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
};

export function StaffDetailView() {
  const { viewParams, setView } = useAppStore();
  const staffId = (viewParams.staffId || viewParams.id) as string | undefined;

  const [admin, setAdmin] = useState<any>(null);
  const [stats, setStats] = useState<{ assignedLoans: number; processedLoans: number; approvedLoans: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    (async () => {
      if (!staffId) {
        setError('No staff ID provided.');
        setLoading(false);
        return;
      }
      try {
        const res = await authFetch(`/api/admin/staff/${staffId}`);
        const d = await res.json();
        if (!res.ok) {
          setError(d.error || 'Failed to load staff record');
        } else {
          setAdmin(d.admin);
          setStats(d.stats);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load staff record');
      } finally {
        setLoading(false);
      }
    })();
  }, [staffId]);

  if (loading) {
    return (
      <div className="p-6 bg-slate-50 min-h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading staff profile...
        </div>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
        <Button variant="outline" size="sm" onClick={() => setView('staff')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff
        </Button>
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-900">{error || 'Staff not found'}</p>
        </Card>
      </div>
    );
  }

  const initials = `${admin.firstName?.[0] || ''}${admin.lastName?.[0] || ''}`.toUpperCase();
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d: string | null) =>
    d
      ? new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : 'Never';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setView('staff')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff
        </Button>
        <h1 className="text-xl font-bold text-slate-900 flex-1">Staff Profile</h1>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white text-2xl font-bold">
              {initials || <UserIcon className="h-8 w-8" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {admin.firstName} {admin.lastName}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {ROLE_LABELS[admin.role] || admin.role}
                </Badge>
                <Badge
                  className={cn(
                    'text-[10px]',
                    admin.status === 1
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  )}
                >
                  {admin.status === 1 ? 'Active' : 'Suspended'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoRow icon={Building2} label="Branch" value={admin.branch?.name ? `${admin.branch.name} (${admin.branch.code})` : 'HQ / Unassigned'} />
                <InfoRow icon={Mail} label="Email" value={admin.email || '—'} />
                <InfoRow icon={Phone} label="Phone" value={admin.phone || '—'} />
                <InfoRow icon={UserIcon} label="Username" value={`@${admin.username}`} mono />
                <InfoRow icon={Calendar} label="Joined" value={fmtDate(admin.createdAt)} />
                <InfoRow icon={Clock} label="Last Login" value={fmtDateTime(admin.lastLogin)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Personal info card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserIcon className="h-4 w-4 text-emerald-600" /> Personal Information
            </CardTitle>
            <CardDescription>Account and contact details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={UserIcon} label="First Name" value={admin.firstName} />
            <InfoRow icon={UserIcon} label="Last Name" value={admin.lastName} />
            <InfoRow icon={UserIcon} label="Username" value={`@${admin.username}`} mono />
            <InfoRow icon={Mail} label="Email" value={admin.email || '—'} />
            <InfoRow icon={Phone} label="Phone" value={admin.phone || '—'} />
            <InfoRow icon={Building2} label="Role Type" value={admin.roleType || '—'} />
            <InfoRow icon={MapPin} label="Branch" value={admin.branch?.name || 'HQ'} />
            <InfoRow
              icon={Calendar}
              label="Joined On"
              value={fmtDate(admin.createdAt)}
            />
            <InfoRow
              icon={Clock}
              label="Last Login"
              value={fmtDateTime(admin.lastLogin)}
            />
            {admin.lastLoginIp && (
              <InfoRow icon={MapPin} label="Last IP" value={admin.lastLoginIp} mono />
            )}
          </CardContent>
        </Card>

        {/* Permission matrix */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Permission Matrix
            </CardTitle>
            <CardDescription>
              Granular access flags assigned to this staff member. Role-implied permissions are not shown here — these are explicit flags on the admin record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-2">
              {PERMISSION_FLAGS.map((flag) => {
                const enabled = admin[flag] === true;
                return (
                  <div
                    key={flag}
                    className={cn(
                      'flex items-center justify-between rounded-md border p-2.5 transition-colors',
                      enabled
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          enabled
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-300 text-slate-500'
                        )}
                      >
                        {enabled ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <span className="text-[10px]">—</span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className={cn('text-xs font-semibold truncate', enabled ? 'text-emerald-800' : 'text-slate-600')}>
                          {PERMISSION_LABELS[flag] || flag}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{flag}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider ml-2',
                        enabled ? 'text-emerald-700' : 'text-slate-400'
                      )}
                    >
                      {enabled ? 'Granted' : 'Denied'}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-emerald-600" /> Loan Activity
            </CardTitle>
            <CardDescription>Loans associated with this staff member</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile
                icon={FileCheck}
                label="Assigned Loans"
                value={stats.assignedLoans}
                color="bg-blue-50 text-blue-700 border-blue-200"
                hint="Total loans created/assigned as Loan Officer"
              />
              <StatTile
                icon={ShieldCheck}
                label="Processed (BM)"
                value={stats.processedLoans}
                color="bg-amber-50 text-amber-700 border-amber-200"
                hint="Loans vetted as Branch Manager"
              />
              <StatTile
                icon={CheckCircle2}
                label="Approved (Live/Closed)"
                value={stats.approvedLoans}
                color="bg-emerald-50 text-emerald-700 border-emerald-200"
                hint="Loans now running or fully paid"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setView('staff')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Staff List
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({
  icon: Icon, label, value, mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={cn('text-sm text-slate-900 break-words', mono && 'font-mono')}>{value}</p>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, color, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  return (
    <div className={cn('rounded-md border p-4', color)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">{label}</p>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {hint && <p className="text-[10px] opacity-70 mt-1">{hint}</p>}
    </div>
  );
}

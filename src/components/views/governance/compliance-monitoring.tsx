'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  KYC_STATUS_LABELS, KYC_STATUS_BADGES, KYC_STATUSES,
} from '@/lib/constants';
import {
  CheckCircle2, XCircle, Clock, RefreshCw, FileWarning, ShieldCheck,
  FileText, AlertTriangle, UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ComplianceMonitoringView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/compliance/monitoring');
        const d = await res.json();
        setData(d);
      } catch (e) {
        console.error('Compliance monitoring load error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const kycCards = [
    { key: KYC_STATUSES.PENDING, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-100' },
    { key: KYC_STATUSES.APPROVED, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
    { key: KYC_STATUSES.DECLINED, icon: XCircle, color: 'text-red-700', bg: 'bg-red-100' },
    { key: KYC_STATUSES.RESUBMIT, icon: RefreshCw, color: 'text-orange-700', bg: 'bg-orange-100' },
    { key: 'UNVERIFIED', label: 'Unverified', icon: UserX, color: 'text-slate-700', bg: 'bg-slate-100' },
  ];

  const missingDocs = data?.missingDocStats || {};
  const missingCards = [
    { key: 'missing_passport', label: 'Missing Passport Photo', icon: FileWarning, value: missingDocs.missing_passport || 0 },
    { key: 'missing_id', label: 'Missing ID Document', icon: FileWarning, value: missingDocs.missing_id || 0 },
    { key: 'missing_guarantor_form', label: 'Missing Guarantor Form', icon: FileWarning, value: missingDocs.missing_guarantor_form || 0 },
    { key: 'missing_utility_bill', label: 'Missing Address Proof', icon: FileWarning, value: missingDocs.missing_utility_bill || 0 },
  ];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4 bg-gradient-to-br from-emerald-700 to-slate-900 text-white border-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Compliance Monitoring Dashboard
            </h2>
            <p className="text-xs text-emerald-100">Real-time KYC, document completeness, and policy acknowledgment oversight.</p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-2xl font-bold">{data?.pendingConditions || 0}</p>
              <p className="text-[10px] text-emerald-100">Pending Conditions</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-200">{data?.overdueConditions || 0}</p>
              <p className="text-[10px] text-emerald-100">Overdue</p>
            </div>
          </div>
        </div>
      </Card>

      {/* KYC status cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 px-1">KYC Status Distribution</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="p-4 animate-pulse"><div className="h-16 bg-slate-100 rounded" /></Card>
            ))
          ) : kycCards.map((c) => {
            const value = c.key === 'UNVERIFIED' ? (data?.unverified || 0) : (data?.kycStats?.[c.key] || 0);
            return (
              <Card key={c.key} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', c.bg)}>
                    <c.icon className={cn('h-4 w-4', c.color)} />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    {c.label || KYC_STATUS_LABELS[c.key]}
                  </span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-[10px] text-slate-500">customers</p>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Missing docs */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 px-1">Missing Documentation</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {missingCards.map((c) => (
            <Card key={c.key} className={cn('p-4', c.value > 0 && 'border-amber-200 bg-amber-50/50')}>
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={cn('h-4 w-4', c.value > 0 ? 'text-amber-600' : 'text-emerald-600')} />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{c.label}</span>
              </div>
              <p className={cn('text-2xl font-bold', c.value > 0 ? 'text-amber-700' : 'text-slate-900')}>{c.value}</p>
              <p className="text-[10px] text-slate-500">{c.value > 0 ? 'action required' : 'all complete'}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Policy ack rate */}
      <Card className="p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <FileText className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Policy Acknowledgment Rate</h3>
              <p className="text-xs text-slate-500">
                {data?.ackCount || 0} acknowledgments out of {data?.expectedAcknowledgments || 0} expected
                {' '}({data?.policiesCount || 0} policies × {data?.staffCount || 0} staff)
              </p>
            </div>
          </div>
          <div className="w-full md:w-80">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 font-semibold">Coverage</span>
              <span className="text-emerald-700 font-bold">{data?.policyAckRate || 0}%</span>
            </div>
            <Progress value={data?.policyAckRate || 0} className="h-2" />
          </div>
        </div>
      </Card>

      {/* Approvals & declines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Recent KYC Approvals</h3>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading...</p>
            ) : (data?.recentApprovals || []).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No recent approvals.</p>
            ) : data.recentApprovals.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-slate-100 p-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {a.admin ? `${a.admin.firstName} ${a.admin.lastName}` : 'System'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate max-w-xs">{a.description || '—'}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">approved</Badge>
                  <p className="text-[9px] text-slate-400 mt-1">{fmtDateTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-slate-900">Recent KYC Declines</h3>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading...</p>
            ) : (data?.recentDeclines || []).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No recent declines.</p>
            ) : data.recentDeclines.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-slate-100 p-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {a.admin ? `${a.admin.firstName} ${a.admin.lastName}` : 'System'}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate max-w-xs">{a.description || '—'}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-red-100 text-red-700 text-[9px]">declined</Badge>
                  <p className="text-[9px] text-slate-400 mt-1">{fmtDateTime(a.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

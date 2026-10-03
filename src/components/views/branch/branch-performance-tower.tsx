'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Users, DollarSign, Clock, MapPin, Bell, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmtNaira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
const fmtPercent = (n: number) => `${(n || 0).toFixed(1)}%`;
const fmtNum = (n: number) => (n || 0).toLocaleString('en-NG');

interface PerformanceData {
  branchId: string;
  branchName: string;
  period: { type: string; label: string; start: string; end: string; elapsedPercent: number };
  metrics: Array<{
    metricKey: string; label: string; category: string; unit: string;
    actual: number; target: number | null; achievementPercent: number | null;
    direction: string; status: string;
  }>;
  forecast: { disbursementForecast: number; collectionForecast: number; projectedGap: number; paceStatus: string };
  loAllocation: {
    branchTarget: number; loTotalAllocated: number; unallocated: number; isComplete: boolean;
    loBreakdown: Array<{ loId: string; loName: string; target: number; actual: number; achievement: number }>;
  };
  applicationFunnel: any;
  portfolioQuality: any;
  collections: any;
  operations: any;
  customerGrowth: any;
  fieldVisits: any;
  alerts: Array<{ metricKey: string; alertType: string; severity: string; message: string }>;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'on_track': case 'good': return 'text-emerald-600 bg-emerald-50';
    case 'watch': return 'text-amber-600 bg-amber-50';
    case 'at_risk': return 'text-red-600 bg-red-50';
    case 'ahead': return 'text-blue-600 bg-blue-50';
    default: return 'text-slate-600 bg-slate-50';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'on_track': return 'ON TRACK';
    case 'good': return 'GOOD';
    case 'watch': return 'WATCH';
    case 'at_risk': return 'AT RISK';
    case 'ahead': return 'AHEAD';
    default: return 'UNKNOWN';
  }
}

export function BranchPerformanceTower({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [tab, setTab] = useState('overview');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/branches/${branchId}/performance?period=${period}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to fetch branch performance:', e);
    } finally {
      setLoading(false);
    }
  }, [branchId, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-slate-400 text-sm">Loading branch performance data...</div></div>;
  }
  if (!data) {
    return <div className="flex items-center justify-center py-20"><div className="text-slate-400 text-sm">No performance data available for this branch.</div></div>;
  }

  const disbursement = data.metrics.find(m => m.metricKey === 'disbursement_amount');
  const loanCount = data.metrics.find(m => m.metricKey === 'loan_count');
  const collectionRate = data.metrics.find(m => m.metricKey === 'collection_rate');
  const par30 = data.metrics.find(m => m.metricKey === 'par30');
  const npl = data.metrics.find(m => m.metricKey === 'npl_ratio');

  function MetricCard({ metric }: { metric: any }) {
    const isLowerBetter = metric.direction === 'lower_is_better';
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{metric.label}</span>
            <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full', getStatusColor(metric.status))}>
              {getStatusLabel(metric.status)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {metric.unit === 'NGN' ? fmtNaira(metric.actual) : metric.unit === 'percent' ? fmtPercent(metric.actual) : fmtNum(metric.actual)}
            </span>
            {metric.target != null && metric.target > 0 && (
              <span className="text-xs text-slate-400">
                / {metric.unit === 'NGN' ? fmtNaira(metric.target) : metric.unit === 'percent' ? fmtPercent(metric.target) : fmtNum(metric.target)}
              </span>
            )}
          </div>
          {metric.achievementPercent != null && (
            <div className="mt-2">
              <Progress value={Math.min(100, metric.achievementPercent)} className="h-1.5" />
              <span className="text-[10px] text-slate-400 mt-0.5">{metric.achievementPercent.toFixed(0)}% achieved</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function FunnelStep({ label, value, prevValue, color }: { label: string; value: number; prevValue?: number; color: string }) {
    const conversion = prevValue && prevValue > 0 ? (value / prevValue) * 100 : null;
    return (
      <div className="flex items-center gap-3 py-2">
        <div className={cn('w-2 h-8 rounded-full', color)} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">{label}</span>
            <span className="text-sm font-bold text-slate-900">{fmtNum(value)}</span>
          </div>
          {conversion != null && <div className="text-[10px] text-slate-400">{conversion.toFixed(0)}% conversion</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-600" />
            {branchName} Performance Control Tower
          </h2>
          <p className="text-xs text-slate-500">{data.period.label} ({data.period.type}) - {data.period.elapsedPercent.toFixed(0)}% elapsed</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.alerts.length > 0 && (
        <div className="space-y-1.5">
          {data.alerts.slice(0, 5).map((alert, i) => (
            <div key={i} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs', alert.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700')}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-emerald-700 font-semibold">Disbursement Forecast</div>
            <div className="text-xl font-bold text-emerald-900">{fmtNaira(data.forecast.disbursementForecast)}</div>
            <div className="text-[10px] text-emerald-600">Gap: {fmtNaira(Math.abs(data.forecast.projectedGap))} {data.forecast.projectedGap >= 0 ? 'behind' : 'ahead'}</div>
          </CardContent>
        </Card>
        <Card className={cn('border', data.forecast.paceStatus === 'on_track' ? 'bg-emerald-50 border-emerald-200' : data.forecast.paceStatus === 'watch' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200')}>
          <CardContent className="p-3">
            <div className="text-[10px] uppercase text-slate-600 font-semibold">Pace Status</div>
            <div className={cn('text-xl font-bold', data.forecast.paceStatus === 'on_track' ? 'text-emerald-700' : data.forecast.paceStatus === 'watch' ? 'text-amber-700' : 'text-red-700')}>{getStatusLabel(data.forecast.paceStatus)}</div>
            <div className="text-[10px] text-slate-500">{data.period.elapsedPercent.toFixed(0)}% period elapsed</div>
          </CardContent>
        </Card>
        <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500 font-semibold">Collection Forecast</div><div className="text-xl font-bold text-slate-700">{fmtNaira(data.forecast.collectionForecast)}</div><div className="text-[10px] text-slate-400">Expected run-rate</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500 font-semibold">Active Alerts</div><div className="text-xl font-bold text-slate-700">{data.alerts.length}</div><div className="text-[10px] text-slate-400">Items needing attention</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-6 md:grid-cols-12 w-full h-auto">
          <TabsTrigger value="overview" className="text-[10px]">Overview</TabsTrigger>
          <TabsTrigger value="sales" className="text-[10px]">Sales</TabsTrigger>
          <TabsTrigger value="portfolio" className="text-[10px]">Portfolio</TabsTrigger>
          <TabsTrigger value="collections" className="text-[10px]">Collections</TabsTrigger>
          <TabsTrigger value="customers" className="text-[10px]">Customers</TabsTrigger>
          <TabsTrigger value="operations" className="text-[10px]">Operations</TabsTrigger>
          <TabsTrigger value="staff" className="text-[10px]">Staff</TabsTrigger>
          <TabsTrigger value="financial" className="text-[10px]">Financial</TabsTrigger>
          <TabsTrigger value="field" className="text-[10px]">Field</TabsTrigger>
          <TabsTrigger value="targets" className="text-[10px]">Targets</TabsTrigger>
          <TabsTrigger value="alerts" className="text-[10px]">Alerts</TabsTrigger>
          <TabsTrigger value="history" className="text-[10px]">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {disbursement && <MetricCard metric={disbursement} />}
            {loanCount && <MetricCard metric={loanCount} />}
            {collectionRate && <MetricCard metric={collectionRate} />}
            {par30 && <MetricCard metric={par30} />}
            {npl && <MetricCard metric={npl} />}
          </div>
        </TabsContent>

        <TabsContent value="sales" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Loan Funnel</CardTitle></CardHeader>
            <CardContent>
              <FunnelStep label="Customers" value={data.applicationFunnel.customers} color="bg-blue-400" />
              <FunnelStep label="Applications" value={data.applicationFunnel.applications} prevValue={data.applicationFunnel.customers} color="bg-indigo-400" />
              <FunnelStep label="KYC Completed" value={data.applicationFunnel.kycCompleted} prevValue={data.applicationFunnel.applications} color="bg-purple-400" />
              <FunnelStep label="Submitted" value={data.applicationFunnel.submitted} prevValue={data.applicationFunnel.kycCompleted} color="bg-violet-400" />
              <FunnelStep label="Approved" value={data.applicationFunnel.approved} prevValue={data.applicationFunnel.submitted} color="bg-emerald-400" />
              <FunnelStep label="Disbursed" value={data.applicationFunnel.disbursed} prevValue={data.applicationFunnel.approved} color="bg-teal-400" />
              <FunnelStep label="First Payments" value={data.applicationFunnel.firstPayments} prevValue={data.applicationFunnel.disbursed} color="bg-green-400" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Portfolio Outstanding</div><div className="text-lg font-bold text-slate-800">{fmtNaira(data.portfolioQuality.portfolioOutstanding)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">PAR 30</div><div className="text-lg font-bold text-orange-600">{fmtNaira(data.portfolioQuality.par30)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">NPL Ratio</div><div className="text-lg font-bold text-red-700">{fmtPercent(data.portfolioQuality.nplRatio)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Overdue</div><div className="text-lg font-bold text-amber-600">{fmtNaira(data.portfolioQuality.overdueAmount)}</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Amount Due</div><div className="text-lg font-bold text-slate-800">{fmtNaira(data.collections.amountDue)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Collected</div><div className="text-lg font-bold text-emerald-600">{fmtNaira(data.collections.amountCollected)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Collection Rate</div><div className="text-lg font-bold text-emerald-600">{fmtPercent(data.collections.collectionRate)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Overdue</div><div className="text-lg font-bold text-red-600">{fmtNaira(data.collections.overdueAmount)}</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">New</div><div className="text-lg font-bold text-emerald-600">{fmtNum(data.customerGrowth.newCustomers)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Active</div><div className="text-lg font-bold text-slate-800">{fmtNum(data.customerGrowth.activeCustomers)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Repeat</div><div className="text-lg font-bold text-blue-600">{fmtNum(data.customerGrowth.repeatCustomers)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Referrals</div><div className="text-lg font-bold text-purple-600">{fmtNum(data.customerGrowth.referrals)}</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Waiting</div><div className="text-lg font-bold text-amber-600">{fmtNum(data.operations.applicationsWaiting)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">SLA Breaches</div><div className={cn('text-lg font-bold', data.operations.slaBreaches > 0 ? 'text-red-600' : 'text-emerald-600')}>{fmtNum(data.operations.slaBreaches)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Avg Turnaround</div><div className="text-lg font-bold text-slate-800">{data.operations.avgTurnaroundHours.toFixed(1)}h</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Oldest</div><div className="text-lg font-bold text-slate-800">{data.operations.oldestApplicationHours.toFixed(0)}h</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="staff" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">LO Target Allocation</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><div className="text-[10px] uppercase text-slate-500">Branch Target</div><div className="text-lg font-bold text-slate-800">{fmtNaira(data.loAllocation.branchTarget)}</div></div>
                <div><div className="text-[10px] uppercase text-slate-500">LO Allocated</div><div className="text-lg font-bold text-slate-800">{fmtNaira(data.loAllocation.loTotalAllocated)}</div></div>
                <div><div className="text-[10px] uppercase text-slate-500">Unallocated</div><div className={cn('text-lg font-bold', data.loAllocation.unallocated > 0 ? 'text-amber-600' : 'text-emerald-600')}>{data.loAllocation.unallocated > 0 ? `⚠ ${fmtNaira(data.loAllocation.unallocated)}` : '✓ Complete'}</div></div>
              </div>
              <div className="space-y-1">
                {data.loAllocation.loBreakdown.map((lo, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                    <span className="text-slate-600">{lo.loName}</span>
                    <span className="font-medium text-slate-800">{fmtNaira(lo.target)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-3">
          <Card><CardContent className="p-4"><div className="text-sm text-slate-400">Financial performance metrics require branch-level revenue attribution from the accounting system.</div></CardContent></Card>
        </TabsContent>

        <TabsContent value="field" className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Total Visits</div><div className="text-lg font-bold text-slate-800">{fmtNum(data.fieldVisits.totalVisits)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">GPS Verified</div><div className="text-lg font-bold text-emerald-600">{fmtNum(data.fieldVisits.gpsVerified)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Inspections</div><div className="text-lg font-bold text-slate-800">{fmtNum(data.fieldVisits.collateralInspections)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[10px] uppercase text-slate-500">Follow-ups</div><div className="text-lg font-bold text-slate-800">{fmtNum(data.fieldVisits.followUpVisits)}</div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="targets" className="space-y-3">
          <Card><CardContent className="p-4"><div className="text-sm text-slate-500 mb-2">Target management is available at the Branch Targets page with versioning, metric catalog, and approval workflow.</div><Button size="sm" variant="outline">Open Target Manager →</Button></CardContent></Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-3">
          <div className="space-y-2">
            {data.alerts.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-sm text-slate-400">No active alerts. All metrics are within thresholds.</CardContent></Card>
            ) : (
              data.alerts.map((alert, i) => (
                <Card key={i} className={cn('border', alert.severity === 'critical' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <AlertTriangle className={cn('w-4 h-4 flex-shrink-0', alert.severity === 'critical' ? 'text-red-600' : 'text-amber-600')} />
                    <div>
                      <div className="text-xs font-medium text-slate-800">{alert.message}</div>
                      <div className="text-[10px] text-slate-500">{alert.metricKey} - {alert.alertType}</div>
                    </div>
                    <Badge className={cn('ml-auto text-[9px]', alert.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white')}>{alert.severity.toUpperCase()}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <Card><CardContent className="p-4"><div className="text-sm text-slate-400">Target version history and approval audit trail are available at the Branch Targets page.</div></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

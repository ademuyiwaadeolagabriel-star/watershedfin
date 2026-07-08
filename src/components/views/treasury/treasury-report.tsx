'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TrendingUp, TrendingDown, Percent, FileDown, Search } from 'lucide-react';
import { fmtNaira } from '@/lib/format';

export function TreasuryReport() {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/treasury/reports?from=${from}&to=${to}`).then((r) => r.json());
      setData(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const nimPositive = (data?.nim ?? 0) >= 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NIM Report</h1>
          <p className="text-sm text-slate-500">Net Interest Margin · Treasury income vs. interest expense</p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={load} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">Run</Button>
          <Button variant="outline"><FileDown className="h-4 w-4 mr-1.5" /> Export</Button>
        </div>
      </div>

      {/* Dark hero cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DarkCard
          icon={TrendingUp}
          label="Total Treasury Income"
          value={fmtNaira(data?.totalTreasuryIncome || 0)}
          sub="T-bills, placements, investments"
          accent="emerald"
        />
        <DarkCard
          icon={TrendingDown}
          label="Interest Expense"
          value={fmtNaira(data?.totalInterestExpense || 0)}
          sub="Cost of funds"
          accent="rose"
        />
        <DarkCard
          icon={Percent}
          label="Net Interest Margin (NIM)"
          value={`${(data?.nim ?? 0).toFixed(2)}%`}
          sub={nimPositive ? 'Healthy margin' : 'Margin under pressure'}
          accent={nimPositive ? 'emerald' : 'rose'}
          badge={nimPositive ? 'Positive' : 'Negative'}
        />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Income Breakdown</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Treasury Income</TableCell>
              <TableCell className="text-right text-emerald-700">{fmtNaira(data?.totalTreasuryIncome || 0)}</TableCell>
              <TableCell className="text-xs text-slate-500">Accrued interest from investments + bank assets</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Loan Interest Income</TableCell>
              <TableCell className="text-right text-emerald-700">{fmtNaira(data?.totalLoanIncome || 0)}</TableCell>
              <TableCell className="text-xs text-slate-500">Interest earned from loan portfolio</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Interest Expense</TableCell>
              <TableCell className="text-right text-rose-700">{fmtNaira(data?.totalInterestExpense || 0)}</TableCell>
              <TableCell className="text-xs text-slate-500">Cost of customer deposits & borrowings</TableCell>
            </TableRow>
            <TableRow className="bg-slate-50 font-semibold">
              <TableCell>Net Interest Income</TableCell>
              <TableCell className="text-right">
                {fmtNaira(((data?.totalTreasuryIncome || 0) + (data?.totalLoanIncome || 0) - (data?.totalInterestExpense || 0)))}
              </TableCell>
              <TableCell className="text-xs text-slate-500">Total income − interest expense</TableCell>
            </TableRow>
            <TableRow className="bg-slate-50 font-semibold">
              <TableCell>NIM %</TableCell>
              <TableCell className="text-right">{(data?.nim ?? 0).toFixed(2)}%</TableCell>
              <TableCell className="text-xs text-slate-500">Net interest income ÷ total interest income</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-slate-400" />
          <h3 className="font-semibold">Interpretation</h3>
        </div>
        <p className="text-sm text-slate-600">
          {nimPositive
            ? `A NIM of ${(data?.nim ?? 0).toFixed(2)}% indicates the bank is earning more on its assets than it pays on liabilities. Continue optimizing the asset mix.`
            : `A NIM of ${(data?.nim ?? 0).toFixed(2)}% signals pressure — interest expense is consuming too much of income. Review deposit pricing and treasury allocation.`}
        </p>
      </Card>
    </div>
  );
}

function DarkCard({ icon: Icon, label, value, sub, accent, badge }: any) {
  const accents: Record<string, string> = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
  };
  return (
    <Card className="p-5 bg-slate-900 text-white border-slate-800">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
        <Icon className={`h-5 w-5 ${accents[accent]}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <div className="flex items-center gap-2 mt-2">
        <p className="text-xs text-slate-400">{sub}</p>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badge === 'Positive' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {badge}
          </span>
        )}
      </div>
    </Card>
  );
}

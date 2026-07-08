'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Calculator, TrendingDown, Calendar, Wallet, Percent,
  ChevronRight, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculateLoanSchedule, fmtNaira, fmtDate } from '@/lib/loan-calc';

export function CustomerLoanCalculator() {
  const { setView } = useAppStore();
  const [amount, setAmount] = useState('500000');
  const [rate, setRate] = useState('24');
  const [tenor, setTenor] = useState('12');
  const [method, setMethod] = useState<'REDUCING' | 'FLAT'>('REDUCING');
  const [ccd, setCcd] = useState('10');
  const [upfront, setUpfront] = useState('1');

  const calc = useMemo(() => {
    try {
      return calculateLoanSchedule(
        Number(amount) || 0,
        Number(rate) || 24,
        Number(tenor) || 1,
        method,
        new Date(),
        Number(ccd) || 0,
        Number(upfront) || 0,
        0,
      );
    } catch { return null; }
  }, [amount, rate, tenor, method, ccd, upfront]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Loan Calculator</h1>
            <p className="text-xs text-slate-500">Estimate your monthly payments and total cost</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Inputs */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Loan Parameters</h3>
            </div>

            <div>
              <Label className="text-xs">Loan Amount (₦)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 text-lg font-bold" />
              <div className="flex gap-1 mt-2">
                {[100000, 500000, 1000000, 5000000].map(v => (
                  <button key={v} onClick={() => setAmount(String(v))} className="text-[10px] rounded px-2 py-1 bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700">
                    {fmtNaira(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Interest Rate (% p.a.)</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label className="text-xs">Loan Tenor (months)</Label>
              <div className="grid grid-cols-6 gap-1 mt-1">
                {[3, 6, 9, 12, 18, 24].map(m => (
                  <button
                    key={m}
                    onClick={() => setTenor(String(m))}
                    className={cn(
                      'rounded px-2 py-1.5 text-xs font-medium',
                      tenor === String(m) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {m}mo
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Repayment Method</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['REDUCING', 'FLAT'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-xs font-medium',
                      method === m ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
                    )}
                  >
                    {m === 'REDUCING' ? 'Reducing Balance' : 'Flat Rate'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">CCD (%)</Label>
                <Input type="number" value={ccd} onChange={(e) => setCcd(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Upfront Fee (%)</Label>
                <Input type="number" value={upfront} onChange={(e) => setUpfront(e.target.value)} className="mt-1" />
              </div>
            </div>
          </Card>

          {/* Results */}
          {calc && (
            <div className="space-y-4">
              {/* Monthly payment hero */}
              <Card className="p-6 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white border-0">
                <p className="text-emerald-200 text-xs uppercase tracking-wider mb-1">Your Monthly Payment</p>
                <p className="text-4xl font-bold">{fmtNaira(calc.monthlyInstallment)}</p>
                <p className="text-emerald-200 text-xs mt-2">for {calc.tenorMonths} months · {method === 'REDUCING' ? 'Reducing Balance' : 'Flat Rate'}</p>
              </Card>

              {/* Cost breakdown */}
              <Card className="p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Cost Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Principal</span>
                    <span className="font-semibold">{fmtNaira(calc.principal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Interest</span>
                    <span className="font-semibold text-amber-600">{fmtNaira(calc.totalInterest)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Upfront Fee</span>
                    <span className="font-semibold text-red-600">{fmtNaira(calc.upfrontFeeAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">CCD (refundable)</span>
                    <span className="font-semibold text-red-600">{fmtNaira(calc.ccdAmount)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between font-bold">
                    <span>Total Repayment</span>
                    <span className="text-emerald-700">{fmtNaira(calc.totalRepayment)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Net Disbursement (you receive)</span>
                    <span className="font-semibold text-blue-600">{fmtNaira(calc.netDisbursement)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Total Cost of Credit</span>
                    <span className="font-semibold text-red-600">{fmtNaira(calc.totalCostOfCredit)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Effective APR</span>
                    <span className="font-semibold">{calc.effectiveAPR.toFixed(2)}%</span>
                  </div>
                </div>
              </Card>

              <Button onClick={() => setView('customer-apply' as any)} className="w-full bg-emerald-600 hover:bg-emerald-700">
                <ArrowRight className="h-4 w-4 mr-1" /> Apply for This Loan
              </Button>
            </div>
          )}
        </div>

        {/* Schedule preview */}
        {calc && (
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Repayment Schedule Preview</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] uppercase text-slate-500">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Due Date</th>
                    <th className="px-3 py-2 text-right">Installment</th>
                    <th className="px-3 py-2 text-right">Interest</th>
                    <th className="px-3 py-2 text-right">Principal</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calc.schedule.slice(0, 6).map((row) => (
                    <tr key={row.month}>
                      <td className="px-3 py-2 font-mono text-xs">{row.month}</td>
                      <td className="px-3 py-2 text-xs">{fmtDate(row.dueDate)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-bold">{fmtNaira(row.installment)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-amber-600">{fmtNaira(row.interest)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{fmtNaira(row.principal)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtNaira(row.closingBalance)}</td>
                    </tr>
                  ))}
                  {calc.schedule.length > 6 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-center text-xs text-slate-500">
                        ... {calc.schedule.length - 6} more payments · Total: {fmtNaira(calc.totalRepayment)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

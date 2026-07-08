'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, CreditCard, TrendingDown, CheckCircle2, AlertCircle,
  Calendar, Wallet, Receipt, ChevronRight, Building2, Clock, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtNaira, fmtDate, fmtDateTime } from '@/lib/loan-calc';

export function CustomerPayBack() {
  const { currentUser, viewParams, setView } = useAppStore();
  const loanId = viewParams.loanId as string;
  const [data, setData] = useState<any>(null);
  const [earlyPayoff, setEarlyPayoff] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!loanId || !currentUser) return;
      try {
        const [breakdownRes, payoffRes] = await Promise.all([
          fetch(`/api/customer/loan/${loanId}/breakdown?userId=${currentUser.id}`).then(r => r.json()),
          fetch(`/api/customer/loan/${loanId}/early-payoff?userId=${currentUser.id}`).then(r => r.json()).catch(() => ({})),
        ]);
        setData(breakdownRes);
        setEarlyPayoff(payoffRes);
        // Default payment = next due installment
        if (breakdownRes.progress?.nextDue) {
          setPaymentAmount(String(Math.round(breakdownRes.progress.nextDue.installment)));
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [loanId, currentUser]);

  const handlePayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setError('Enter a valid payment amount');
      return;
    }
    setPaying(true);
    setError('');
    try {
      const res = await fetch(`/api/customer/loan/${loanId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          amount: Number(paymentAmount),
          paymentMethod,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setLastReceipt(d.receipt || null);
      setSuccess(true);
      // Refresh data
      const refresh = await fetch(`/api/customer/loan/${loanId}/breakdown?userId=${currentUser.id}`).then(r => r.json());
      setData(refresh);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-slate-400">Loading...</div>;
  if (!data) return <div className="p-6 text-center text-red-500">Failed to load</div>;

  const { loan, calculation, summary, progress } = data;
  const payments = (loan.loanTransactions?.filter((t: any) => t.type === 'repayment') || []).slice().sort((a: any, b: any) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());

  const handleDownloadReceipt = async (paymentId: string) => {
    if (!currentUser) return;
    setDownloadingId(paymentId);
    try {
      const url = `/api/customer/loan/${loanId}/receipt?userId=${currentUser.id}&paymentId=${paymentId}&download=1`;
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to generate receipt');
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `Receipt_${data?.loan?.applicationRef || loanId}_${paymentId.slice(-6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      alert('Failed to download receipt: ' + e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="p-8 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Payment Successful! 🎉</h2>
            <p className="text-sm text-slate-600 mb-2">
              Your payment of <strong>{fmtNaira(Number(paymentAmount))}</strong> has been recorded.
              Thank you for your payment.
            </p>
            {lastReceipt && (
              <div className="mb-6 rounded-md bg-slate-50 border border-slate-200 p-4 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs font-bold uppercase text-slate-500">Receipt</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">Receipt #</span>
                  <span className="font-mono font-bold text-slate-900">{lastReceipt.receiptNumber}</span>
                  <span className="text-slate-500">Reference</span>
                  <span className="font-mono text-slate-900">{lastReceipt.reference}</span>
                  <span className="text-slate-500">Method</span>
                  <span className="capitalize text-slate-900">{(lastReceipt.paymentMethod || 'bank_transfer').replace('_', ' ')}</span>
                  <span className="text-slate-500">Outstanding</span>
                  <span className="font-bold text-slate-900">{fmtNaira(lastReceipt.outstandingBalance)}</span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {lastReceipt && (
                <Button
                  onClick={() => handleDownloadReceipt(lastReceipt.transactionId)}
                  disabled={downloadingId === lastReceipt.transactionId}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="h-4 w-4 mr-1" />
                  {downloadingId === lastReceipt.transactionId ? 'Generating...' : 'Download Receipt (PDF)'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setView('customer-loan-breakdown' as any, { loanId })}
              >
                View Loan Breakdown
              </Button>
              <Button variant="outline" onClick={() => setView('customer-dashboard')}>
                Go to Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView('customer-loan-breakdown' as any, { loanId })}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Loan
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">Pay Back Your Loan</h1>
            <p className="text-xs text-slate-500">{loan.applicationRef} · {fmtNaira(summary.principal)} · {summary.tenorMonths} months</p>
          </div>
        </div>

        {/* Outstanding balance hero */}
        <Card className="p-6 bg-gradient-to-r from-emerald-700 to-slate-900 text-white border-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Outstanding Balance</p>
              <p className="text-2xl font-bold">{fmtNaira(progress.outstandingBalance)}</p>
            </div>
            <div>
              <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Next Payment</p>
              <p className="text-2xl font-bold">{progress.nextDue ? fmtNaira(progress.nextDue.installment) : '—'}</p>
            </div>
            <div>
              <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Due Date</p>
              <p className="text-2xl font-bold">{progress.nextDue ? fmtDate(progress.nextDue.dueDate) : '—'}</p>
            </div>
            <div>
              <p className="text-emerald-200 text-[10px] uppercase tracking-wider">Payments Made</p>
              <p className="text-2xl font-bold">{progress.paidCount}/{progress.totalCount}</p>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-emerald-200">Repayment Progress</span>
              <span className="font-bold">{progress.progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full" style={{ width: `${progress.progressPercent}%` }} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Make a payment */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Make a Payment</h3>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Payment Amount (₦)</Label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="mt-1 text-lg font-bold"
                />
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => setPaymentAmount(String(Math.round(summary.monthlyInstallment)))}
                    className="text-[10px] rounded px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200"
                  >
                    Monthly: {fmtNaira(summary.monthlyInstallment)}
                  </button>
                  <button
                    onClick={() => earlyPayoff && setPaymentAmount(String(Math.round(earlyPayoff.totalPayoff)))}
                    className="text-[10px] rounded px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200"
                  >
                    Pay Off: {earlyPayoff ? fmtNaira(earlyPayoff.totalPayoff) : '—'}
                  </button>
                  <button
                    onClick={() => setPaymentAmount(String(Math.round(summary.monthlyInstallment * 3)))}
                    className="text-[10px] rounded px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200"
                  >
                    3 Months
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Payment Method</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[
                    { id: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
                    { id: 'card', label: 'Debit Card', icon: CreditCard },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium',
                          paymentMethod === m.id ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'
                        )}
                      >
                        <Icon className="h-4 w-4" /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Card className="p-3 bg-slate-50 border-slate-200">
                <p className="text-[10px] text-slate-500 uppercase mb-1">Payment Summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Amount</span>
                  <span className="font-bold">{fmtNaira(Number(paymentAmount) || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Convenience Fee</span>
                  <span className="text-emerald-600">FREE</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-slate-200 mt-1 pt-1">
                  <span>Total</span>
                  <span>{fmtNaira(Number(paymentAmount) || 0)}</span>
                </div>
              </Card>

              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
              )}

              <Button
                onClick={handlePayment}
                disabled={paying || !paymentAmount}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {paying ? 'Processing Payment...' : `Pay ${fmtNaira(Number(paymentAmount) || 0)}`}
              </Button>
              <p className="text-[10px] text-slate-500 text-center">
                Demo mode — no actual money will be charged. Payment will be recorded instantly.
              </p>
            </div>
          </Card>

          {/* Early payoff calculator */}
          {earlyPayoff && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Early Payoff Calculator</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Pay off your loan early and save on remaining interest. A 2% penalty applies on remaining interest.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Month</span>
                  <span className="font-semibold">{earlyPayoff.currentMonth} of {earlyPayoff.totalMonths}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Months Remaining</span>
                  <span className="font-semibold">{earlyPayoff.monthsRemaining}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Principal</span>
                  <span className="font-semibold">{fmtNaira(earlyPayoff.remainingPrincipal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Remaining Interest</span>
                  <span className="font-semibold text-amber-600">{fmtNaira(earlyPayoff.remainingInterest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Early Payoff Penalty (2%)</span>
                  <span className="font-semibold text-red-600">{fmtNaira(earlyPayoff.penaltyAmount)}</span>
                </div>
                <div className="pt-2 border-t border-slate-100 flex justify-between">
                  <span className="font-bold text-slate-900">Total to Pay Off</span>
                  <span className="font-bold text-purple-700 text-lg">{fmtNaira(earlyPayoff.totalPayoff)}</span>
                </div>
                <div className="rounded-md bg-emerald-50 p-2 text-center">
                  <p className="text-xs text-emerald-700">You save <strong>{fmtNaira(earlyPayoff.interestSaved)}</strong> by paying off early!</p>
                </div>
                <Button
                  onClick={() => setPaymentAmount(String(Math.round(earlyPayoff.totalPayoff)))}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  Use This Amount for Payment
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Payment history */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Payment History</h3>
            <Badge variant="outline" className="text-[10px]">{payments.length} payment(s)</Badge>
          </div>
          {payments.length === 0 ? (
            <div className="text-center py-8">
              <Receipt className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No payments made yet</p>
              <p className="text-xs text-slate-400 mt-1">Your first payment is due {progress.nextDue ? fmtDate(progress.nextDue.dueDate) : 'soon'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] uppercase text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs">{fmtDateTime(p.transactionDate)}</td>
                      <td className="px-3 py-2 text-xs font-mono text-slate-500">{p.reference}</td>
                      <td className="px-3 py-2 text-xs capitalize">{p.metadata ? (() => { try { return JSON.parse(p.metadata).paymentMethod || 'bank_transfer'; } catch { return 'bank_transfer'; } })() : 'bank_transfer'}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600">+{fmtNaira(p.amount)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Success</Badge>
                          <button
                            onClick={() => handleDownloadReceipt(p.id)}
                            disabled={downloadingId === p.id}
                            title="Download receipt"
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <Download className="h-3 w-3" />
                            {downloadingId === p.id ? '...' : 'PDF'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-xs uppercase">Total Paid</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmtNaira(payments.reduce((s: number, p: any) => s + p.amount, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

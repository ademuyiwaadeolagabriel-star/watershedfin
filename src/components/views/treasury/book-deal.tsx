'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarDays, TrendingUp, Calculator, ArrowRight } from 'lucide-react';
import { fmtNaira, fmtDate, addDays } from '@/lib/format';
import { authFetch } from '@/lib/auth-client';

export function BookDeal() {
  const { setView, currentAdmin } = useAppStore();
  const [products, setProducts] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any[]>([]);
  const [form, setForm] = useState({
    userId: '', productId: '', principal: 0, tenorDays: 90,
    rate: 0, payoutType: 'backend', rolloverType: 'none',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const [p, i] = await Promise.all([
        authFetch('/api/treasury/products').then((r) => r.json()),
        authFetch('/api/treasury/investors').then((r) => r.json()),
      ]);
      setProducts((p.products || []).filter((x: any) => x.isActive));
      setInvestors(i.profiles || []);
    })();
  }, []);

  const selectedProduct = products.find((p) => p.id === form.productId);

  // Auto-fill rate from product
  useEffect(() => {
    if (selectedProduct && !form.rate) {
      setForm((f) => ({ ...f, rate: selectedProduct.interestRatePa, tenorDays: selectedProduct.minTenorDays }));
    }
  }, [selectedProduct]);

  const simulation = useMemo(() => {
    const principal = Number(form.principal) || 0;
    const rate = Number(form.rate) || 0;
    const tenor = Number(form.tenorDays) || 0;
    const startDate = new Date();
    const maturity = addDays(startDate, tenor);
    const interest = (principal * rate / 100) * (tenor / 365);
    const wht = (interest * (selectedProduct?.whtRate ?? 10)) / 100;
    const net = principal + interest - wht;
    return { principal, interest, wht, net, maturity, startDate };
  }, [form, selectedProduct]);

  const submit = async () => {
    if (!form.userId) return alert('Select an investor');
    if (!form.productId) return alert('Select a product');
    if (!form.principal || form.principal <= 0) return alert('Enter principal');
    setSubmitting(true);
    try {
      const r = await authFetch('/api/treasury/investments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bookedBy: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setResult(d.investment);
    } catch (e: any) { alert(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Book Treasury Deal</h1>
        <p className="text-sm text-slate-500">Subscribe an investor to a treasury product</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="p-5 space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Investor</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investor profile" /></SelectTrigger>
                <SelectContent>
                  {investors.map((inv) => (
                    <SelectItem key={inv.id} value={inv.userId}>
                      {inv.user ? `${inv.user.firstName} ${inv.user.lastName}` : 'Unknown'} · {inv.riskTolerance}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {investors.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No investor profiles. Onboard one first.</p>
              )}
            </div>
            <div>
              <Label>Product</Label>
              <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v, rate: 0 })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} · {p.interestRatePa}% p.a.</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Principal Amount (₦)</Label>
              <Input
                type="number"
                value={form.principal || ''}
                onChange={(e) => setForm({ ...form, principal: Number(e.target.value) })}
              />
              {selectedProduct && (
                <p className="text-xs text-slate-500 mt-1">
                  Min: {fmtNaira(selectedProduct.minAmount)} · Max: {fmtNaira(selectedProduct.maxAmount || 0)}
                </p>
              )}
            </div>
            <div>
              <Label>Tenor (days)</Label>
              <Input
                type="number"
                value={form.tenorDays || ''}
                onChange={(e) => setForm({ ...form, tenorDays: Number(e.target.value) })}
              />
              {selectedProduct && (
                <p className="text-xs text-slate-500 mt-1">
                  Range: {selectedProduct.minTenorDays}–{selectedProduct.maxTenorDays} days
                </p>
              )}
            </div>
            <div>
              <Label>Interest Rate (% p.a.)</Label>
              <Input
                type="number" step="0.1"
                value={form.rate || ''}
                onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Payout Type</Label>
              <Select value={form.payoutType} onValueChange={(v) => setForm({ ...form, payoutType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="backend">Backend (at maturity)</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="compounding">Compounding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Rollover Instruction</Label>
              <Select value={form.rolloverType} onValueChange={(v) => setForm({ ...form, rolloverType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rollover (redeem at maturity)</SelectItem>
                  <SelectItem value="principal_only">Rollover principal only</SelectItem>
                  <SelectItem value="principal_plus_interest">Rollover principal + interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setView('treasury-dashboard')}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? 'Booking…' : 'Book Investment'}
            </Button>
          </div>
        </Card>

        {/* Simulation */}
        <Card className="p-5 space-y-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-400" />
            <h3 className="font-semibold">Live Simulation</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Principal</span>
              <span className="font-medium">{fmtNaira(simulation.principal)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Rate</span>
              <span className="font-medium">{form.rate || 0}% p.a.</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Tenor</span>
              <span className="font-medium">{form.tenorDays || 0} days</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <span className="text-slate-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Maturity</span>
              <span className="font-medium">{fmtDate(simulation.maturity)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">Gross Interest</span>
              <span className="font-medium text-emerald-400">{fmtNaira(simulation.interest)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-700 pb-2">
              <span className="text-slate-400">WHT ({selectedProduct?.whtRate ?? 10}%)</span>
              <span className="font-medium text-red-400">-{fmtNaira(simulation.wht)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-300 flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Maturity Value</span>
              <span className="text-xl font-bold text-emerald-400">{fmtNaira(simulation.net)}</span>
            </div>
          </div>
          {result && (
            <div className="p-3 rounded-lg bg-emerald-600 text-white text-sm">
              <p className="font-semibold">Deal booked successfully!</p>
              <p className="text-xs mt-1">Subscription: {result.subscriptionCode}</p>
              <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => setView('treasury-dashboard')}>
                View Portfolio <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

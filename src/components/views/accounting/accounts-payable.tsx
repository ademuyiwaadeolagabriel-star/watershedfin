'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Banknote, Building2, Receipt } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';

const BILL_STATUS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  unpaid: 'bg-rose-100 text-rose-700',
};

export function AccountsPayable() {
  const { currentAdmin } = useAppStore() as any;
  const [tab, setTab] = useState('vendors');
  const [vendors, setVendors] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<any | null>(null);
  const [vendorForm, setVendorForm] = useState<any>({ name: '', email: '', phone: '', bankName: '', accountNumber: '', accountName: '', paymentTerms: 30 });
  const [billForm, setBillForm] = useState<any>({ vendorId: '', date: new Date().toISOString().slice(0, 10), dueDate: '', subtotal: 0, taxAmount: 0, totalAmount: 0, description: '' });
  const [payForm, setPayForm] = useState<any>({ amount: 0, paymentMethod: 'transfer', referenceNumber: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [v, b] = await Promise.all([
        fetch('/api/accounting/vendors').then((r) => r.json()),
        fetch('/api/accounting/bills').then((r) => r.json()),
      ]);
      setVendors(v.vendors || []);
      setBills(b.bills || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submitVendor = async () => {
    if (!vendorForm.name) return alert('Name required');
    setSaving(true);
    try {
      const r = await fetch('/api/accounting/vendors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vendorForm, paymentTerms: Number(vendorForm.paymentTerms) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setVendorOpen(false);
      setVendorForm({ name: '', email: '', phone: '', bankName: '', accountNumber: '', accountName: '', paymentTerms: 30 });
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const submitBill = async () => {
    if (!billForm.vendorId || !billForm.dueDate) return alert('Vendor & due date required');
    const sub = Number(billForm.subtotal) || 0;
    const tax = Number(billForm.taxAmount) || 0;
    const total = Number(billForm.totalAmount) || sub + tax;
    setSaving(true);
    try {
      const r = await fetch('/api/accounting/bills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...billForm, subtotal: sub, taxAmount: tax, totalAmount: total, createdById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setBillOpen(false);
      setBillForm({ vendorId: '', date: new Date().toISOString().slice(0, 10), dueDate: '', subtotal: 0, taxAmount: 0, totalAmount: 0, description: '' });
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const submitPay = async () => {
    if (!payOpen || !payForm.amount) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/accounting/bills/${payOpen.id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payForm, amount: Number(payForm.amount), createdById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setPayOpen(null);
      setPayForm({ amount: 0, paymentMethod: 'transfer', referenceNumber: '' });
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const totalPayable = bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + (b.totalAmount - b.totalPaid), 0);
  const totalPaid = bills.reduce((s, b) => s + b.totalPaid, 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounts Payable</h1>
          <p className="text-sm text-slate-500">Vendor management · bills · payments</p>
        </div>
        <div className="flex gap-2">
          {tab === 'vendors' && <Button onClick={() => setVendorOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1.5" /> New Vendor</Button>}
          {tab === 'bills' && <Button onClick={() => setBillOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Plus className="h-4 w-4 mr-1.5" /> New Bill</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Vendors</p><p className="text-lg font-bold">{vendors.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Open Bills</p><p className="text-lg font-bold text-amber-700">{bills.filter((b) => b.status !== 'paid').length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Payable</p><p className="text-lg font-bold text-rose-700">{fmtNaira(totalPayable)}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Paid</p><p className="text-lg font-bold text-emerald-700">{fmtNaira(totalPaid)}</p></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <Card className="p-4">
            <div className="max-h-[34rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead className="text-right">Terms (days)</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
                  ) : vendors.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8"><Building2 className="h-8 w-8 mx-auto mb-2 text-slate-300" />No vendors yet</TableCell></TableRow>
                  ) : vendors.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell className="text-xs">{v.email || '—'}<br />{v.phone || ''}</TableCell>
                      <TableCell className="text-xs">{v.bankName || '—'}<br />{v.accountNumber || ''}</TableCell>
                      <TableCell className="text-right">{v.paymentTerms}</TableCell>
                      <TableCell><Badge className={v.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{v.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <Card className="p-4">
            <div className="max-h-[34rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
                  ) : bills.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-8"><Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />No bills yet</TableCell></TableRow>
                  ) : bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.billNumber}</TableCell>
                      <TableCell className="text-sm">{b.vendor?.name}</TableCell>
                      <TableCell className="text-xs">{fmtDate(b.date)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(b.dueDate)}</TableCell>
                      <TableCell className="text-right">{fmtNaira(b.totalAmount)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{fmtNaira(b.totalPaid)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtNaira(b.totalAmount - b.totalPaid)}</TableCell>
                      <TableCell><Badge className={BILL_STATUS[b.status] || 'bg-slate-100'}>{b.status}</Badge></TableCell>
                      <TableCell>
                        {b.status !== 'paid' && (
                          <Button size="sm" variant="outline" onClick={() => { setPayOpen(b); setPayForm({ amount: b.totalAmount - b.totalPaid, paymentMethod: 'transfer', referenceNumber: '' }); }}>
                            <Banknote className="h-3.5 w-3.5 mr-1" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card className="p-4">
            <div className="max-h-[34rem] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Bill</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.flatMap((b) => (b.payments || []).map((p: any) => ({ ...p, bill: b }))).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">No payments recorded</TableCell></TableRow>
                  ) : bills.flatMap((b) => (b.payments || []).map((p: any) => ({ ...p, bill: b })))
                    .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                    .map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{fmtDate(p.paymentDate)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.bill.billNumber}</TableCell>
                      <TableCell className="text-sm">{p.bill.vendor?.name}</TableCell>
                      <TableCell className="text-right font-medium text-emerald-700">{fmtNaira(p.amount)}</TableCell>
                      <TableCell className="text-xs">{p.paymentMethod || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{p.referenceNumber || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Vendor dialog */}
      <Dialog open={vendorOpen} onOpenChange={setVendorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Vendor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
            <div><Label>Bank Name</Label><Input value={vendorForm.bankName} onChange={(e) => setVendorForm({ ...vendorForm, bankName: e.target.value })} /></div>
            <div><Label>Account Number</Label><Input value={vendorForm.accountNumber} onChange={(e) => setVendorForm({ ...vendorForm, accountNumber: e.target.value })} /></div>
            <div className="col-span-2"><Label>Account Name</Label><Input value={vendorForm.accountName} onChange={(e) => setVendorForm({ ...vendorForm, accountName: e.target.value })} /></div>
            <div><Label>Payment Terms (days)</Label><Input type="number" value={vendorForm.paymentTerms} onChange={(e) => setVendorForm({ ...vendorForm, paymentTerms: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorOpen(false)}>Cancel</Button>
            <Button onClick={submitVendor} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Save Vendor'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bill dialog */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Vendor Bill</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Vendor</Label>
              <Select value={billForm.vendorId} onValueChange={(v) => setBillForm({ ...billForm, vendorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={billForm.date} onChange={(e) => setBillForm({ ...billForm, date: e.target.value })} /></div>
            <div><Label>Due Date</Label><Input type="date" value={billForm.dueDate} onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })} /></div>
            <div><Label>Subtotal (₦)</Label><Input type="number" value={billForm.subtotal || ''} onChange={(e) => setBillForm({ ...billForm, subtotal: Number(e.target.value) })} /></div>
            <div><Label>Tax (₦)</Label><Input type="number" value={billForm.taxAmount || ''} onChange={(e) => setBillForm({ ...billForm, taxAmount: Number(e.target.value) })} /></div>
            <div className="col-span-2"><Label>Total (₦) — leave 0 to auto-calc</Label><Input type="number" value={billForm.totalAmount || ''} onChange={(e) => setBillForm({ ...billForm, totalAmount: Number(e.target.value) })} /></div>
            <div className="col-span-2"><Label>Description</Label><Input value={billForm.description} onChange={(e) => setBillForm({ ...billForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillOpen(false)}>Cancel</Button>
            <Button onClick={submitBill} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Saving…' : 'Create Bill'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>{payOpen?.billNumber} · Balance: {fmtNaira(payOpen ? payOpen.totalAmount - payOpen.totalPaid : 0)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (₦)</Label><Input type="number" value={payForm.amount || ''} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} /></div>
            <div>
              <Label>Payment Method</Label>
              <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm({ ...payForm, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Reference Number</Label><Input value={payForm.referenceNumber} onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={submitPay} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? 'Recording…' : 'Record Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

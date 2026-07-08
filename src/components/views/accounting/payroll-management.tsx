'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Users, CheckCircle2 } from 'lucide-react';
import { fmtNaira, fmtDate } from '@/lib/format';

export function PayrollManagement() {
  const { currentAdmin } = useAppStore() as any;
  const [batches, setBatches] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [form, setForm] = useState({
    period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    paymentDate: new Date().toISOString().slice(0, 10),
  });
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        fetch('/api/accounting/payroll').then((r) => r.json()),
        fetch('/api/accounting/payroll?mode=staff').then((r) => r.json()),
      ]);
      setBatches(b.batches || []);
      setStaff(s.staff || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleStaff = (id: string) => {
    setSelectedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!form.period) return alert('Period required');
    setSaving(true);
    try {
      const r = await fetch('/api/accounting/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          staffIds: Array.from(selectedStaff),
          processedById: currentAdmin?.id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setOpen(false);
      setSelectedStaff(new Set());
      load();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const viewDetail = async (id: string) => {
    try {
      const r = await fetch(`/api/accounting/payroll/${id}`).then((r) => r.json());
      setDetail(r.batch);
    } catch (e) { console.error(e); }
  };

  const approve = async (id: string) => {
    if (!confirm('Approve & pay this payroll batch?')) return;
    setApproving(true);
    try {
      const r = await fetch(`/api/accounting/payroll/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvedById: currentAdmin?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setDetail(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setApproving(false); }
  };

  const totalNet = batches.reduce((s, b) => s + b.netPay, 0);
  const pendingCount = batches.filter((b) => b.status === 'pending').length;
  const paidCount = batches.filter((b) => b.status === 'paid').length;

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payroll Management</h1>
          <p className="text-sm text-slate-500">Run monthly payroll, generate payslips & post salary journals</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" /> New Payroll Run
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-slate-500">Total Batches</p><p className="text-lg font-bold">{batches.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Pending</p><p className="text-lg font-bold text-amber-700">{pendingCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Paid</p><p className="text-lg font-bold text-emerald-700">{paidCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total Net Paid</p><p className="text-lg font-bold">{fmtNaira(totalNet)}</p></Card>
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Payroll History</h3>
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8">Loading…</TableCell></TableRow>
              ) : batches.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-8"><Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />No payroll batches yet</TableCell></TableRow>
              ) : batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.period}</TableCell>
                  <TableCell className="text-xs">{fmtDate(b.paymentDate)}</TableCell>
                  <TableCell className="text-right">{b.staffCount}</TableCell>
                  <TableCell className="text-right">{fmtNaira(b.grossPay)}</TableCell>
                  <TableCell className="text-right text-rose-600">{fmtNaira(b.totalDeductions)}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-700">{fmtNaira(b.netPay)}</TableCell>
                  <TableCell><Badge className={b.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{b.status}</Badge></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => viewDetail(b.id)}>View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* New payroll dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
            <DialogDescription>Select staff to include. Leave empty to run for all active staff.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Period (YYYY-MM)</Label>
              <Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="2025-01" />
            </div>
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
            </div>
          </div>
          <div className="border rounded-lg max-h-72 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Allowances</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-4 text-sm">No active staff salaries configured</TableCell></TableRow>
                ) : staff.map((s) => {
                  const total = s.housingAllowance + s.transportAllowance + s.mealAllowance + s.utilityAllowance + s.otherAllowances;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Checkbox checked={selectedStaff.has(s.staffId)} onCheckedChange={() => toggleStaff(s.staffId)} />
                      </TableCell>
                      <TableCell className="font-medium">{s.staff?.firstName} {s.staff?.lastName}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline">{s.staff?.role || '—'}</Badge></TableCell>
                      <TableCell className="text-right">{fmtNaira(s.basicSalary)}</TableCell>
                      <TableCell className="text-right">{fmtNaira(total)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Creating…' : `Create Batch${selectedStaff.size > 0 ? ` (${selectedStaff.size})` : ' (All)'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Payroll Batch — {detail?.period}</DialogTitle>
            <DialogDescription>
              {detail?.staffCount} staff · Net: {fmtNaira(detail?.netPay || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 text-sm mb-3">
            <div className="p-2 rounded bg-slate-50"><p className="text-xs text-slate-500">Gross</p><p className="font-semibold">{fmtNaira(detail?.grossPay || 0)}</p></div>
            <div className="p-2 rounded bg-slate-50"><p className="text-xs text-slate-500">Deductions</p><p className="font-semibold text-rose-600">{fmtNaira(detail?.totalDeductions || 0)}</p></div>
            <div className="p-2 rounded bg-slate-50"><p className="text-xs text-slate-500">Net Pay</p><p className="font-semibold text-emerald-700">{fmtNaira(detail?.netPay || 0)}</p></div>
          </div>
          <div className="max-h-80 overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payslip #</TableHead>
                  <TableHead>Staff ID</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Pension</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail?.payslips || []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.payslipNumber}</TableCell>
                    <TableCell className="text-xs">{p.staffId.slice(-8)}</TableCell>
                    <TableCell className="text-right">{fmtNaira(p.basicSalary + p.totalAllowances)}</TableCell>
                    <TableCell className="text-right text-rose-600">{fmtNaira(p.taxDeduction)}</TableCell>
                    <TableCell className="text-right text-rose-600">{fmtNaira(p.pensionDeduction)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{fmtNaira(p.netPay)}</TableCell>
                    <TableCell><Badge className={p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            {detail?.status === 'pending' && (
              <Button onClick={() => approve(detail.id)} disabled={approving} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> {approving ? 'Approving…' : 'Approve & Pay'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

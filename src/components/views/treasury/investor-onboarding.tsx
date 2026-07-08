'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Search, UserPlus, CheckCircle2, Users } from 'lucide-react';
import { fmtDate } from '@/lib/format';

export function InvestorOnboarding() {
  const { currentAdmin } = useAppStore();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    sourceOfFunds: '',
    investmentGoal: '',
    riskTolerance: 'medium',
    nokName: '',
    nokPhone: '',
    nokRelationship: '',
    nokEmail: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
  });

  const loadProfiles = async () => {
    try {
      const r = await fetch('/api/treasury/investors').then((r) => r.json());
      setProfiles(r.profiles || []);
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadProfiles(); }, []);

  const searchUsers = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/treasury/investors?mode=search&q=${encodeURIComponent(q)}`).then((r) => r.json());
      setUsers(r.users || []);
    } finally { setLoading(false); }
  };

  const submit = async () => {
    if (!selected) return alert('Select a user first');
    setSubmitting(true);
    try {
      const r = await fetch('/api/treasury/investors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, userId: selected.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      alert(`Investor profile created for ${selected.firstName} ${selected.lastName}`);
      setSelected(null);
      setForm({
        sourceOfFunds: '', investmentGoal: '', riskTolerance: 'medium',
        nokName: '', nokPhone: '', nokRelationship: '', nokEmail: '',
        bankName: '', accountNumber: '', accountName: '',
      });
      loadProfiles();
    } catch (e: any) {
      alert(e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Investor Onboarding</h1>
        <p className="text-sm text-slate-500">Search existing users or onboard a new treasury investor profile</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search & select user */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">1. Find Investor</h3>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                placeholder="Search name, email, phone..."
                className="pl-9"
              />
            </div>
            <Button onClick={searchUsers} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              Search
            </Button>
          </div>

          {selected ? (
            <div className="p-3 rounded-lg border-2 border-emerald-200 bg-emerald-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{selected.firstName} {selected.lastName}</p>
                  <p className="text-xs text-slate-500">{selected.email} · {selected.phone || 'No phone'}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => setSelected(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-6 text-sm">Search to find users</TableCell></TableRow>
                  ) : users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                      <TableCell className="text-xs text-slate-500">{u.email}<br />{u.phone}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelected(u)}>Select</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Profile form */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="h-5 w-5 text-emerald-600" />
            <h3 className="font-semibold">2. Investor Profile</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Source of Funds</Label>
              <Input value={form.sourceOfFunds} onChange={(e) => setForm({ ...form, sourceOfFunds: e.target.value })} placeholder="e.g. Salary, Business profits" />
            </div>
            <div className="col-span-2">
              <Label>Investment Goal</Label>
              <Input value={form.investmentGoal} onChange={(e) => setForm({ ...form, investmentGoal: e.target.value })} placeholder="e.g. Capital preservation, Growth" />
            </div>
            <div className="col-span-2">
              <Label>Risk Tolerance</Label>
              <Select value={form.riskTolerance} onValueChange={(v) => setForm({ ...form, riskTolerance: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Payout Bank</p>
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" />
              <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="Account number" />
              <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Account name" className="col-span-2" />
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Next of Kin</p>
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.nokName} onChange={(e) => setForm({ ...form, nokName: e.target.value })} placeholder="NOK name" />
              <Input value={form.nokPhone} onChange={(e) => setForm({ ...form, nokPhone: e.target.value })} placeholder="NOK phone" />
              <Input value={form.nokRelationship} onChange={(e) => setForm({ ...form, nokRelationship: e.target.value })} placeholder="Relationship" />
              <Input value={form.nokEmail} onChange={(e) => setForm({ ...form, nokEmail: e.target.value })} placeholder="NOK email" />
            </div>
          </div>

          <Button onClick={submit} disabled={!selected || submitting} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {submitting ? 'Saving…' : 'Create Investor Profile'}
          </Button>
        </Card>
      </div>

      {/* Existing profiles */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Existing Investor Profiles</h3>
        <div className="max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Investor</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Goal</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>NOK</TableHead>
                <TableHead>Onboarded</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-6">No investor profiles yet</TableCell></TableRow>
              ) : profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.user ? `${p.user.firstName} ${p.user.lastName}` : '—'}</TableCell>
                  <TableCell><Badge className="bg-slate-100 text-slate-700 capitalize">{p.riskTolerance}</Badge></TableCell>
                  <TableCell className="text-xs text-slate-600">{p.investmentGoal || '—'}</TableCell>
                  <TableCell className="text-xs">{p.bankName || '—'}<br />{p.accountNumber || ''}</TableCell>
                  <TableCell className="text-xs">{p.nokName || '—'}<br />{p.nokPhone || ''}</TableCell>
                  <TableCell className="text-xs">{fmtDate(p.createdAt)}</TableCell>
                  <TableCell><Badge className="bg-emerald-100 text-emerald-700">{p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

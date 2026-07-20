'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import {
  ROLE_LABELS, ROLE_PERMISSIONS, PERMISSION_FLAGS,
} from '@/lib/constants';
import {
  Users, Plus, Pencil, KeyRound, ShieldCheck, Search, Gavel,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';

const ROLES = Object.keys(ROLE_LABELS);

export function StaffView() {
  const { toast } = useToast();
  const { currentAdmin } = useAppStore();
  const [staff, setStaff] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    firstName: '', lastName: '', username: '', email: '', password: '',
    phone: '', role: 'admin', branchId: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRole !== 'all') params.set('role', filterRole);
      if (filterBranch !== 'all') params.set('branchId', filterBranch);
      const [s, b] = await Promise.all([
        authFetch(`/api/staff?${params.toString()}`).then((r) => r.json()),
        authFetch('/api/branches').then((r) => r.json()),
      ]);
      setStaff(s.staff || []);
      setBranches(b.branches || []);
    } catch (e) {
      console.error('Staff load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterRole, filterBranch]);

  const filtered = staff.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.firstName?.toLowerCase().includes(q) ||
      s.lastName?.toLowerCase().includes(q) ||
      s.username?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q);
  });

  const submitCreate = async () => {
    if (!form.firstName || !form.lastName || !form.username || !form.email || !form.password) return;
    try {
      await authFetch('/api/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setCreateOpen(false);
      setForm({ firstName: '', lastName: '', username: '', email: '', password: '', phone: '', role: 'admin', branchId: '' });
      load();
    } catch (e) {
      console.error('Create staff error', e);
    }
  };

  const openEdit = (s: any) => {
    setEditing(s);
    const p: Record<string, boolean> = {};
    for (const f of PERMISSION_FLAGS) p[f] = !!s[f];
    setPerms(p);
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editing) return;
    try {
      await authFetch(`/api/staff/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editing.firstName, lastName: editing.lastName,
          email: editing.email, phone: editing.phone,
          role: editing.role, branchId: editing.branchId,
          status: editing.status, ...perms,
        }),
      });
      setEditOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      console.error('Update staff error', e);
    }
  };

  const resetPassword = async (s: any) => {
    if (!confirm(`Reset password for ${s.firstName} ${s.lastName}? Temporary password will be generated.`)) return;
    try {
      const res = await authFetch(`/api/staff/${s.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (d.tempPassword) alert(`Temporary password for ${s.username}: ${d.tempPassword}`);
      load();
    } catch (e) {
      console.error('Reset password error', e);
    }
  };

  const applyRolePerms = (role: string) => {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    const p: Record<string, boolean> = {};
    for (const f of PERMISSION_FLAGS) {
      p[f] = rolePerms.includes('*') || rolePerms.includes(f);
    }
    setPerms(p);
  };

  const fmtLastLogin = (d: string | null) =>
    d ? new Date(d).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" /> Staff & Access Control
            </h2>
            <p className="text-xs text-slate-500">Manage admin users, roles, branches, and granular permission flags.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username, email..." className="pl-9" />
          </div>
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="all">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="all">All Branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Branch</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Last Login</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-400">Loading staff...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center">
                  <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No staff found.</p>
                </td></tr>
              ) : filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                        {s.firstName?.[0]}{s.lastName?.[0]}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">{s.firstName} {s.lastName}</p>
                        <p className="text-[10px] text-slate-500">@{s.username} · {s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[s.role] || s.role}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-700">{s.branch?.name || <span className="text-slate-400">HQ</span>}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                      s.status === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    )}>
                      {s.status === 1 ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[10px] text-slate-600 whitespace-nowrap">{fmtLastLogin(s.lastLogin)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit & Permissions" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Reset Password" onClick={() => resetPassword(s)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Staff Member</DialogTitle>
            <DialogDescription>Create an admin user. Permissions auto-set from the selected role, editable later.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div>
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <Label>Username *</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="font-mono" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234..." />
            </div>
            <div>
              <Label>Role</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <Label>Branch</Label>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">— HQ / No branch —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Create Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal with permission flags */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Staff & Permissions</DialogTitle>
            <DialogDescription>
              {editing?.firstName} {editing?.lastName} · @{editing?.username}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    value={editing.role}
                    onChange={(e) => {
                      const r = e.target.value;
                      setEditing({ ...editing, role: r });
                      applyRolePerms(r);
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Branch</Label>
                  <select value={editing.branchId || ''} onChange={(e) => setEditing({ ...editing, branchId: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">— HQ / No branch —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value={1}>Active</option>
                    <option value={0}>Suspended</option>
                  </select>
                </div>
              </div>

              {/* MCC Access — Quick Toggle */}
              <div className="border-t pt-3">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gavel className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">MCC Committee Access</p>
                        <p className="text-[10px] text-slate-600">Grant this staff member access to view the MCC Decision Ledger</p>
                      </div>
                    </div>
                    <Switch
                      checked={!!perms.loanMcc}
                      onCheckedChange={(v) => setPerms({ ...perms, loanMcc: v })}
                    />
                  </div>
                  {perms.loanMcc ? (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[9px] mt-2">✓ Can view MCC decisions in sidebar</Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500 text-[9px] mt-2">No MCC access</Badge>
                  )}
                </div>
              </div>

              {/* All Permission Flags */}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> All Permission Flags
                  </p>
                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => applyRolePerms(editing.role)}>
                    Reset to role defaults
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                  {PERMISSION_FLAGS.map((f) => (
                    <label key={f} className="flex items-center gap-2 rounded border border-slate-100 p-1.5 hover:bg-slate-50 cursor-pointer">
                      <Switch checked={!!perms[f]} onCheckedChange={(v) => setPerms({ ...perms, [f]: v })} />
                      <span className="text-[11px] text-slate-700 font-mono">{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={submitEdit} className="bg-emerald-600 hover:bg-emerald-700">
              <Pencil className="h-4 w-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

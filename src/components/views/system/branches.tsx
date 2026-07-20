'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Pencil, Trash2, Power, Users } from 'lucide-react';
import { NIGERIAN_STATES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';

const empty = { name: '', code: '', state: '', address: '', phoneContact: '', managerId: '', status: 'active' };

export function BranchesView() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        authFetch('/api/branches').then((r) => r.json()),
        authFetch('/api/staff').then((r) => r.json()),
      ]);
      setBranches(b.branches || []);
      setStaff(s.staff || []);
    } catch (e) {
      console.error('Branches load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name || !form.code) return;
    try {
      if (editingId) {
        await authFetch(`/api/branches/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      } else {
        await authFetch('/api/branches', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
      }
      setForm(empty);
      setEditingId(null);
      load();
    } catch (e) {
      console.error('Save branch error', e);
    }
  };

  const edit = (b: any) => {
    setForm({
      name: b.name, code: b.code, state: b.state || '',
      address: b.address || '', phoneContact: b.phoneContact || '',
      managerId: b.managerId || '', status: b.status,
    });
    setEditingId(b.id);
  };

  const toggleStatus = async (b: any) => {
    const next = b.status === 'active' ? 'inactive' : 'active';
    await authFetch(`/api/branches/${b.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    load();
  };

  const remove = async (b: any) => {
    if (!confirm(`Delete branch "${b.name}"? This cannot be undone.`)) return;
    await authFetch(`/api/branches/${b.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-emerald-600" /> Branch Network Management
        </h2>
        <p className="text-xs text-slate-500">Manage physical branch locations, codes, and branch managers.</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-1 h-fit">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            {editingId ? 'Edit Branch' : 'Add New Branch'}
          </h3>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Victoria Island" />
            </div>
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. VIL" className="font-mono" />
            </div>
            <div>
              <Label>State</Label>
              <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">— Select state —</option>
                {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
            </div>
            <div>
              <Label>Phone Contact</Label>
              <Input value={form.phoneContact} onChange={(e) => setForm({ ...form, phoneContact: e.target.value })} placeholder="+234..." />
            </div>
            <div>
              <Label>Branch Manager</Label>
              <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">— Unassigned —</option>
                {staff.filter((s) => s.role === 'bm' || s.role === 'super').map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} (@{s.username})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={submit} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> {editingId ? 'Update' : 'Create'}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setForm(empty); setEditingId(null); }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-0 lg:col-span-2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Manager</th>
                  <th className="px-3 py-2 font-semibold text-center">Staff</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Loading branches...</td></tr>
                ) : branches.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-10 text-center">
                    <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No branches configured.</p>
                  </td></tr>
                ) : branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs font-mono font-semibold text-slate-900">{b.code}</td>
                    <td className="px-3 py-2">
                      <p className="text-xs font-semibold text-slate-900">{b.name}</p>
                      <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{b.address || '—'}</p>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{b.state || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      {b.manager ? `${b.manager.firstName} ${b.manager.lastName}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Users className="h-3 w-3 text-slate-400" />
                        {b._count?.staff || 0}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                        b.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      )}>{b.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => edit(b)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" title={b.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(b)}>
                          <Power className={cn('h-3.5 w-3.5', b.status === 'active' ? 'text-emerald-600' : 'text-slate-400')} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" title="Delete" onClick={() => remove(b)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

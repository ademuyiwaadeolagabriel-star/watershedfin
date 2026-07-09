'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAppStore } from '@/lib/store';
import { FileText, Upload, Download, CheckCircle2, Plus, Eye, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/lib/auth-client';

const CATEGORIES = ['general', 'kyc', 'aml', 'credit', 'operations', 'hr', 'data_protection', 'anti_fraud'];

export function CompliancePoliciesView() {
  const { currentAdmin } = useAppStore();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewPolicy, setViewPolicy] = useState<any>(null);
  const [ackList, setAckList] = useState<any[]>([]);
  const [ackOpen, setAckOpen] = useState(false);

  // form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [version, setVersion] = useState('1.0');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/compliance/policies');
      const d = await res.json();
      setPolicies(d.policies || []);
    } catch (e) {
      console.error('Policies load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!title) return;
    const fd = new FormData();
    fd.set('title', title);
    fd.set('category', category);
    fd.set('version', version);
    fd.set('effectiveDate', effectiveDate || new Date().toISOString().slice(0, 10));
    fd.set('body', body);
    fd.set('createdBy', currentAdmin?.id || '');
    if (file) fd.set('file', file);
    try {
      await authFetch('/api/compliance/policies', { method: 'POST', body: fd });
      setCreateOpen(false);
      setTitle(''); setCategory('general'); setVersion('1.0'); setEffectiveDate(''); setBody(''); setFile(null);
      load();
    } catch (e) {
      console.error('Create policy error:', e);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await authFetch(`/api/compliance/policies/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const acknowledge = async (id: string) => {
    if (!currentAdmin?.id) return;
    await authFetch(`/api/compliance/policies/${id}/acknowledge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: currentAdmin.id }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this policy? This cannot be undone.')) return;
    await authFetch(`/api/compliance/policies/${id}`, { method: 'DELETE' });
    load();
  };

  const viewAcks = async (p: any) => {
    setViewPolicy(p);
    setAckOpen(true);
    try {
      const res = await authFetch(`/api/compliance/policies/${p.id}`);
      const d = await res.json();
      setAckList(d.policy?.acknowledgments || []);
    } catch (e) {
      console.error('Load acks error:', e);
    }
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-600" /> Policy Documents
            </h2>
            <p className="text-xs text-slate-500">Manage internal policies, versions, and staff acknowledgments.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> New Policy
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Version</th>
                <th className="px-4 py-3 font-semibold">Effective</th>
                <th className="px-4 py-3 font-semibold">Acknowledged</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading policies...</td></tr>
              ) : policies.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center">
                  <FileText className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No policy documents yet.</p>
                </td></tr>
              ) : policies.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-slate-900">{p.title}</p>
                    {p.filePath && <p className="text-[10px] text-emerald-600 truncate max-w-xs">{p.filePath}</p>}
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{p.category || '—'}</Badge></td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">v{p.version}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-600">{fmtDate(p.effectiveDate)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> {p._count?.acknowledgments || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-block rounded px-2 py-0.5 text-[10px] font-semibold',
                      p.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'superseded' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    )}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="View" onClick={() => viewAcks(p)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Acknowledge" onClick={() => acknowledge(p.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Download" disabled={!p.filePath}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p.id, e.target.value)}
                        className="rounded border border-slate-200 bg-white px-1 py-1 text-[10px]"
                      >
                        <option value="active">active</option>
                        <option value="superseded">superseded</option>
                        <option value="archived">archived</option>
                      </select>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600" title="Delete" onClick={() => remove(p.id)}>
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

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Policy Document</DialogTitle>
            <DialogDescription>Upload a new internal policy. Staff will be required to acknowledge receipt.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="md:col-span-2">
              <Label htmlFor="title">Policy Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AML/CFT Compliance Policy 2025" />
            </div>
            <div>
              <Label>Category</Label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Version</Label>
              <Input value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <Label>Upload File (PDF/DOC)</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="md:col-span-2">
              <Label>Policy Body (rich text)</Label>
              <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste or type the policy content here..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className="h-4 w-4" /> Publish Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Acknowledgments modal */}
      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewPolicy?.title}</DialogTitle>
            <DialogDescription>
              {ackList.length} staff have acknowledged this policy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
            {ackList.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No acknowledgments yet.</p>
            ) : ackList.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border border-slate-100 p-2">
                <div>
                  <p className="text-xs font-semibold text-slate-900">
                    {a.admin ? `${a.admin.firstName} ${a.admin.lastName}` : 'Unknown'}
                  </p>
                  <p className="text-[10px] text-slate-500">@{a.admin?.username} · {a.admin?.role}</p>
                </div>
                <div className="text-right">
                  <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">acknowledged</Badge>
                  <p className="text-[9px] text-slate-400 mt-1">
                    {new Date(a.acknowledgedAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {viewPolicy?.body && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-slate-700 mb-1">Policy excerpt:</p>
              <div className="rounded bg-slate-50 p-3 text-xs text-slate-600 max-h-40 overflow-y-auto whitespace-pre-wrap">
                {viewPolicy.body.slice(0, 800)}{viewPolicy.body.length > 800 ? '…' : ''}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

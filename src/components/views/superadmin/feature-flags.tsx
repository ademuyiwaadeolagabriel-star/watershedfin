'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { authFetch } from '@/lib/auth-client';
import { ToggleRight, Plus, RefreshCw, AlertCircle } from 'lucide-react';

export function FeatureFlagsView() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({ key: '', label: '', description: '', environment: 'all' });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/superadmin/feature-flags');
      const d = await res.json();
      if (res.ok) {
        setFlags(d.flags || []);
      } else {
        setError(d.error || `Failed to load (HTTP ${res.status})`);
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (flag: any) => {
    try {
      await authFetch('/api/superadmin/feature-flags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flag.id, enabled: !flag.enabled }),
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const create = async () => {
    if (!newFlag.key || !newFlag.label) return;
    try {
      await authFetch('/api/superadmin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newFlag, enabled: false }),
      });
      setNewFlag({ key: '', label: '', description: '', environment: 'all' });
      setDialogOpen(false);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ToggleRight className="h-5 w-5 text-emerald-600" /> Feature Flags
            </h2>
            <p className="text-xs text-slate-500">Toggle platform features on or off at runtime — no redeploy required. Reads are cached on the server.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> New Flag</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Feature Flag</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label className="text-xs">Key (unique, snake_case)</Label>
                    <Input
                      value={newFlag.key}
                      onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
                      placeholder="e.g. customer_portal_v2"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Display Label</Label>
                    <Input
                      value={newFlag.label}
                      onChange={(e) => setNewFlag({ ...newFlag, label: e.target.value })}
                      placeholder="e.g. Customer Portal v2"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={newFlag.description}
                      onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
                      placeholder="What does this flag control?"
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Environment</Label>
                    <select
                      value={newFlag.environment}
                      onChange={(e) => setNewFlag({ ...newFlag, environment: e.target.value })}
                      className="mt-1 w-full h-9 rounded-md border border-slate-200 px-3 text-sm"
                    >
                      <option value="all">All environments</option>
                      <option value="production">Production only</option>
                      <option value="staging">Staging only</option>
                      <option value="development">Development only</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={create}>Create Flag</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        {loading ? (
          <div className="text-center text-sm text-slate-400 py-8">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading flags…
          </div>
        ) : flags.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No feature flags yet.</p>
            <p className="text-xs text-slate-400 mt-1">Create your first flag to control platform features at runtime.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
              >
                <Switch checked={flag.enabled} onCheckedChange={() => toggle(flag)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{flag.label}</span>
                    <code className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{flag.key}</code>
                    {flag.environment !== 'all' && (
                      <Badge variant="outline" className="text-[10px]">{flag.environment}</Badge>
                    )}
                  </div>
                  {flag.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{flag.description}</p>
                  )}
                </div>
                <Badge
                  className={flag.enabled
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'}
                >
                  {flag.enabled ? 'ENABLED' : 'DISABLED'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

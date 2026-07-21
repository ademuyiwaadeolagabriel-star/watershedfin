'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { authFetch } from '@/lib/auth-client';
import { AlertTriangle, Power, Save, RefreshCw } from 'lucide-react';

export function MaintenanceModeView() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('We are performing scheduled maintenance. Please check back shortly.');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/superadmin/maintenance');
      const d = await res.json();
      setEnabled(d.enabled);
      if (d.message) setMessage(d.message);
      setUpdatedAt(d.updatedAt);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await authFetch('/api/superadmin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, message }),
      });
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Power className="h-5 w-5 text-amber-600" /> Maintenance Mode
            </h2>
            <p className="text-xs text-slate-500">
              When enabled, all non-superadmin logins are blocked. A banner is displayed across the platform.
              Super admins can still sign in.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </Card>

      {enabled && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Maintenance mode is currently ACTIVE</p>
              <p className="text-xs text-amber-700 mt-1">
                Regular users cannot log in. The customer portal and staff login form will display the maintenance message below.
                Super admins retain full access. Disable maintenance mode to restore normal operations.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Label className="text-sm font-medium">Enable maintenance mode</Label>
            <p className="text-xs text-slate-500 mt-0.5">Toggle to immediately lock the platform.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
        </div>

        <div className="mt-4">
          <Label className="text-xs">Maintenance Message</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Message displayed to users when they try to access the platform."
          />
        </div>

        {updatedAt && (
          <p className="text-[11px] text-slate-400 mt-3">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}

        <div className="flex justify-end mt-4">
          <Button onClick={save} disabled={saving || loading}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">What happens when maintenance mode is on?</h3>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li className="flex gap-2">
            <Badge className="bg-red-100 text-red-700 border-red-200 shrink-0">Login blocked</Badge>
            <span>Customer and staff login endpoints return HTTP 503 with the maintenance message.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 shrink-0">Banner shown</Badge>
            <span>Logged-in users see a non-dismissible banner across every page.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">Super admin</Badge>
            <span>Super admins retain full access — including the ability to disable maintenance mode.</span>
          </li>
          <li className="flex gap-2">
            <Badge className="bg-slate-100 text-slate-700 border-slate-200 shrink-0">Audit logged</Badge>
            <span>Every enable / disable action is written to the audit trail with the admin's IP and timestamp.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

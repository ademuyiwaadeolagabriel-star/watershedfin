'use client';

import { useEffect } from 'react';
import { useBranding } from '@/lib/branding';

/**
 * Mounts once at the root layout to load branding from the API on app boot
 * and apply CSS variables + favicon to <html>.
 */
export function BrandingBootstrap() {
  const load = useBranding((s) => s.load);

  useEffect(() => {
    load();
  }, [load]);

  return null;
}

'use client';

import { useAppStore } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Construction, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlaceholderProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PlaceholderView({ title, description, actionLabel, onAction }: PlaceholderProps) {
  const { setView } = useAppStore();
  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full">
      <Card className="p-12 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-amber-100 text-amber-600 mb-4">
          <Construction className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          {description || 'This module is part of the banking platform. Connect to enable full functionality.'}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {actionLabel && onAction ? (
            <Button onClick={onAction}>{actionLabel}</Button>
          ) : null}
          <Button onClick={() => setView('dashboard')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}

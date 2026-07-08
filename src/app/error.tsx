'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="max-w-md w-full p-8 text-center bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 mb-4">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {error.digest && (
          <p className="text-[10px] text-slate-400 font-mono mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <Button
            onClick={reset}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/')}
          >
            <Home className="h-4 w-4 mr-1" /> Home
          </Button>
        </div>
      </Card>
    </div>
  );
}

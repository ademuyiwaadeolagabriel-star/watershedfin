import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Card className="max-w-md w-full p-8 text-center bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <p className="text-6xl font-bold text-emerald-600 mb-2">404</p>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Page Not Found
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <a href="/">
            <Home className="h-4 w-4 mr-1" /> Go Home
          </a>
        </Button>
      </Card>
    </div>
  );
}

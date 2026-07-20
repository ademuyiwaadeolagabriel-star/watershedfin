'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

/**
 * G4: React Error Boundary
 * Catches any unhandled errors in child components and shows a graceful fallback UI
 * instead of a white screen of death.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ERROR BOUNDARY]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-4">
              An unexpected error occurred. Your data is safe — try reloading the page.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-xs text-slate-400 cursor-pointer">Show error details</summary>
                <pre className="mt-2 text-[10px] bg-slate-100 p-3 rounded overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <Button onClick={this.handleReload} className="bg-emerald-600 hover:bg-emerald-700">
              <RotateCw className="h-4 w-4 mr-1" /> Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

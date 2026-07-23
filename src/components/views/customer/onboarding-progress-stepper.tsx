'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, Clock, FileText, Search, DollarSign, Scale,
  UserCheck, Building2, AlertCircle,
} from 'lucide-react';

const STAGES = [
  { key: 'onboarding_submitted', label: 'Application Submitted', icon: FileText, description: 'Your application has been received' },
  { key: 'cs_kyc_review', label: 'KYC Verification', icon: UserCheck, description: 'Customer Service is verifying your documents' },
  { key: 'kyc_approved', label: 'KYC Approved', icon: CheckCircle2, description: 'Your documents have been verified' },
  { key: 'payment_pending', label: 'Payment Required', icon: DollarSign, description: 'Please pay the onboarding fee to continue' },
  { key: 'payment_confirmed', label: 'Payment Confirmed', icon: CheckCircle2, description: 'Your payment has been received' },
  { key: 'legal_cac_search', label: 'Legal CAC Search', icon: Search, description: 'Legal is performing CAC name search' },
  { key: 'legal_rejected', label: 'Legal Response Needed', icon: AlertCircle, description: 'Please respond to Legal observations' },
  { key: 'legal_approved', label: 'Account Number Assigned', icon: Building2, description: 'Your account number has been created' },
  { key: 'onboarding_complete', label: 'Onboarding Complete', icon: CheckCircle2, description: 'You can now apply for loans' },
];

export function OnboardingProgressStepper({ currentStage, accountNumber }: { currentStage: string; accountNumber?: string | null }) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStage);
  const isRejected = currentStage === 'legal_rejected';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-600" /> Onboarding Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        {accountNumber && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-emerald-600 font-semibold">Your Account Number</p>
            <p className="text-2xl font-bold text-emerald-800 font-mono">{accountNumber}</p>
          </div>
        )}

        <div className="space-y-3">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon;
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const isPending = idx > currentIndex;

            return (
              <div key={stage.key} className="flex items-start gap-3">
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  isCompleted && 'bg-emerald-500 text-white',
                  isCurrent && 'bg-blue-500 text-white animate-pulse',
                  isPending && 'bg-slate-200 text-slate-400',
                  isRejected && isCurrent && 'bg-amber-500 text-white',
                )}>
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <p className={cn(
                      'text-sm font-medium',
                      isCompleted && 'text-slate-600 line-through',
                      isCurrent && 'text-slate-900',
                      isPending && 'text-slate-400',
                    )}>
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <Badge className={cn(
                        'text-[9px]',
                        isRejected ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                      )}>
                        {isRejected ? 'ACTION NEEDED' : 'IN PROGRESS'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{stage.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {isRejected && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
              Legal has requested additional information. Please check your notifications and respond.
            </p>
          </div>
        )}

        {!accountNumber && currentStage !== 'legal_approved' && currentStage !== 'onboarding_complete' && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-800">
              <Clock className="h-3.5 w-3.5 inline mr-1" />
              Your account number will be assigned after Legal CAC Name Search approval. You can still explore the dashboard.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

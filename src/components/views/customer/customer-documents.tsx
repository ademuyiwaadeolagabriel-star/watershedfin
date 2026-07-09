'use client';

import { useAppStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, FileText, Download, FileCheck, ScrollText, FileSignature,
  Calendar, Clock, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtNaira, fmtDate } from '@/lib/loan-calc';
import { authFetch } from '@/lib/auth-client';

export function CustomerDocuments() {
  const { currentUser, viewParams, setView } = useAppStore();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!currentUser) return;
      try {
        const res = await authFetch(`/api/customer/dashboard?userId=${currentUser.id}`);
        const d = await res.json();
        setLoans(d.loans || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [currentUser]);

  const handleDownloadOfferLetter = async (loanId: string) => {
    setGenerating(`offer-${loanId}`);
    try {
      const res = await authFetch(`/api/customer/loan/${loanId}/offer-letter?userId=${currentUser?.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Generate PDF using react-pdf in browser
      const { pdf } = await import('@react-pdf/renderer');
      const { OfferLetterPDF } = await import('@/components/pdf/offer-letter');

      const offerLetter = data.offerLetter;
      const blob = await pdf(
        <OfferLetterPDF
          loan={data.loan}
          offerTerms={Object.entries(offerLetter.summary).map(([label, value]) => ({ label, value: String(value) }))}
          generalTerms={offerLetter.generalTerms}
          repaymentSchedule={offerLetter.repaymentSchedule.map((r: any) => ({
            installmentNo: r.sn,
            dueDate: r.date,
            principal: r.principal,
            interest: r.interest,
            total: r.installment,
            balance: r.balance,
          }))}
          agreementPreamble={offerLetter.intro}
          signature={offerLetter.digitalSignature || {
            signatoryName: `${currentUser?.firstName} ${currentUser?.lastName}`,
            signatoryRole: 'Borrower',
            otpMethod: 'Pending',
            timestamp: new Date(),
            ipAddress: '',
            legalCitation: 'Evidence Act and Cybercrimes Act of Nigeria',
            signatureHash: '',
          }}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Offer_Letter_${data.loan.applicationRef}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Failed to generate offer letter: ' + e.message);
    } finally {
      setGenerating(null);
    }
  };

  const handleDownloadAgreement = async (loanId: string) => {
    setGenerating(`agreement-${loanId}`);
    try {
      const res = await authFetch(`/api/customer/loan/${loanId}/agreement?userId=${currentUser?.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Generate PDF
      const { pdf } = await import('@react-pdf/renderer');
      const { CamMemoPDF } = await import('@/components/pdf/cam-memo');

      // Use the CAM memo as a base for the agreement (or create a dedicated agreement PDF)
      const blob = await pdf(
        <div style={{ padding: 40, fontSize: 10, fontFamily: 'Helvetica' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1F7A4A' }}>WATERSHED CAPITAL</div>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 4 }}>LOAN AND SECURITY AGREEMENT</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div>This Loan and Security Agreement is made this {fmtDate(new Date())}</div>
            <div style={{ marginTop: 8 }}>
              <strong>BETWEEN:</strong><br/>
              {data.agreement.borrower.name}
              {data.agreement.borrower.tradingAs && ` (Trading under the name and style of ${data.agreement.borrower.tradingAs})`}
              {' '}of {data.agreement.borrower.address} (herein referred to as "the BORROWER")
            </div>
            <div style={{ marginTop: 8 }}>
              <strong>AND:</strong><br/>
              {data.agreement.lender.name}, having its registered office at {data.agreement.lender.address} (herein referred to as "the LENDER")
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <strong>PART I: DEFINITIONS</strong><br/>
            <div style={{ marginTop: 4 }}>1. "Borrower" means {data.agreement.borrower.name}</div>
            <div>2. "Collateral" means the assets pledged as security for this loan</div>
            <div>3. "Debt" means the Loan which this document secures</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <strong>PART V: TERMS OF THE LOAN</strong><br/>
            <div style={{ marginTop: 4 }}>A) Principal Amount: {fmtNaira(data.agreement.loanTerms.principal)}</div>
            <div>B) Interest Rate: {data.agreement.loanTerms.annualRate}% {data.agreement.loanTerms.repaymentMethod} per month</div>
            <div>C) Tenor: {data.agreement.loanTerms.tenorMonths} months</div>
            <div>D) CCD: {data.agreement.loanTerms.ccdPercent}% ({fmtNaira(data.agreement.loanTerms.ccdAmount)})</div>
            <div>E) Upfront Fee: {data.agreement.loanTerms.upfrontFeePercent}% ({fmtNaira(data.agreement.loanTerms.upfrontFeeAmount)})</div>
            <div>F) Net Disbursement: {fmtNaira(data.agreement.loanTerms.netDisbursement)}</div>
            <div>G) Purpose: {data.agreement.loanTerms.purpose}</div>
            <div>H) Maturity Date: {fmtDate(data.agreement.maturityDate)}</div>
          </div>
          {data.agreement.digitalSignature && (
            <div style={{ marginTop: 20, borderWidth: 2, borderColor: '#16a34a', borderRadius: 4, padding: 10, backgroundColor: '#f0fdf4' }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#16a34a', textAlign: 'center', marginBottom: 6 }}>
                SIGNED AND ACCEPTED
              </div>
              <div>Signatory: {data.agreement.digitalSignature.signatory || data.agreement.borrower.name}</div>
              <div>Method: {data.agreement.digitalSignature.method}</div>
              <div>Timestamp: {fmtDate(data.agreement.digitalSignature.timestamp)}</div>
              <div>Hash: {data.agreement.digitalSignature.hash}</div>
              <div style={{ fontSize: 8, fontStyle: 'italic', marginTop: 4 }}>
                Legally binding under the {data.agreement.digitalSignature.legalCitation}
              </div>
            </div>
          )}
        </div>
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Loan_Agreement_${data.loan.applicationRef}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Failed to generate agreement: ' + e.message);
    } finally {
      setGenerating(null);
    }
  };

  const getDocumentStatus = (loan: any) => {
    if (loan.status === 'running' || loan.status === 'paid') return 'available';
    if (loan.acceptedAt || loan.offerLetterGeneratedAt) return 'available';
    if (loan.currentStep === 'CUSTOMER_ACCEPTANCE') return 'offer_ready';
    if (['HOC_FINALIZATION', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT', 'TREASURY_PAYOUT', 'INTERNAL_CONTROL_CHECK', 'MD_APPROVAL'].includes(loan.currentStep)) return 'pending';
    return 'locked';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="outline" size="sm" onClick={() => setView('customer-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Documents</h1>
            <p className="text-xs text-slate-500">Download your offer letters, agreements, and statements</p>
          </div>
        </div>

        {loading ? (
          <Card className="p-8 text-center text-slate-400">Loading...</Card>
        ) : loans.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No documents available yet</p>
          </Card>
        ) : (
          loans.map((loan) => {
            const status = getDocumentStatus(loan);
            return (
              <Card key={loan.id} className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{loan.applicationRef}</h3>
                    <p className="text-xs text-slate-500">{loan.plan?.name || 'Loan'} · {fmtNaira(loan.finalAmount || loan.approvedAmount || loan.amount)}</p>
                  </div>
                  <Badge className={cn(
                    'text-[10px]',
                    status === 'available' && 'bg-emerald-100 text-emerald-700',
                    status === 'offer_ready' && 'bg-amber-100 text-amber-700',
                    status === 'pending' && 'bg-blue-100 text-blue-700',
                    status === 'locked' && 'bg-slate-100 text-slate-500',
                  )}>
                    {status === 'available' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {status === 'offer_ready' && <AlertCircle className="h-3 w-3 mr-1" />}
                    {status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                    {status === 'locked' && <Clock className="h-3 w-3 mr-1" />}
                    {status === 'available' ? 'Available' : status === 'offer_ready' ? 'Offer Ready' : status === 'pending' ? 'Pending Approval' : 'Awaiting Approval'}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {/* Offer Letter */}
                  <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Provisional Offer Letter</p>
                      <p className="text-[10px] text-slate-500">Loan terms, interest rate, repayment schedule</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status === 'locked' || generating === `offer-${loan.id}`}
                      onClick={() => handleDownloadOfferLetter(loan.id)}
                      className="shrink-0"
                    >
                      {generating === `offer-${loan.id}` ? 'Generating...' : <><Download className="h-3.5 w-3.5 mr-1" /> Download</>}
                    </Button>
                  </div>

                  {/* Loan & Security Agreement */}
                  <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-purple-100 text-purple-600 shrink-0">
                      <ScrollText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Loan & Security Agreement</p>
                      <p className="text-[10px] text-slate-500">Legal contract with terms, security, and signature</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status === 'locked' || status === 'pending' || generating === `agreement-${loan.id}`}
                      onClick={() => handleDownloadAgreement(loan.id)}
                      className="shrink-0"
                    >
                      {generating === `agreement-${loan.id}` ? 'Generating...' : <><Download className="h-3.5 w-3.5 mr-1" /> Download</>}
                    </Button>
                  </div>

                  {/* Repayment Schedule */}
                  <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-100 text-blue-600 shrink-0">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Repayment Schedule</p>
                      <p className="text-[10px] text-slate-500">Monthly installment breakdown</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={status === 'locked'}
                      onClick={() => setView('customer-loan-breakdown', { loanId: loan.id })}
                      className="shrink-0"
                    >
                      <FileCheck className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </div>

                  {/* Loan Statement (only for active/paid loans) */}
                  {(loan.status === 'running' || loan.status === 'paid') && (
                    <div className="flex items-center gap-3 p-3 rounded-md border border-slate-200">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-100 text-amber-600 shrink-0">
                        <FileSignature className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">Loan Statement</p>
                        <p className="text-[10px] text-slate-500">Payment history and outstanding balance</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setView('customer-pay-back', { loanId: loan.id })}
                        className="shrink-0"
                      >
                        <FileCheck className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </div>
                  )}
                </div>

                {status === 'locked' && (
                  <div className="mt-3 p-2 rounded-md bg-slate-50 text-center">
                    <p className="text-[10px] text-slate-500">
                      📋 Documents will be available once your loan is approved by the credit committee
                    </p>
                  </div>
                )}
                {status === 'offer_ready' && (
                  <div className="mt-3 p-2 rounded-md bg-amber-50 text-center">
                    <p className="text-[10px] text-amber-700">
                      ✅ Your offer letter is ready! Accept the offer to unlock the full agreement.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setView('customer-accept-offer', { loanId: loan.id })}
                    >
                      Review & Sign Offer
                    </Button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

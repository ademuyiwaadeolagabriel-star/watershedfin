import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { classifyNPL, NPL_CLASSIFICATIONS } from '@/lib/constants';
import { assessLoanOverdue } from '@/lib/loan-overdue';

// ============================================================================
// CRON — AUTO NPL CLASSIFICATION
// ============================================================================
// GET /api/cron/auto-npl
//
// Run daily (recommended 00:00 platform time). For every running loan we:
//   1. Compute the days-overdue (anchored on the earliest past-due unpaid
//      instalment, falling back to a synthesised schedule when no
//      LoanRepayment rows exist).
//   2. Map daysOverdue → NPL classification via classifyNPL().
//      0          → PERFORMING
//      1–7        → WATCHLIST
//      8–30       → SUBSTANDARD
//      31–60      → DOUBTFUL
//      61–90      → LOST
//      91–179     → PASS_WATCH
//      ≥180       → WRITE_OFF
//   3. Set loan.defaulter = true when daysOverdue > 30.
//   4. Persist the latest classification + daysOverdue on the loan's
//      bmRiskFlags JSON metadata (so dashboards surface the ladder stage).
//   5. Write an AuditLog entry whenever the classification changes so the
//      risk team has a clean trail of stage transitions.
// ============================================================================

export async function GET(_req: NextRequest) {
  const startedAt = new Date();
  const stats = {
    loansScanned: 0,
    classificationsUpdated: 0,
    defaultersFlagged: 0,
    transitions: [] as {
      loanId: string;
      applicationRef: string | null;
      from: string;
      to: string;
      daysOverdue: number;
    }[],
    errors: [] as string[],
  };

  try {
    const loans = await db.loanApplicants.findMany({
      where: { status: 'running' },
      select: { id: true, applicationRef: true, defaulter: true, bmRiskFlags: true },
    });

    stats.loansScanned = loans.length;

    for (const loan of loans) {
      try {
        const assessment = await assessLoanOverdue(loan.id);
        if (!assessment) continue;

        const newNpl = classifyNPL(assessment.daysOverdue);
        const newNplLabel = NPL_CLASSIFICATIONS[newNpl]?.label || newNpl;

        // Read the previously stored classification (if any) from bmRiskFlags
        let priorMeta: any = {};
        try {
          priorMeta = loan.bmRiskFlags ? JSON.parse(loan.bmRiskFlags) : {};
        } catch {
          priorMeta = {};
        }
        const priorNpl =
          priorMeta.nplClassification != null
            ? String(priorMeta.nplClassification)
            : 'PERFORMING';
        const priorDays =
          typeof priorMeta.daysOverdue === 'number' ? priorMeta.daysOverdue : null;

        const classificationChanged = priorNpl !== newNpl;
        const daysChanged = priorDays !== assessment.daysOverdue;
        const shouldFlagDefaulter =
          assessment.daysOverdue > 30 && !loan.defaulter;

        // Update the loan in a single write when anything relevant moved.
        if (classificationChanged || daysChanged || shouldFlagDefaulter) {
          const updatedMeta = {
            ...priorMeta,
            nplClassification: newNpl,
            nplLabel: newNplLabel,
            daysOverdue: assessment.daysOverdue,
            totalOverdueAmount: assessment.totalOverdueAmount,
            lastAssessedAt: new Date().toISOString(),
          };

          await db.loanApplicants.update({
            where: { id: loan.id },
            data: {
              ...(shouldFlagDefaulter ? { defaulter: true } : {}),
              bmRiskFlags: JSON.stringify(updatedMeta),
            },
          });

          stats.classificationsUpdated++;
          if (shouldFlagDefaulter) stats.defaultersFlagged++;

          if (classificationChanged) {
            stats.transitions.push({
              loanId: loan.id,
              applicationRef: loan.applicationRef,
              from: priorNpl,
              to: newNpl,
              daysOverdue: assessment.daysOverdue,
            });

            // Audit log the stage transition
            await db.auditLog.create({
              data: {
                action: 'updated',
                module: 'risk',
                description: `NPL transition for ${loan.applicationRef || loan.id}: ${priorNpl} → ${newNpl} (${assessment.daysOverdue} days overdue)`,
                severity:
                  ['LOST', 'WRITE_OFF', 'DOUBTFUL'].includes(newNpl)
                    ? 'critical'
                    : ['SUBSTANDARD'].includes(newNpl)
                      ? 'warning'
                      : 'info',
                metadata: JSON.stringify({
                  loanId: loan.id,
                  applicationRef: loan.applicationRef,
                  from: priorNpl,
                  to: newNpl,
                  toLabel: newNplLabel,
                  daysOverdue: assessment.daysOverdue,
                  totalOverdueAmount: assessment.totalOverdueAmount,
                  defaulterFlagged: shouldFlagDefaulter,
                }),
              },
            });
          }
        }
      } catch (loanErr: any) {
        stats.errors.push(`loan ${loan.id}: ${loanErr?.message}`);
      }
    }

    const finishedAt = new Date();
    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      stats,
    });
  } catch (e: any) {
    console.error('[CRON auto-npl] error:', e);
    return NextResponse.json(
      { success: false, error: e.message, stats },
      { status: 500 },
    );
  }
}

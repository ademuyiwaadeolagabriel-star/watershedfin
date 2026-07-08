import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendSms } from '@/lib/sms-service';
import { sendEmail } from '@/lib/email-service';
import { sendTemplatedNotification } from '@/lib/notification-templates';
import {
  assessLoanOverdue,
  daysUntilDue,
  reminderAlreadySentToday,
  recordReminderSent,
} from '@/lib/loan-overdue';
import { classifyNPL } from '@/lib/constants';

// ============================================================================
// CRON — PAYMENT REMINDERS
// ============================================================================
// GET /api/cron/payment-reminders
//
// Run daily (recommended 08:00 platform time). For every running loan we look
// at the next instalment and emit the appropriate reminder bucket:
//
//   3 days before due  → SMS + email + in-app   (payment_reminder template)
//   1 day  before due  → urgent SMS + email     (payment_reminder template)
//   on due date        → "Payment Due Today" SMS + email
//   1 day after due    → "Payment Overdue" SMS + email + notify Loan Officer
//   7 days after due   → "Final Notice" SMS + email + notify Branch Manager
//                        and mark defaulter=true
//
// Each notification is idempotent: we check AuditLog for a same-day prior
// send keyed by (loanId, repaymentId, bucket, channel) before emitting.
//
// The route also updates loan.defaulter and stores the latest NPL
// classification in loan metadata (defaulter flag = true once >30 days
// overdue — full NPL classification refresh is handled by /api/cron/auto-npl).
// ============================================================================

function fmtNaira(n: number): string {
  return '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function GET(_req: NextRequest) {
  const startedAt = new Date();
  const stats = {
    loansScanned: 0,
    remindersSent: 0,
    skipped: 0,
    defaultersFlagged: 0,
    errors: [] as string[],
  };

  try {
    const loans = await db.loanApplicants.findMany({
      where: { status: 'running' },
      include: {
        user: true,
        loanOfficer: true,
        branch: { include: { manager: true } },
        loanRepayments: { orderBy: { dueDate: 'asc' } },
      },
    });

    stats.loansScanned = loans.length;

    for (const loan of loans) {
      try {
        const user = loan.user;
        if (!user) continue;

        const email = user.email || undefined;
        const phone = user.phone || undefined;

        // If no persisted LoanRepayment rows exist, synthesise a schedule on
        // the fly (assessLoanOverdue handles that fallback) so we can still
        // pick the "next due" instalment. For the reminder buckets below we
        // iterate over whichever schedule we have.
        let repayments = loan.loanRepayments;
        if (repayments.length === 0) {
          const { calculateLoanSchedule } = await import('@/lib/loan-calc');
          const principal =
            loan.finalAmount ||
            loan.vettedAmount ||
            loan.approvedAmount ||
            loan.amount;
          const tenorMonths =
            loan.finalTenure ||
            loan.vettedDuration ||
            loan.approvedTenor ||
            loan.duration;
          const annualRate = loan.finalInterestRate || loan.percent || 24;
          const repaymentMethod =
            (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
          const startDate = loan.disbursedAt || loan.disbursementDate || new Date();
          const calc = calculateLoanSchedule(
            principal,
            annualRate,
            tenorMonths,
            repaymentMethod,
            startDate,
            0,
            0,
            0,
          );
          repayments = calc.schedule.map((row, i) => ({
            id: `synthetic-${loan.id}-${i}`,
            loanApplicantId: loan.id,
            refId: null,
            dueDate: row.dueDate,
            amountDue: row.installment,
            principalPart: row.principal,
            interestPart: row.interest,
            feePart: null,
            amountPaid: 0,
            status: 'pending',
            paidAt: null,
            paymentMethod: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })) as any;
        }

        // Pick the first instalment that isn't fully paid — this is the
        // "active" reminder anchor.
        const activeRepayment = repayments.find(
          (r) => (r.amountDue || 0) - (r.amountPaid || 0) > 0.5,
        );
        if (!activeRepayment) continue;

        const dueDate = new Date(activeRepayment.dueDate);
        const days = daysUntilDue(dueDate);
        const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        const applicationRef = loan.applicationRef || '—';
        const amount = activeRepayment.amountDue;
        const repaymentId = activeRepayment.id;

        // Bucket detection — only one bucket fires per instalment per day
        type Bucket =
          | '3d_before'
          | '1d_before'
          | 'due_today'
          | '1d_after'
          | '7d_after'
          | null;
        let bucket: Bucket = null;
        if (days === 3) bucket = '3d_before';
        else if (days === 1) bucket = '1d_before';
        else if (days === 0) bucket = 'due_today';
        else if (days === -1) bucket = '1d_after';
        else if (days === -7) bucket = '7d_after';

        if (!bucket) {
          stats.skipped++;
        } else {
          const vars = {
            customerName,
            applicationRef,
            amount: fmtNaira(amount),
            dueDate: fmtDate(dueDate),
            daysUntilDue: Math.max(0, days),
            daysOverdue: Math.max(0, -days),
            penaltyAmount: fmtNaira(amount * 0.0003 * Math.max(0, -days)),
          };

          const recipients = { email, phone };

          // 3 days before → friendly reminder (SMS + email + in-app)
          if (bucket === '3d_before') {
            const alreadySms = await reminderAlreadySentToday({
              loanId: loan.id,
              repaymentId,
              bucket,
            });
            if (!alreadySms) {
              sendTemplatedNotification('payment_reminder', vars, recipients).catch(
                (e) => console.error('[REMINDER] templated notify failed:', e?.message),
              );
              // In-app notification
              db.notification
                .create({
                  data: {
                    userId: user.id,
                    type: 'payment_due',
                    title: `Payment of ${fmtNaira(amount)} due in 3 days`,
                    message: `Your loan ${applicationRef} payment of ${fmtNaira(
                      amount,
                    )} is due on ${fmtDate(dueDate)}. Tap to make a payment.`,
                    category: 'payment',
                    actionLabel: 'Pay Now',
                    actionView: 'customer-pay-back',
                    actionParams: JSON.stringify({ loanId: loan.id }),
                  },
                })
                .catch((e) =>
                  console.error('[REMINDER] in-app notify failed:', e?.message),
                );
              await recordReminderSent({
                loanId: loan.id,
                repaymentId,
                bucket,
                channel: 'sms',
                recipient: phone || email || '',
                description: `3-day reminder for ${applicationRef} (${fmtNaira(
                  amount,
                )} due ${fmtDate(dueDate)})`,
              });
              stats.remindersSent++;
            } else {
              stats.skipped++;
            }
          }

          // 1 day before → urgent reminder (SMS + email)
          else if (bucket === '1d_before') {
            const already = await reminderAlreadySentToday({
              loanId: loan.id,
              repaymentId,
              bucket,
            });
            if (!already) {
              sendTemplatedNotification(
                'payment_reminder',
                { ...vars, daysUntilDue: 1 },
                recipients,
              ).catch((e) =>
                console.error('[REMINDER] templated notify failed:', e?.message),
              );
              if (phone) {
                sendSms({
                  to: phone,
                  message: `URGENT: Your loan payment of ${fmtNaira(
                    amount,
                  )} for ${applicationRef} is due TOMORROW (${fmtDate(
                    dueDate,
                  )}). Pay now to avoid penalties. - Watershed Capital`,
                }).catch((e) => console.error('[REMINDER] SMS failed:', e?.message));
              }
              await recordReminderSent({
                loanId: loan.id,
                repaymentId,
                bucket,
                channel: 'sms',
                recipient: phone || email || '',
                description: `1-day urgent reminder for ${applicationRef}`,
              });
              stats.remindersSent++;
            } else {
              stats.skipped++;
            }
          }

          // Due today
          else if (bucket === 'due_today') {
            const already = await reminderAlreadySentToday({
              loanId: loan.id,
              repaymentId,
              bucket,
            });
            if (!already) {
              if (email) {
                sendEmail({
                  to: email,
                  subject: `Payment Due Today: ${fmtNaira(amount)} for ${applicationRef}`,
                  html: `<h2>Hi ${customerName},</h2><p>Your loan payment of <strong>${fmtNaira(
                    amount,
                  )}</strong> for <strong>${applicationRef}</strong> is <strong>due today</strong> (${fmtDate(
                    dueDate,
                  )}).</p><p>Please log in to your portal to make a payment and avoid late penalties.</p>`,
                  text: `Hi ${customerName}, your payment of ${fmtNaira(
                    amount,
                  )} for ${applicationRef} is due TODAY (${fmtDate(
                    dueDate,
                  )}). Pay now to avoid penalties.`,
                }).catch((e) =>
                  console.error('[REMINDER] email failed:', e?.message),
                );
              }
              if (phone) {
                sendSms({
                  to: phone,
                  message: `Due TODAY: Your loan payment of ${fmtNaira(
                    amount,
                  )} for ${applicationRef} is due today. Pay now to avoid penalties. - Watershed Capital`,
                }).catch((e) => console.error('[REMINDER] SMS failed:', e?.message));
              }
              await recordReminderSent({
                loanId: loan.id,
                repaymentId,
                bucket,
                channel: 'sms',
                recipient: phone || email || '',
                description: `Due-today reminder for ${applicationRef}`,
              });
              stats.remindersSent++;
            } else {
              stats.skipped++;
            }
          }

          // 1 day after → overdue + notify Loan Officer
          else if (bucket === '1d_after') {
            const already = await reminderAlreadySentToday({
              loanId: loan.id,
              repaymentId,
              bucket,
            });
            if (!already) {
              sendTemplatedNotification('payment_overdue', vars, recipients).catch(
                (e) => console.error('[REMINDER] templated notify failed:', e?.message),
              );
              // Notify Loan Officer
              if (loan.loanOfficer?.email) {
                sendEmail({
                  to: loan.loanOfficer.email,
                  subject: `Overdue loan ${applicationRef} — customer ${customerName}`,
                  html: `<p>Loan <strong>${applicationRef}</strong> for <strong>${customerName}</strong> is now 1 day overdue (${fmtNaira(
                    amount,
                  )}).</p><p>Please follow up with the customer.</p>`,
                  text: `Loan ${applicationRef} (${customerName}) is 1 day overdue (${fmtNaira(
                    amount,
                  )}). Please follow up.`,
                }).catch((e) =>
                  console.error('[REMINDER] LO email failed:', e?.message),
                );
                db.notification
                  .create({
                    data: {
                      adminId: loan.loanOfficer.id,
                      type: 'payment_due',
                      title: `Overdue: ${applicationRef}`,
                      message: `Loan ${applicationRef} (${customerName}) is 1 day overdue. Follow up with customer.`,
                      category: 'payment',
                      actionLabel: 'View Loan',
                      actionView: 'loan-detail',
                      actionParams: JSON.stringify({ loanId: loan.id }),
                    },
                  })
                  .catch((e) =>
                    console.error('[REMINDER] LO in-app failed:', e?.message),
                  );
              }
              await recordReminderSent({
                loanId: loan.id,
                repaymentId,
                bucket,
                channel: 'staff_notify',
                recipient: loan.loanOfficer?.email || '',
                description: `1-day overdue notice for ${applicationRef} (LO notified)`,
              });
              stats.remindersSent++;
            } else {
              stats.skipped++;
            }
          }

          // 7 days after → final notice + notify BM + mark defaulter
          else if (bucket === '7d_after') {
            const already = await reminderAlreadySentToday({
              loanId: loan.id,
              repaymentId,
              bucket,
            });
            if (!already) {
              sendTemplatedNotification('payment_overdue', vars, recipients).catch(
                (e) => console.error('[REMINDER] templated notify failed:', e?.message),
              );
              if (phone) {
                sendSms({
                  to: phone,
                  message: `FINAL NOTICE: Your loan ${applicationRef} is 7 days overdue (${fmtNaira(
                    amount,
                  )}). Pay immediately to avoid further action and credit-bureau reporting. - Watershed Capital`,
                }).catch((e) => console.error('[REMINDER] SMS failed:', e?.message));
              }
              // Notify Branch Manager
              const bm = loan.branch?.manager;
              if (bm?.email) {
                sendEmail({
                  to: bm.email,
                  subject: `FINAL NOTICE: ${applicationRef} 7 days overdue`,
                  html: `<p>Loan <strong>${applicationRef}</strong> (${customerName}) is now <strong>7 days overdue</strong>.</p><p>Final notice has been sent to the customer. Please escalate per credit policy.</p>`,
                  text: `Loan ${applicationRef} (${customerName}) is 7 days overdue. Final notice sent. Please escalate.`,
                }).catch((e) =>
                  console.error('[REMINDER] BM email failed:', e?.message),
                );
                db.notification
                  .create({
                    data: {
                      adminId: bm.id,
                      type: 'payment_due',
                      title: `7-day overdue: ${applicationRef}`,
                      message: `Loan ${applicationRef} (${customerName}) is 7 days overdue. Escalate per credit policy.`,
                      category: 'payment',
                      actionLabel: 'View Loan',
                      actionView: 'loan-detail',
                      actionParams: JSON.stringify({ loanId: loan.id }),
                    },
                  })
                  .catch((e) =>
                    console.error('[REMINDER] BM in-app failed:', e?.message),
                  );
              }
              // Mark as defaulter (30+ day flag is set by auto-npl, but 7-day
              // final notice is the explicit "defaulter" trigger per policy).
              if (!loan.defaulter) {
                await db.loanApplicants.update({
                  where: { id: loan.id },
                  data: { defaulter: true },
                });
                stats.defaultersFlagged++;
              }
              await recordReminderSent({
                loanId: loan.id,
                repaymentId,
                bucket,
                channel: 'staff_notify',
                recipient: bm?.email || '',
                description: `Final notice (7-day overdue) for ${applicationRef} (BM notified, defaulter flagged)`,
              });
              stats.remindersSent++;
            } else {
              stats.skipped++;
            }
          }
        }

        // Always refresh NPL classification metadata on the loan so dashboards
        // can surface the latest ladder stage (cheap — one UPDATE per loan).
        try {
          const assessment = await assessLoanOverdue(loan.id);
          if (assessment) {
            const newNpl = classifyNPL(assessment.daysOverdue);
            // Stash the NPL classification + daysOverdue on the loan's
            // bmRiskFlags JSON (already used for risk metadata) so it survives
            // without requiring a schema migration.
            const existingMeta = loan.bmRiskFlags
              ? JSON.parse(loan.bmRiskFlags)
              : {};
            const updatedMeta = {
              ...existingMeta,
              nplClassification: newNpl,
              daysOverdue: assessment.daysOverdue,
              totalOverdueAmount: assessment.totalOverdueAmount,
              lastAssessedAt: new Date().toISOString(),
            };
            // Only write if changed
            if (
              existingMeta.nplClassification !== newNpl ||
              existingMeta.daysOverdue !== assessment.daysOverdue
            ) {
              await db.loanApplicants.update({
                where: { id: loan.id },
                data: { bmRiskFlags: JSON.stringify(updatedMeta) },
              });
            }
          }
        } catch (e: any) {
          console.error('[REMINDER] NPL refresh failed:', e?.message);
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
    console.error('[CRON payment-reminders] error:', e);
    return NextResponse.json(
      { success: false, error: e.message, stats },
      { status: 500 },
    );
  }
}

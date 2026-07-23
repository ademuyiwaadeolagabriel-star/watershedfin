import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { WORKFLOW_TRANSITIONS, STEP_PERMISSIONS, hasPermission, ROLE_TO_MCC } from '@/lib/constants';
import { createNotification, notifyNextGateStaff } from '@/lib/notifications';
import { getAuthFromRequest, getAdminFromRequest } from '@/lib/auth';
import { notifyLoanSubmitted, notifyLoanApproved, notifyLoanDeclined, notifyLoanQueried, notifyLoanDisbursed } from '@/lib/notification-service';

// POST /api/loans/[id]/transition
// A1 FIX: Requires Bearer token authentication
// Body: { action: 'forward'|'return'|'query'|'reject'|'disburse', comment?, nextStep?, mccDecision? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // A1 FIX: Verify authentication via JWT
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required. Provide a valid Bearer token.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();
    const { action, comment, nextStep, mccDecision } = body;

    // A1 FIX: Get adminId from JWT token, NOT from request body
    const adminId = authPayload.id;

    if (!action) {
      return NextResponse.json({ error: 'action required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { appraisal: true, user: { include: { business: true } } },
    });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    const currentStep = loan.currentStep;
    const requiredPerm = STEP_PERMISSIONS[currentStep] || '';
    if (admin.role !== 'super' && !hasPermission(admin as any, requiredPerm) && !(admin as any)[requiredPerm]) {
      return NextResponse.json(
        { error: `You don't have permission to act on step ${currentStep} (requires ${requiredPerm})` },
        { status: 403 }
      );
    }

    // v38: CAM Submission Lock — cannot submit/forward from LO_ENTRY or BM_VETTING/BM_QC
    // until the customer's account number has been assigned (Legal CAC approved)
    if (action === 'forward' && ['LO_ENTRY', 'LO_ASSESSMENT', 'BM_QC', 'BM_VETTING'].includes(currentStep)) {
      const user = loan.user;
      if (user && user.accountNumberStatus !== 'assigned') {
        return NextResponse.json(
          {
            error: 'Cannot submit CAM for appraisal until Legal CAC Name Search is approved and the customer account number has been assigned.',
            accountNumberStatus: user.accountNumberStatus || 'pending',
          },
          { status: 403 }
        );
      }
    }

    // S1 FIX: Branch scoping — branch-scoped roles can only act on loans in their branch
    const branchScopedRoles = ['bm', 'loan', 'frontdesk', 'treasury'];
    if (branchScopedRoles.includes(admin.role) && admin.branchId && loan.branchId && admin.branchId !== loan.branchId) {
      return NextResponse.json(
        { error: 'Access denied — this loan belongs to a different branch.' },
        { status: 403 }
      );
    }

    let newStep = currentStep;
    let newStatus = loan.status;
    let approvalAction = '';
    const metadata: any = { previousStep: currentStep, action };

    switch (action) {
      case 'forward': {
        const allowed = WORKFLOW_TRANSITIONS[currentStep] || [];
        newStep = nextStep && allowed.includes(nextStep) ? nextStep : (allowed[0] || currentStep);

        // v38: BM Self-Vet — if a BM is forwarding from LO_ENTRY and they are the loan's creator,
        // skip BM_QC and go directly to HOC_ASSIGNMENT
        if (currentStep === 'LO_ENTRY' && admin.role === 'bm' && loan.staffId === admin.id) {
          newStep = 'HOC_ASSIGNMENT'; // Skip BM_QC — BM self-vets
          // Log the self-vet in audit trail
          try {
            await db.workflowRework.create({
              data: {
                loanId: loan.id,
                fromStep: 'LO_ENTRY',
                toStep: 'HOC_ASSIGNMENT',
                reworkedById: admin.id,
                reason: 'BM self-vet — skipped BM_QC (BM is the loan creator)',
                comments: 'BM created and vetted this loan themselves',
              },
            });
          } catch (e) {
            // non-blocking
          }
        }

        if (newStep === currentStep && allowed.length === 0) {
          // Terminal step — move to disbursement
          newStatus = 'running';
        }
        approvalAction = 'FORWARDED';

        // Update gate-specific timestamps + MCC decision recording
        const updates: any = {};
        switch (currentStep) {
          case 'BM_QC':
            updates.bmVerifiedAt = new Date();
            updates.bmValidatedBy = admin.id;
            updates.bmReviewDate = new Date();
            if (mccDecision) {
              updates.bmRecommendedAmount = mccDecision.recommendedAmount;
              updates.bmRecommendedTenor = mccDecision.duration;
              updates.bmComment = mccDecision.comment;
            }
            break;
          case 'HOC_STRUCTURING':
          case 'HOC_APPROVAL':
            updates.hocStructuredAt = new Date();
            if (mccDecision) {
              updates.hocRecommendedAmount = mccDecision.recommendedAmount;
              updates.hocRecommendedTenor = mccDecision.duration;
            }
            break;
          case 'LEGAL_KYC_CHECK':
            updates.legalClearedAt = new Date();
            // Legal KYC/CAC verification — early gatekeeper
            if (mccDecision && mccDecision.decisionType === 'rejected') {
              // Legal rejected — send back to LO
              newStep = 'LO_ENTRY';
              newStatus = 'queried';
            }
            break;
          case 'HOC_ASSIGNMENT':
            // HOC assigns analyst — record assignment
            updates.hocStructuredAt = new Date();
            if (mccDecision) {
              updates.assignedAnalystId = mccDecision.assignedAnalystId || null;
            }
            break;
          case 'ANALYST_STRUCTURING':
            updates.analystReviewedAt = new Date();
            // Analyst's structured recommendation (Triple Lock: Amount, Tenor, Rate)
            if (mccDecision) {
              updates.appraisedAmount = mccDecision.recommendedAmount;
              updates.appraisedTenor = mccDecision.duration;
              updates.structuredAmount = mccDecision.recommendedAmount;
              updates.structuredTenor = mccDecision.duration;
            }
            break;
          case 'HOC_REVIEW':
            updates.hocStructuredAt = new Date();
            // HOC endorses or returns analyst's structure
            if (mccDecision) {
              updates.hocRecommendedAmount = mccDecision.recommendedAmount;
              updates.hocRecommendedTenor = mccDecision.duration;
            }
            break;
          case 'CRO_RISK':
            updates.riskApprovedAt = new Date();
            updates.croCheckedAt = new Date();
            // CRO provides max safe exposure (opinion, not override)
            if (mccDecision) {
              updates.riskApprovedAmount = mccDecision.recommendedAmount;
            }
            break;
          case 'CFO_REVIEW':
            updates.cfoClearedAt = new Date();
            // CFO provides liquidity limit (opinion, not override)
            if (mccDecision) {
              updates.cfoApprovedAmount = mccDecision.recommendedAmount;
              updates.cfoApprovedTenor = mccDecision.duration;
            }
            break;
          case 'LEGAL_AGGREGATION':
            updates.legalClearedAt = new Date();
            // Legal compiles Executive Credit Pack — sole aggregator
            // Legal verifies: collateral perfection, title docs, guarantor execution,
            // facility agreement, insurance, regulatory compliance
            updates.finalOfferGeneratedAt = new Date();
            break;
          case 'MD_APPROVAL':
            updates.mdApprovedAt = new Date();
            updates.offerLetterGeneratedAt = new Date();
            // MD provides FINAL approval — may differ from all other recommendations
            if (mccDecision) {
              updates.finalApprovedAmount = mccDecision.recommendedAmount;
              updates.finalApprovedTenor = mccDecision.duration;
              updates.finalInterestRate = mccDecision.interestRatePercentage;
              updates.finalCcdFeePercent = mccDecision.ccdPercentage;
              updates.finalUpfrontFeePercent = mccDecision.upfrontFeePercentage;
              updates.finalAmount = mccDecision.recommendedAmount;
              updates.finalTenure = mccDecision.duration;

              // ── AUTO-RECALCULATION: If MD changes the amount, regenerate repayment schedule ──
              const mdAmount = Number(mccDecision.recommendedAmount) || 0;
              const mdTenor = Number(mccDecision.duration) || loan.duration;
              const mdRate = Number(mccDecision.interestRatePercentage) || loan.percent || 24;
              const mdMethod = loan.repaymentPlan || 'REDUCING';

              if (mdAmount > 0 && mdTenor > 0) {
                try {
                  const { calculateLoanSchedule } = await import('@/lib/loan-calc');
                  const schedule = calculateLoanSchedule(mdAmount, mdRate, mdTenor, mdMethod);
                  // Store the recalculated schedule for offer letter generation
                  updates.scheduledDisbursementDate = null; // reset — HOC will set later
                  // Delete old repayment schedule and create new one
                  await db.loanRepayment.deleteMany({ where: { loanApplicantId: id } });
                  for (const row of schedule.schedule) {
                    await db.loanRepayment.create({
                      data: {
                        loanApplicantId: id,
                        refId: `${loan.applicationRef}-R${row.month}`,
                        dueDate: row.dueDate,
                        amountDue: row.installment,
                        principalPart: row.principal,
                        interestPart: row.interest,
                        amountPaid: 0,
                        status: 'pending',
                      },
                    });
                  }
                } catch (e) {
                  console.error('Auto-recalc error:', e);
                }
              }
            }
            break;
          case 'CUSTOMER_ACCEPTANCE':
            // Customer accepts the offer
            updates.acceptedAt = new Date();
            break;
          case 'CUSTOMER_NEGOTIATION':
            // Customer rejected — enters negotiation
            updates.status = 'queried';
            break;
          case 'HOC_SCHEDULING':
            // ── HOC GO-LIVE: Loan is activated (status = RUNNING) but money NOT yet moved ──
            updates.hocFinalizedAt = new Date();
            updates.startDate = mccDecision?.startDate ? new Date(mccDecision.startDate) : new Date();
            updates.maturityDate = mccDecision?.maturityDate ? new Date(mccDecision.maturityDate) : null;
            newStatus = 'running'; // Loan account is now LIVE
            break;
          case 'CFO_DISBURSEMENT':
            // ── CFO DISBURSEMENT: Funds are released (separate from activation) ──
            // Pre-disbursement validation: verify all conditions are met
            const pendingConditions = await db.complianceCondition.findMany({
              where: { loanApplicantId: id, status: { not: 'verified' }, priority: 'critical' },
            });
            if (pendingConditions.length > 0) {
              return NextResponse.json({
                error: `Cannot disburse — ${pendingConditions.length} critical condition(s) not verified: ${pendingConditions.map(c => c.title).join(', ')}`,
              }, { status: 400 });
            }
            updates.disbursedAt = new Date();
            updates.disbursementDate = new Date();
            updates.disbursedBy = admin.id;
            break;
        }
        if (Object.keys(updates).length > 0) {
          await db.loanApplicants.update({ where: { id }, data: updates });
        }

        // Record MCC decision if provided
        if (mccDecision) {
          const mccRole = ROLE_TO_MCC[admin.role] || ROLE_TO_MCC[admin.roleType || ''] || 'LO';
          const levelMap: Record<string, number> = { LO: 1, BM: 2, CA: 3, HOC: 4, CRO: 5, LEGAL: 6, GCFO: 7, MD: 8 };
          await db.mccDecision.upsert({
            where: {
              loanApplicantId_approverId_approverRole: {
                loanApplicantId: id,
                approverId: admin.id,
                approverRole: mccRole,
              },
            },
            create: {
              loanApplicantId: id,
              approverId: admin.id,
              approverName: `${admin.firstName} ${admin.lastName}`,
              approverRole: mccRole,
              approvalLevel: levelMap[mccRole] || 1,
              recommendedAmount: mccDecision.recommendedAmount || null,
              duration: mccDecision.duration || null,
              ccdPercentage: mccDecision.ccdPercentage || null,
              upfrontFeePercentage: mccDecision.upfrontFeePercentage || null,
              interestRatePercentage: mccDecision.interestRatePercentage || null,
              comment: mccDecision.comment || null,
              decisionType: mccDecision.decisionType || 'approved',
              decisionDate: new Date(),
            },
            update: {
              recommendedAmount: mccDecision.recommendedAmount || null,
              duration: mccDecision.duration || null,
              ccdPercentage: mccDecision.ccdPercentage || null,
              upfrontFeePercentage: mccDecision.upfrontFeePercentage || null,
              interestRatePercentage: mccDecision.interestRatePercentage || null,
              comment: mccDecision.comment || null,
              decisionType: mccDecision.decisionType || 'approved',
              decisionDate: new Date(),
            },
          });
        }
        break;
      }

      case 'return': {
        const allowed = WORKFLOW_TRANSITIONS[currentStep] || [];
        const returnSteps = getReturnSteps(currentStep);
        newStep = nextStep && returnSteps.includes(nextStep) ? nextStep : (returnSteps[0] || currentStep);
        approvalAction = 'RETURNED';
        break;
      }

      case 'query': {
        newStep = 'QUERY_RESPONSE';
        newStatus = 'queried';
        approvalAction = 'QUERIED';
        break;
      }

      case 'reject': {
        newStatus = 'declined';
        approvalAction = 'REJECTED';
        break;
      }

      case 'disburse': {
        if (currentStep !== 'TREASURY_PAYOUT' && currentStep !== 'CFO_DISBURSEMENT') {
          return NextResponse.json({ error: 'Can only disburse from TREASURY_PAYOUT step' }, { status: 400 });
        }
        await db.loanApplicants.update({
          where: { id },
          data: {
            disbursedAt: new Date(),
            disbursementDate: new Date(),
            disbursedBy: admin.id,
            startDate: new Date(),
            status: 'running',
          },
        });
        newStatus = 'running';
        approvalAction = 'DISBURSED';
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Update loan step + status
    await db.loanApplicants.update({
      where: { id },
      data: { currentStep: newStep, status: newStatus },
    });

    // Create approval log
    await db.approvalLog.create({
      data: {
        loanApplicantId: id,
        adminId: admin.id,
        action: approvalAction,
        roleAtTimeOfAction: admin.role,
        comments: comment || `${approvalAction} from ${currentStep} to ${newStep}`,
        metadata: JSON.stringify(metadata),
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: approvalAction.toLowerCase(),
        module: 'loan',
        description: `Loan ${loan.applicationRef}: ${approvalAction} from ${currentStep} to ${newStep}`,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        severity: action === 'reject' ? 'critical' : action === 'query' ? 'warning' : 'info',
        metadata: JSON.stringify({ loanId: id, previousStep: currentStep, newStep, newStatus }),
      },
    });

    // ── Notifications (fire-and-forget) ────────────────────────────────────
    const customerName =
      loan.user && (loan.user.firstName || loan.user.lastName)
        ? `${loan.user.firstName} ${loan.user.lastName}`.trim()
        : loan.user?.business?.name || undefined;

    if (loan.userId) {
      // Customer notification about the action taken on their loan
      let customerTitle = `Loan ${loan.applicationRef} update`;
      let customerMessage = `Your loan ${loan.applicationRef} has been ${approvalAction.toLowerCase()} from ${currentStep.replace(
        /_/g,
        ' '
      )} to ${newStep.replace(/_/g, ' ')}.`;
      let customerType = 'loan_approved';

      if (action === 'reject') {
        customerTitle = `Loan ${loan.applicationRef} declined`;
        customerMessage = `Unfortunately, your loan application ${loan.applicationRef} has been declined. ${
          comment ? `Reason: ${comment}` : 'Please contact your loan officer for details.'
        }`;
        customerType = 'loan_rejected';
      } else if (action === 'query') {
        customerTitle = `Loan ${loan.applicationRef} — query needs your response`;
        customerMessage = `A query has been raised on your loan ${loan.applicationRef}. ${
          comment ? `Query: ${comment}` : 'Please respond at your earliest.'
        }`;
        customerType = 'loan_submitted';
      } else if (action === 'return') {
        customerTitle = `Loan ${loan.applicationRef} returned for review`;
        customerMessage = `Your loan ${loan.applicationRef} has been returned to an earlier step for additional review. ${
          comment ? `Note: ${comment}` : ''
        }`;
        customerType = 'loan_submitted';
      } else if (action === 'forward') {
        customerTitle = `Loan ${loan.applicationRef} approved at ${currentStep.replace(/_/g, ' ')}`;
        customerMessage = `Good news! Your loan ${loan.applicationRef} has been approved at the ${currentStep.replace(
          /_/g,
          ' '
        )} gate and is now at ${newStep.replace(/_/g, ' ')}.`;
        customerType = 'loan_approved';
      }

      void createNotification({
        userId: loan.userId,
        type: customerType,
        title: customerTitle,
        message: customerMessage,
        category: 'loan',
        actionLabel: 'View Loan',
        actionView: 'customer-loan-breakdown',
        actionParams: { loanId: id },
        metadata: {
          loanId: id,
          applicationRef: loan.applicationRef,
          action,
          previousStep: currentStep,
          newStep,
        },
      });
    }

    // Next-gate staff notification — only when there is a meaningful next step
    if (action === 'forward' || action === 'return') {
      void notifyNextGateStaff(newStep, loan.branchId, {
        loanId: id,
        applicationRef: loan.applicationRef,
        customerName,
        amount: Number(loan.amount) || undefined,
      });
    }

    // ── EMAIL NOTIFICATIONS (fire-and-forget) ──────────────────────────
    // Send branded emails to customer at key workflow milestones
    if (action === 'query') {
      void notifyLoanQueried(loan, comment || 'Please contact your loan officer.');
    } else if (action === 'reject') {
      void notifyLoanDeclined(loan, comment);
    } else if (action === 'forward') {
      // Send approval email when MD approves
      if (currentStep === 'MD_APPROVAL' && mccDecision) {
        const approvedAmount = Number(mccDecision.recommendedAmount) || Number(loan.amount);
        const tenor = Number(mccDecision.duration) || Number(loan.duration);
        const rate = Number(mccDecision.interestRatePercentage) || 24;
        const monthlyRate = rate / 100 / 12;
        const monthlyPayment = monthlyRate === 0
          ? approvedAmount / tenor
          : (approvedAmount * monthlyRate * Math.pow(1 + monthlyRate, tenor)) / (Math.pow(1 + monthlyRate, tenor) - 1);
        void notifyLoanApproved(loan, approvedAmount, monthlyPayment, tenor);
      }
      // Send disbursement email when CFO disburses
      if (currentStep === 'CFO_DISBURSEMENT') {
        void notifyLoanDisbursed(loan);
      }
    }

    return NextResponse.json({
      success: true,
      loan: { id, currentStep: newStep, status: newStatus },
      action: approvalAction,
      previousStep: currentStep,
      newStep,
    });
  } catch (e: any) {
    console.error('Transition error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function getReturnSteps(currentStep: string): string[] {
  const map: Record<string, string[]> = {
    BM_QC: ['LO_ASSESSMENT'],
    HOC_STRUCTURING: ['BM_QC'],
    ANALYST_STRUCTURING: ['HOC_STRUCTURING'],
    HOC_APPROVAL: ['ANALYST_STRUCTURING', 'HOC_STRUCTURING'],
    CRO_VERIFICATION: ['HOC_APPROVAL'],
    CRO_RISK: ['HOC_APPROVAL'],
    CFO_REVIEW: ['CRO_RISK'],
    LEGAL_REVIEW: ['CFO_REVIEW'],
    LEGAL_FINAL_REVIEW: ['LEGAL_REVIEW'],
    MD_APPROVAL: ['LEGAL_FINAL_REVIEW', 'HOC_AGGREGATION'],
    INTERNAL_CONTROL_CHECK: ['MD_APPROVAL'],
    HOC_FINALIZATION: ['MD_APPROVAL'],
  };
  return map[currentStep] || [];
}

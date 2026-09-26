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
    const authPayload = await getAuthFromRequest(req);
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

        // v52 — P0-G3: SERVER-ENFORCED WORKFLOW GATE.
        // Before forwarding, verify there is an ACTIVE MccDecision with
        // decisionType='approved' for the current step's role. The audit's
        // #18 finding was that the transition API computed `newStep = allowed[0]`
        // without requiring an actual approval to exist — so an insider
        // could advance a loan past MD approval without MD ever touching it.
        //
        // The MCC role expected for each workflow step is mapped here. We
        // skip the gate for assignment-only steps (HOC_ASSIGNMENT,
        // HOC_SCHEDULING, CUSTOMER_ACCEPTANCE) which don't require a
        // credit-governance approval, only an action.
        const STEP_TO_REQUIRED_MCC_ROLE: Record<string, string | null> = {
          LO_ENTRY: null,           // LO submits — no approval needed
          LO_ASSESSMENT: 'LO',
          LEGAL_KYC_CHECK: 'LEGAL',
          BM_QC: 'BM',
          BM_VETTING: 'BM',
          HOC_ASSIGNMENT: null,     // HOC assigns analyst — not an approval
          ANALYST_STRUCTURING: 'CA',
          HOC_REVIEW: 'HOC',
          HOC_STRUCTURING: 'HOC',
          HOC_APPROVAL: 'HOC',
          CRO_RISK: 'CRO',
          CFO_REVIEW: 'GCFO',
          LEGAL_MCC: 'LEGAL',
          LEGAL_NAME_SEARCH: 'LEGAL',
          MD_APPROVAL: 'MD',
          CUSTOMER_ACCEPTANCE: null, // customer action — enforced by customer JWT
          HOC_SCHEDULING: null,     // HOC go-live — not an approval
          CFO_DISBURSEMENT: null,    // disbursement 4-eyes enforced in disburse route
        };
        const requiredRole = STEP_TO_REQUIRED_MCC_ROLE[currentStep];
        if (requiredRole) {
          const activeApproval = await db.mccDecision.findFirst({
            where: {
              loanApplicantId: id,
              approverRole: requiredRole,
              status: 'ACTIVE',
              decisionType: 'approved',
            },
          });
          if (!activeApproval) {
            return NextResponse.json(
              {
                error: `Cannot forward from '${currentStep}': no ACTIVE approved MCC decision found for role '${requiredRole}'. The ${requiredRole} must record an approval before this loan can advance.`,
                currentStep,
                requiredRole,
              },
              { status: 409 },
            );
          }
        }

        // v38: BM Self-Vet — if a BM is forwarding from LO_ENTRY and they created
        // the customer (or are the assigned BM), skip BM_QC and go directly to HOC_ASSIGNMENT.
        // v41: Fixed the condition — previously checked loan.staffId === admin.id which
        // never held for bm_onboard (staffId is set to the chosen LO, not the BM).
        // Now checks createdBy and assignedBmId on the user record.
        if (currentStep === 'LO_ENTRY' && admin.role === 'bm') {
          const loanUser = loan.user as any;
          const isCreator = loanUser?.createdBy === admin.id;
          const isAssignedBm = loanUser?.assignedBmId === admin.id;
          if (isCreator || isAssignedBm) {
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
        }

        if (newStep === currentStep && allowed.length === 0) {
          // v54 — Blocker 7: REMOVED `newStatus = 'running'`. The transition
          // route is NOT the authority for setting loan.status='running'.
          // That is the sole responsibility of the 4-eyes disbursement
          // endpoint at /api/loans/[id]/disburse. The terminal-step forward
          // just advances to ACTIVE_MONITORING; the disbursement endpoint
          // sets status='running' + disbursedAt when the 4-eyes completes.
          // (No status mutation here.)
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
            // HOC assigns analyst — record assignment on CreditAppraisal (not LoanApplicants)
            updates.hocStructuredAt = new Date();
            if (mccDecision?.assignedAnalystId) {
              try {
                await db.creditAppraisal.updateMany({
                  where: { loanApplicantId: id },
                  data: { assignedAnalystId: mccDecision.assignedAnalystId },
                });
              } catch (e) {
                console.warn('[LOAN TRANSITION] Failed to assign analyst on CreditAppraisal:', e);
              }
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
          case 'LEGAL_MCC':
            // v41: Legal MCC Compliance Review — separate from Legal Name Search (onboarding)
            // and separate from LEGAL_AGGREGATION (credit pack compilation).
            // Legal staff verify all 10 compliance checks (loan agreement, offer letter,
            // CAC docs, ID, address, collateral, insurance, regulatory, AML, sanctions).
            updates.legalClearedAt = new Date();
            updates.auditPassedAt = new Date();  // Internal control gate passed
            // Persist the compliance report on the CreditAppraisal as JSON metadata
            if (mccDecision) {
              try {
                await db.creditAppraisal.updateMany({
                  where: { loanApplicantId: id },
                  data: {
                    engineDump: JSON.stringify({ legalMccReport: mccDecision, legalMccDecisionAt: new Date().toISOString() }),
                  },
                });
              } catch (e) {
                // non-blocking
              }
            }
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
              // v54 (audit #7): fail-closed on interest rate — never silently
              // default to 24% if MD's MCC decision is missing a rate.
              const mdRateRaw = Number(mccDecision.interestRatePercentage) || Number(loan.percent);
              const mdMethod: 'REDUCING' | 'FLAT' = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';

              if (mdAmount > 0 && mdTenor > 0 && mdRateRaw > 0) {
                try {
                  const { calculateLoanSchedule } = await import('@/lib/loan-calc');
                  const schedule = calculateLoanSchedule(mdAmount, mdRateRaw, mdTenor, mdMethod);
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
            // v53 — HOC GO-LIVE: Loan account is activated (status=running)
            // but money NOT yet moved. Funds are released only via the
            // 4-eyes disbursement endpoint at /api/loans/[id]/disburse.
            // The transition route only stamps HOC scheduling metadata.
            updates.hocFinalizedAt = new Date();
            updates.startDate = mccDecision?.startDate ? new Date(mccDecision.startDate) : new Date();
            updates.maturityDate = mccDecision?.maturityDate ? new Date(mccDecision.maturityDate) : null;
            // Note: status='running' is intentionally NOT set here. The loan
            // account exists and the schedule is generated, but the loan is
            // not "running" until /api/loans/[id]/disburse completes the
            // 4-eyes disbursement. The disbursement endpoint is the sole
            // authority for setting status='running' + disbursedAt.
            break;
          case 'CFO_DISBURSEMENT':
            // v53 — REMOVED direct disbursement fields from this branch.
            // The transition route's CFO_DISBURSEMENT forward should only
            // advance the workflow state, NOT set disbursedAt/disbursedBy/
            // disbursementDate. Those fields are the authoritative
            // responsibility of /api/loans/[id]/disburse (4-eyes).
            // Pre-disbursement validation is also done by the disburse
            // route itself.
            // (No field mutations here — just advance to ACTIVE_MONITORING.)
            break;
        }
        if (Object.keys(updates).length > 0) {
          await db.loanApplicants.update({ where: { id }, data: updates });
        }

        // Record MCC decision if provided.
        // v52 — #21 immutable decisions: replace upsert with supersession chain.
        // Find any existing ACTIVE decision for this (loanId, approverRole),
        // mark SUPERSEDED, then INSERT new ACTIVE decision.
        if (mccDecision) {
          const mccRole = ROLE_TO_MCC[admin.role] || ROLE_TO_MCC[admin.roleType || ''] || 'LO';
          const levelMap: Record<string, number> = { LO: 1, BM: 2, CA: 3, HOC: 4, CRO: 5, LEGAL: 6, GCFO: 7, MD: 8 };
          const priorActive = await db.mccDecision.findFirst({
            where: { loanApplicantId: id, approverRole: mccRole, status: 'ACTIVE' },
            orderBy: { decisionSequence: 'desc' },
          });
          const maxSeq = await db.mccDecision.aggregate({
            where: { loanApplicantId: id, approverRole: mccRole },
            _max: { decisionSequence: true },
          });
          const nextSeq = (maxSeq._max.decisionSequence || 0) + 1;
          if (priorActive) {
            await db.mccDecision.update({
              where: { id: priorActive.id },
              data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededById: admin.id },
            });
          }
          await db.mccDecision.create({
            data: {
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
              status: 'ACTIVE',
              decisionSequence: nextSeq,
              supersedesDecisionId: priorActive?.id || null,
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
        // v47: Unlock the CAM snapshot so the LO can edit and respond to the query
        try {
          await db.creditAppraisal.updateMany({
            where: { loanApplicantId: id },
            data: { isSnapshotLocked: false },
          });
        } catch {}
        break;
      }

      case 'reject': {
        newStatus = 'declined';
        approvalAction = 'REJECTED';
        break;
      }

      case 'disburse': {
        // v53 — REMOVED. The transition route no longer performs direct
        // disbursement — that was a state-machine bypass of the 4-eyes
        // disbursement endpoint at /api/loans/[id]/disburse. Per the v53
        // gap matrix Table D row 3 (audit #11): having two paths that can
        // set loan.status='running' + loan.disbursedAt means the 4-eyes
        // control can be bypassed by an admin calling transition?action=disburse.
        //
        // Callers must use the controlled disbursement workflow:
        //   POST /api/loans/[id]/disburse
        // which enforces maker/checker segregation of duties.
        return NextResponse.json(
          {
            error: 'Direct disbursement via transition is no longer supported. Use the controlled 4-eyes disbursement workflow at POST /api/loans/[id]/disburse.',
            see: '/api/loans/[id]/disburse',
          },
          { status: 409 },
        );
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
        applicationRef: loan.applicationRef || '',
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
        // v54 (audit #7): fail-closed — never silently default rate to 24%.
        const rate = Number(mccDecision.interestRatePercentage) || Number(loan.percent) || Number(loan.finalInterestRate);
        if (!approvedAmount || !tenor || !rate) {
          // Skip the email rather than fabricate numbers; the actual loan
          // record still has the correct values from the MD_APPROVAL update.
          console.error('[transition] MD_APPROVAL email skipped — missing rate/amount/tenor', { approvedAmount, tenor, rate });
        } else {
          const monthlyRate = rate / 100 / 12;
          const monthlyPayment = monthlyRate === 0
            ? approvedAmount / tenor
            : (approvedAmount * monthlyRate * Math.pow(1 + monthlyRate, tenor)) / (Math.pow(1 + monthlyRate, tenor) - 1);
          void notifyLoanApproved(loan, approvedAmount, monthlyPayment, tenor);
        }
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
  // v44: Updated to match the v41 13-step workflow (LEGAL_MCC, HOC_REVIEW, etc.)
  const map: Record<string, string[]> = {
    // Phase 1: Pre-Qualification
    LEGAL_KYC_CHECK: ['LO_ENTRY'],           // Legal can return to LO
    BM_QC: ['LO_ENTRY', 'LEGAL_KYC_CHECK'],  // BM can return to LO or Legal
    QUERY_RESPONSE: ['LO_ENTRY', 'LEGAL_KYC_CHECK'],

    // Phase 2: Engine Room
    HOC_ASSIGNMENT: ['BM_QC'],               // HOC can return to BM
    ANALYST_STRUCTURING: ['HOC_ASSIGNMENT'], // Analyst can return to HOC
    HOC_REVIEW: ['ANALYST_STRUCTURING'],     // HOC can return to Analyst

    // Phase 3: Governance
    CRO_RISK: ['HOC_REVIEW'],                // CRO can return to HOC
    CFO_REVIEW: ['CRO_RISK'],                // CFO can return to CRO
    LEGAL_MCC: ['CFO_REVIEW'],               // Legal MCC can return to CFO
    LEGAL_AGGREGATION: ['CFO_REVIEW'],       // Legacy — Legal aggregation can return to CFO
    MD_APPROVAL: ['LEGAL_MCC', 'LEGAL_AGGREGATION'],  // MD can return to Legal MCC or Legal Aggregation

    // Phase 4: Closing
    CUSTOMER_ACCEPTANCE: ['MD_APPROVAL'],    // Customer negotiation can return to MD
    CUSTOMER_NEGOTIATION: ['MD_APPROVAL'],
    HOC_SCHEDULING: ['CUSTOMER_ACCEPTANCE'], // HOC can return to customer acceptance
    CFO_DISBURSEMENT: ['HOC_SCHEDULING'],    // CFO can return to HOC scheduling

    // Phase 5: Post-Disbursement
    REPAYMENT_TRACKING: ['ACTIVE_MONITORING'],
    EARLY_WARNING: ['REPAYMENT_TRACKING'],
    COLLECTIONS: ['REPAYMENT_TRACKING'],

    // Legacy steps (kept for backward compatibility with existing loans)
    LO_ASSESSMENT: ['LO_ENTRY'],
    HOC_STRUCTURING: ['BM_QC'],
    HOC_APPROVAL: ['ANALYST_STRUCTURING', 'HOC_STRUCTURING'],
    CRO_VERIFICATION: ['HOC_APPROVAL'],
    LEGAL_REVIEW: ['CFO_REVIEW'],
    LEGAL_FINAL_REVIEW: ['LEGAL_REVIEW'],
    INTERNAL_CONTROL_CHECK: ['MD_APPROVAL'],
    HOC_FINALIZATION: ['MD_APPROVAL'],
    TREASURY_PAYOUT: ['CFO_DISBURSEMENT', 'INTERNAL_CONTROL_CHECK'],
  };
  return map[currentStep] || [];
}

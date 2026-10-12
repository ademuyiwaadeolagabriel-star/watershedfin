// ============================================================================
// v5 — Central Security Foundation: Authorization
// ============================================================================
// Centralized authorization helpers that combine role + branch + resource
// ownership + workflow state checks.
//
// These are the reusable primitives that routes SHOULD use instead of
// inline checks scattered throughout handlers.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, type AuthPayload } from '../auth';

// National roles bypass branch scope
const NATIONAL_ROLES = ['super', 'md', 'hoc', 'cro', 'cfo', 'legal'];

/**
 * Require that the authenticated admin has access to a specific loan.
 * Checks:
 *   - role is in allowedRoles
 *   - if branch-scoped role, admin.branchId === loan.branchId
 *   - if 'loan' role, admin.id === loan.staffId (assigned LO)
 *   - if 'bm' role, admin.id === loan.user.assignedBmId
 */
export async function requireLoanAccess(
  req: NextRequest,
  loanId: string,
  allowedRoles: string[],
): Promise<AuthPayload | NextResponse> {
  const authResult = await requireRole(req, allowedRoles);
  if (authResult instanceof NextResponse) return authResult;
  const payload = authResult as AuthPayload;

  // National roles bypass branch/portfolio checks
  if (NATIONAL_ROLES.includes(payload.role)) {
    return payload;
  }

  // Branch-scoped roles — check branch + portfolio
  const loan = await db.loanApplicants.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      branchId: true,
      staffId: true,
      userId: true,
      user: { select: { assignedBmId: true } },
    },
  });

  if (!loan) {
    return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });
  }

  // Branch check
  if (payload.branchId && loan.branchId && payload.branchId !== loan.branchId) {
    return NextResponse.json(
      { error: 'Access denied — this loan belongs to a different branch.' },
      { status: 403 },
    );
  }

  // LO assignment check
  if (payload.role === 'loan' || payload.role === 'lo') {
    if (loan.staffId && loan.staffId !== payload.id) {
      return NextResponse.json(
        { error: 'Access denied — you are not the assigned Loan Officer for this loan.' },
        { status: 403 },
      );
    }
  }

  // BM assignment check
  if (payload.role === 'bm') {
    if (loan.user?.assignedBmId && loan.user.assignedBmId !== payload.id) {
      return NextResponse.json(
        { error: 'Access denied — you are not the assigned Branch Manager for this customer.' },
        { status: 403 },
      );
    }
  }

  return payload;
}

/**
 * Require that the authenticated user owns a specific resource.
 * Used for customer-side endpoints where the resource must belong to the
 * authenticated customer.
 */
export function requireOwnership(
  resourceOwnerId: string,
  authenticatedUserId: string,
): boolean | NextResponse {
  if (resourceOwnerId !== authenticatedUserId) {
    return NextResponse.json(
      { error: 'Forbidden: resource does not belong to authenticated user.' },
      { status: 403 },
    );
  }
  return true;
}

/**
 * Require that the loan is at a specific workflow state.
 * Used to enforce the state machine.
 */
export async function requireWorkflowState(
  loanId: string,
  expectedSteps: string[],
): Promise<boolean | NextResponse> {
  const loan = await db.loanApplicants.findUnique({
    where: { id: loanId },
    select: { currentStep: true },
  });

  if (!loan) {
    return NextResponse.json({ error: 'Loan not found.' }, { status: 404 });
  }

  if (!expectedSteps.includes(loan.currentStep)) {
    return NextResponse.json(
      {
        error: `Loan is at step '${loan.currentStep}', expected one of: ${expectedSteps.join(', ')}.`,
        currentStep: loan.currentStep,
        expectedSteps,
      },
      { status: 409 },
    );
  }

  return true;
}

// Permission flags (for future ABAC expansion)
export const PERMISSIONS = {
  // Customer management
  CUSTOMER_VIEW: 'customer:view',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_EDIT: 'customer:edit',

  // Loan management
  LOAN_VIEW: 'loan:view',
  LOAN_CREATE: 'loan:create',
  LOAN_APPROVE: 'loan:approve',
  LOAN_DISBURSE: 'loan:disburse',
  LOAN_RESTRUCTURE: 'loan:restructure',

  // KYC
  KYC_VIEW: 'kyc:view',
  KYC_APPROVE: 'kyc:approve',

  // Financial
  PAYMENT_VERIFY: 'payment:verify',
  ACCOUNTING_POST: 'accounting:post',
  TREASURY_MANAGE: 'treasury:manage',

  // Admin
  STAFF_MANAGE: 'staff:manage',
  SETTINGS_CHANGE: 'settings:change',
  AUDIT_VIEW: 'audit:view',
} as const;

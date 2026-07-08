import { db } from '@/lib/db';

/**
 * Notification helper utilities.
 *
 * - createNotification() persists a Notification row AND broadcasts it over the
 *   WebSocket mini-service (port 3003) so connected clients receive it live.
 * - All emit calls are fire-and-forget — they never throw into the caller and
 *   never block the main request flow.
 */

export interface NotificationInput {
  userId?: string | null;
  adminId?: string | null;
  type: string;
  title: string;
  message: string;
  category?: string;
  actionLabel?: string | null;
  actionView?: string | null;
  actionParams?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationRecord {
  id: string;
  userId: string | null;
  adminId: string | null;
  type: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  readAt: Date | null;
  actionLabel: string | null;
  actionView: string | null;
  actionParams: string | null;
  metadata: string | null;
  createdAt: Date;
}

function safeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function emitViaWs(room: string, payload: NotificationRecord): Promise<void> {
  try {
    // Internal call to the notification mini-service REST endpoint.
    // Server-to-server, bypasses Caddy. Port 3004 is the dedicated REST port
    // (the WS server on 3003 uses path: '/' which intercepts all HTTP).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`http://localhost:3004/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room, event: 'notification', data: payload }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (e) {
    // Fire-and-forget — never propagate WS errors to caller.
    console.warn('[notifications] WS emit failed (non-fatal):', (e as Error)?.message);
  }
}

/**
 * Create a notification row + broadcast it. Resolves to the created record
 * (or null if both userId and adminId are missing). Never throws.
 */
export async function createNotification(
  input: NotificationInput
): Promise<NotificationRecord | null> {
  try {
    if (!input.userId && !input.adminId) return null;

    const created = await db.notification.create({
      data: {
        userId: input.userId || null,
        adminId: input.adminId || null,
        type: input.type,
        title: input.title,
        message: input.message,
        category: input.category || 'system',
        actionLabel: input.actionLabel || null,
        actionView: input.actionView || null,
        actionParams: safeJson(input.actionParams),
        metadata: safeJson(input.metadata),
      },
    });

    // Fire-and-forget broadcast
    const room = input.userId ? `user:${input.userId}` : `admin:${input.adminId}`;
    void emitViaWs(room, created as unknown as NotificationRecord);

    return created as unknown as NotificationRecord;
  } catch (e) {
    console.error('[notifications] createNotification failed:', (e as Error)?.message);
    return null;
  }
}

/**
 * Batch helper for fan-out to multiple recipients.
 */
export async function createNotifications(
  inputs: NotificationInput[]
): Promise<(NotificationRecord | null)[]> {
  return Promise.all(inputs.map((i) => createNotification(i)));
}

/**
 * Workflow step → role of the staff member responsible for that gate.
 * Used to fan-out "new loan awaiting your review" notifications.
 */
export const STEP_TO_ROLE: Record<string, string[]> = {
  LO_ENTRY: ['loan'],
  LO_ASSESSMENT: ['loan'],
  QUERY_RESPONSE: ['loan'],
  LEGAL_CAC_CHECK: ['legal'],
  LEGAL_REVIEW: ['legal'],
  LEGAL_FINAL_REVIEW: ['legal'],
  BM_QC: ['bm'],
  HOC_STRUCTURING: ['hoc'],
  HOC_APPROVAL: ['hoc'],
  HOC_AGGREGATION: ['hoc'],
  HOC_FINALIZATION: ['hoc'],
  HOC_SCHEDULING: ['hoc'],
  CUSTOMER_ACCEPTANCE: ['hoc'],
  ANALYST_STRUCTURING: ['analyst'],
  CRO_VERIFICATION: ['cro'],
  CRO_RISK: ['cro'],
  CFO_REVIEW: ['cfo'],
  CFO_DISBURSEMENT: ['cfo'],
  MD_APPROVAL: ['md'],
  INTERNAL_CONTROL_CHECK: ['analyst'],
  TREASURY_PAYOUT: ['treasury'],
};

/**
 * Notify every staff member responsible for the given workflow step that a
 * loan is awaiting their review. Fire-and-forget.
 *
 * @param step     Workflow step key (e.g. "BM_QC")
 * @param branchId Optional branch scope (only notify staff in this branch)
 * @param payload  Loan context used to build the notification body
 */
export async function notifyNextGateStaff(
  step: string,
  branchId: string | null | undefined,
  payload: {
    loanId: string;
    applicationRef: string;
    customerName?: string;
    amount?: number;
  }
): Promise<void> {
  try {
    const roles = STEP_TO_ROLE[step];
    if (!roles || roles.length === 0) return;

    const where: any = { role: { in: roles }, status: 1 };
    if (branchId) where.branchId = branchId;

    const staff = await db.admin.findMany({
      where,
      select: { id: true },
    });

    if (staff.length === 0) {
      // Fallback: try without branch filter (bank-wide)
      const fallback = await db.admin.findMany({
        where: { role: { in: roles }, status: 1 },
        select: { id: true },
      });
      if (fallback.length === 0) return;
      await Promise.all(
        fallback.map((s) =>
          createNotification({
            adminId: s.id,
            type: 'loan_submitted',
            title: `New loan ${payload.applicationRef} awaiting your review`,
            message: payload.customerName
              ? `Loan application ${payload.applicationRef} from ${payload.customerName}${
                  payload.amount ? ` — ₦${Number(payload.amount).toLocaleString()}` : ''
                } is now at the ${step.replace(/_/g, ' ')} gate.`
              : `Loan application ${payload.applicationRef} is now at the ${step.replace(
                  /_/g,
                  ' '
                )} gate.`,
            category: 'loan',
            actionLabel: 'Review Loan',
            actionView: 'loan-detail',
            actionParams: { loanId: payload.loanId },
            metadata: { step, applicationRef: payload.applicationRef },
          })
        )
      );
      return;
    }

    await Promise.all(
      staff.map((s) =>
        createNotification({
          adminId: s.id,
          type: 'loan_submitted',
          title: `New loan ${payload.applicationRef} awaiting your review`,
          message: payload.customerName
            ? `Loan application ${payload.applicationRef} from ${payload.customerName}${
                payload.amount ? ` — ₦${Number(payload.amount).toLocaleString()}` : ''
              } is now at the ${step.replace(/_/g, ' ')} gate.`
            : `Loan application ${payload.applicationRef} is now at the ${step.replace(
                /_/g,
                ' '
              )} gate.`,
          category: 'loan',
          actionLabel: 'Review Loan',
          actionView: 'loan-detail',
          actionParams: { loanId: payload.loanId },
          metadata: { step, applicationRef: payload.applicationRef },
        })
      )
    );
  } catch (e) {
    console.warn('[notifications] notifyNextGateStaff failed (non-fatal):', (e as Error)?.message);
  }
}

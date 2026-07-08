import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // A1 FIX: Require authentication
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const appraisal = await db.creditAppraisal.findUnique({
      where: { loanApplicantId: id },
      include: {
        loan: {
          include: {
            user: { include: { business: true } },
            plan: true,
            branch: true,
            loanOfficer: true,
          },
        },
        analyst: true,
      },
    });

    if (!appraisal) {
      return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
    }

    const safe: any = { ...appraisal };
    if (safe.loan?.user) safe.loan.user.password = undefined;
    if (safe.loan?.loanOfficer) safe.loan.loanOfficer.password = undefined;
    if (safe.analyst) safe.analyst.password = undefined;

    return NextResponse.json({ appraisal: safe });
  } catch (e: any) {
    console.error('Appraisal GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // A1 FIX: Require authentication
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    // A1/D3 FIX: Use adminId from JWT token (not from request body)
    const authenticatedAdminId = authPayload.id;

    const existing = await db.creditAppraisal.findUnique({
      where: { loanApplicantId: id },
      include: { loan: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
    }

    // ── L3: Locked snapshot protection ──
    // Only super-admin or MD can override a locked snapshot, and only with a documented reason.
    if (existing.isSnapshotLocked) {
      const adminId = authenticatedAdminId;
      const admin = await db.admin.findUnique({ where: { id: adminId } });
      const canOverride = admin && (admin.role === 'super' || admin.role === 'md');

      if (!body.adminOverride) {
        return NextResponse.json(
          { error: 'Snapshot is locked — cannot edit a frozen appraisal. Override requires super-admin or MD approval.' },
          { status: 403 }
        );
      }

      if (!canOverride) {
        return NextResponse.json(
          { error: 'Snapshot override denied — only super-admin or MD can unlock a frozen appraisal.' },
          { status: 403 }
        );
      }

      if (!body.overrideReason || String(body.overrideReason).trim().length < 10) {
        return NextResponse.json(
          { error: 'Override reason is required (minimum 10 characters) for audit trail.' },
          { status: 400 }
        );
      }

      // M1: Audit-log the override
      await db.auditLog.create({
        data: {
          adminId: admin!.id,
          action: 'updated',
          module: 'appraisal',
          description: `LOCKED SNAPSHOT OVERRIDE on loan ${existing.loan?.applicationRef || id}. Reason: ${body.overrideReason}`,
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
          severity: 'critical',
          metadata: JSON.stringify({
            loanId: id,
            overrideReason: body.overrideReason,
            fieldsChanged: Object.keys(body).filter(k => !k.startsWith('_') && k !== 'adminOverride' && k !== 'overrideReason' && k !== 'adminId'),
          }),
        },
      });
    }

    const updateData: any = {};
    const allowed = [
      'salesClientEstimate', 'salesSpotCheck', 'salesBookRecord', 'salesBankStatement', 'salesRecords',
      'consideredMonthlySales', 'selectedSalesSource',
      'purchasesClientEstimate', 'purchasesBankDebit', 'purchasesInvoices',
      'consideredMonthlyPurchases',
      'totalStockValue', 'weightedMargin', 'stockTurnoverDays',
      'monthlyGrossProfit', 'monthlyBusinessExpenses', 'monthlyFamilyExpenses',
      'irregularFamilyExpenses', 'otherLoanRepayments', 'monthlyNetSurplus',
      'adjustedNetCashflow', 'salesOnCreditPercent',
      'businessAssetValue', 'familyAssetValue',
      'verifiedMonthlySales', 'verifiedMonthlyCogs', 'verifiedMonthlyNetProfit',
      'dsrRatio', 'dscrRatio', 'riskScore', 'riskGrade', 'engineVerdict',
      'salesVariancePercent', 'hasHighVariance', 'engineDump',
      'creditBureauHistory', 'lastPurchaseDate', 'evaluationDate',
      'cashSalesPerDay', 'estimatedTreasury', 'treasuryVerdict',
      'scoreFinancial', 'scoreBusiness', 'scoreIndustry', 'scoreCollateral', 'totalScore',
      'loanPurpose', 'loanCycle', 'businessStartDate', 'bankName', 'accountNumber',
      'applicantAge', 'yearsAtAddress', 'yearsInOperation', 'managementExperience',
      'successionPlanVerified', 'bankAccountVerified', 'previousDefault',
      'competitionIntensity', 'marketRiskCommentary',
      'unforeseenBufferRate',
      'bmRecommendedAmount', 'bmRecommendedTenor', 'bmComment',
      'hocRecommendedAmount', 'hocRecommendedTenor', 'hocMoratorium', 'hocRepaymentCycle', 'hocComment',
      'croComment', 'cfoApprovedAmount', 'cfoApprovedTenor', 'cfoComment',
      'finalApprovedAmount', 'finalApprovedTenor', 'finalInterestRate',
      'loSnapshot', 'bmSnapshot', 'analystSnapshot', 'hocSnapshot', 'croSnapshot',
      'cfoSnapshot', 'legalSnapshot', 'mdSnapshot', 'governanceAudits', 'engineSnapshot',
      'inventorySnapshot', 'assetsRegister', 'balanceSheet', 'marginAnalysis',
      'gpsData', 'commentTrail', 'bmFieldVisit', 'bmRiskFlags', 'bmChecklist',
      'status', 'isSnapshotLocked', 'submittedAt', 'approvedAt',
      'appraisalGpsLat', 'appraisalGpsLong',
      // G6, G9, G10, G11: Excel parity JSON registers
      'collateralRegister', 'guarantorRegister', 'guarantorBizVerification', 'bankBalancesRegister',
    ];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        // Serialize objects/arrays to JSON strings for SQLite TEXT columns
        const val = body[k];
        if (typeof val === 'object' && val !== null) {
          updateData[k] = JSON.stringify(val);
        } else {
          updateData[k] = val;
        }
      }
    }

    // M1: Audit-log all CAM edits (non-locked appraisals)
    if (!existing.isSnapshotLocked && Object.keys(updateData).length > 0) {
      const adminId = authenticatedAdminId;
      if (adminId) {
        const admin = await db.admin.findUnique({ where: { id: adminId } });
        if (admin) {
          await db.auditLog.create({
            data: {
              adminId: admin.id,
              action: 'updated',
              module: 'appraisal',
              description: `CAM edited on loan ${existing.loan?.applicationRef || id} by ${admin.firstName} ${admin.lastName} (${admin.role})`,
              ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
              severity: 'info',
              metadata: JSON.stringify({
                loanId: id,
                fieldsChanged: Object.keys(updateData),
              }),
            },
          });
        }
      }
    }

    const updated = await db.creditAppraisal.update({
      where: { loanApplicantId: id },
      data: updateData,
    });

    return NextResponse.json({ appraisal: updated });
  } catch (e: any) {
    console.error('Appraisal PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

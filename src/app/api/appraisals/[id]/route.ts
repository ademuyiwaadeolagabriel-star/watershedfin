import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { STEP_PERMISSIONS, hasPermission, ROLE_TO_MCC } from '@/lib/constants';
import { executeFullAppraisal, type EngineInput } from '@/lib/credit-engine';

// ============================================================================
// GET /api/appraisals/[id]
// v47: Added read-access control — only roles in the approval chain can view
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
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

    // v47: Read-access control — restrict to roles in the approval chain
    const admin = await db.admin.findUnique({ where: { id: authPayload.id } });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    // Super admin can view everything
    if (admin.role !== 'super') {
      const allowedViewRoles = ['loan', 'bm', 'analyst', 'hoc', 'cro', 'cfo', 'legal', 'md', 'admin', 'cs'];
      if (!allowedViewRoles.includes(admin.role)) {
        return NextResponse.json({ error: 'You do not have permission to view CAM data' }, { status: 403 });
      }
      // Branch scoping: branch-scoped roles can only view CAMs in their branch
      const branchScopedRoles = ['bm', 'loan', 'frontdesk', 'treasury'];
      if (branchScopedRoles.includes(admin.role) && admin.branchId && appraisal.loan?.branchId && admin.branchId !== appraisal.loan.branchId) {
        return NextResponse.json({ error: 'Access denied — this loan belongs to a different branch.' }, { status: 403 });
      }
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

// ============================================================================
// PUT /api/appraisals/[id]
// v47: Comprehensive rewrite with:
//   1. Role + assignment + branch authorization
//   2. Per-field role scoping (LO can only write LO fields, BM only BM fields, etc.)
//   3. Per-snapshot role enforcement (LO can't write mdSnapshot)
//   4. Snapshot cascade fix (downstream roles can write their own snapshot field)
//   5. camFormData JSON column for ALL structured fields
//   6. Field-level before/after audit
// ============================================================================

// v47: Per-role field scoping — each role can only write their lane of fields
const ROLE_FIELD_SCOPES: Record<string, { fields: string[]; snapshots: string[] }> = {
  super: {
    fields: ['*'], // super can write everything
    snapshots: ['*'],
  },
  loan: {
    // LO can write all financial analysis fields + LO-specific fields
    fields: [
      'salesClientEstimate', 'salesSpotCheck', 'salesBookRecord', 'salesBankStatement', 'salesRecords',
      'consideredMonthlySales', 'selectedSalesSource',
      'purchasesClientEstimate', 'purchasesBankDebit', 'purchasesInvoices',
      'consideredMonthlyPurchases',
      'totalStockValue', 'stockTurnoverDays',
      'monthlyGrossProfit', 'monthlyBusinessExpenses', 'monthlyFamilyExpenses',
      'irregularFamilyExpenses', 'otherLoanRepayments', 'monthlyNetSurplus',
      'adjustedNetCashflow', 'salesOnCreditPercent',
      'businessAssetValue', 'familyAssetValue',
      // v53 — P3 #33/#34 fix: engine-result fields (verifiedMonthlySales,
      // verifiedMonthlyCogs, verifiedMonthlyNetProfit, dsrRatio, dscrRatio,
      // riskScore, riskGrade, engineVerdict, salesVariancePercent,
      // hasHighVariance, engineDump, weightedMargin) are NO LONGER
      // client-writable. The server recomputes them via
      // executeFullAppraisal() from the raw inputs above. The browser
      // calculation is UI assistance only — never the authority.
      'creditBureauHistory', 'lastPurchaseDate', 'evaluationDate',
      'cashSalesPerDay', 'estimatedTreasury', 'treasuryVerdict',
      'scoreFinancial', 'scoreBusiness', 'scoreIndustry', 'scoreCollateral', 'totalScore',
      'loanPurpose', 'loanCycle', 'businessStartDate', 'bankName', 'accountNumber',
      'applicantAge', 'yearsAtAddress', 'yearsInOperation', 'managementExperience',
      'successionPlanVerified', 'bankAccountVerified', 'previousDefault',
      'competitionIntensity', 'marketRiskCommentary',
      'unforeseenBufferRate',
      'loanPrincipal', 'loanInterestRate', 'loanTenorMonths', 'ccdPercent', 'upfrontFeePercent',
      'repaymentMethod',
      'inventorySnapshot', 'assetsRegister', 'balanceSheet', 'marginAnalysis',
      'gpsData', 'commentTrail', 'bmFieldVisit',
      'collateralRegister', 'guarantorRegister', 'guarantorBizVerification', 'bankBalancesRegister',
      'appraisalGpsLat', 'appraisalGpsLong',
      'camFormData', // v47: single JSON blob for ALL structured fields
      'engineSnapshot',
      'status', 'isSnapshotLocked', 'submittedAt',
    ],
    snapshots: ['loSnapshot'],
  },
  bm: {
    // BM can only write BM-specific fields + their snapshot
    fields: [
      'bmRecommendedAmount', 'bmRecommendedTenor', 'bmComment',
      'bmFieldVisit', 'bmRiskFlags', 'bmChecklist',
    ],
    snapshots: ['bmSnapshot'],
  },
  analyst: {
    fields: [
      'appraisedAmount', 'appraisedTenor', 'structuredAmount', 'structuredTenor',
      'analystReviewedAt',
    ],
    snapshots: ['analystSnapshot'],
  },
  hoc: {
    // HOC can adjust loan terms + HOC-specific fields + camFormData
    fields: [
      'hocRecommendedAmount', 'hocRecommendedTenor', 'hocMoratorium', 'hocRepaymentCycle', 'hocComment',
      'hocStructuredAt',
      'loanPrincipal', 'loanInterestRate', 'loanTenorMonths', 'ccdPercent', 'upfrontFeePercent',
      'repaymentMethod',
      'camFormData', // v47: HOC can save draft too
    ],
    snapshots: ['hocSnapshot'],
  },
  cro: {
    fields: [
      'croComment', 'riskApprovedAmount', 'riskApprovedAt', 'croCheckedAt',
      'riskScore', 'riskGrade',
    ],
    snapshots: ['croSnapshot'],
  },
  cfo: {
    fields: [
      'cfoApprovedAmount', 'cfoApprovedTenor', 'cfoComment', 'cfoClearedAt',
    ],
    snapshots: ['cfoSnapshot'],
  },
  legal: {
    fields: [
      'legalClearedAt', 'finalOfferGeneratedAt',
    ],
    snapshots: ['legalSnapshot'],
  },
  md: {
    fields: [
      'finalApprovedAmount', 'finalApprovedTenor', 'finalInterestRate',
      'mdApprovedAt', 'offerLetterGeneratedAt', 'approvedAt',
    ],
    snapshots: ['mdSnapshot'],
  },
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const authenticatedAdminId = authPayload.id;

    const existing = await db.creditAppraisal.findUnique({
      where: { loanApplicantId: id },
      include: { loan: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Appraisal not found' }, { status: 404 });
    }

    const admin = await db.admin.findUnique({ where: { id: authenticatedAdminId } });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const currentStep = existing.loan?.currentStep || '';
    const isLocked = existing.isSnapshotLocked;

    // ── v47: SNAPSHOT CASCADE FIX ────────────────────────────────────────
    // Downstream roles (BM, HOC, CRO, CFO, Legal, MD) can write their OWN
    // snapshot field even when isSnapshotLocked=true (because LO locked their
    // snapshot, not the downstream's). Only LO live-column writes are blocked.
    const snapshotFieldMap: Record<string, string> = {
      loan: 'loSnapshot', bm: 'bmSnapshot', analyst: 'analystSnapshot',
      hoc: 'hocSnapshot', cro: 'croSnapshot', cfo: 'cfoSnapshot',
      legal: 'legalSnapshot', md: 'mdSnapshot',
    };
    const adminSnapshotField = snapshotFieldMap[admin.role];
    const isSnapshotWrite = adminSnapshotField && body[adminSnapshotField] !== undefined;

    // If this is a snapshot write by a downstream role, allow it (skip the lock check)
    if (isLocked && !isSnapshotWrite) {
      // Only super/MD can override a locked snapshot for live-column edits
      const canOverride = admin.role === 'super' || admin.role === 'md';
      if (!body.adminOverride) {
        return NextResponse.json(
          { error: 'Snapshot is locked — cannot edit LO data. Override requires super-admin or MD approval.' },
          { status: 403 }
        );
      }
      if (!canOverride) {
        return NextResponse.json(
          { error: 'Snapshot override denied — only super-admin or MD can unlock.' },
          { status: 403 }
        );
      }
      if (!body.overrideReason || String(body.overrideReason).trim().length < 10) {
        return NextResponse.json(
          { error: 'Override reason is required (minimum 10 characters) for audit trail.' },
          { status: 400 }
        );
      }
    }

    // ── v47: PER-FIELD ROLE SCOPING ─────────────────────────────────────
    // Each role can only write fields in their lane
    const scope = ROLE_FIELD_SCOPES[admin.role];
    if (!scope) {
      return NextResponse.json({ error: `Role ${admin.role} cannot edit CAM data` }, { status: 403 });
    }

    // v47: Branch scoping for branch-scoped roles
    const branchScopedRoles = ['bm', 'loan', 'frontdesk', 'treasury'];
    if (branchScopedRoles.includes(admin.role) && admin.branchId && existing.loan?.branchId && admin.branchId !== existing.loan.branchId) {
      return NextResponse.json(
        { error: 'Access denied — this loan belongs to a different branch.' },
        { status: 403 }
      );
    }

    // v47: LO assignment check — only the assigned LO can write LO fields
    if (admin.role === 'loan' && existing.loan?.staffId && existing.loan.staffId !== admin.id) {
      return NextResponse.json(
        { error: 'You are not the assigned Loan Officer for this loan.' },
        { status: 403 }
      );
    }

    // Build update data with field scoping
    const updateData: any = {};
    const fieldsChanged: { field: string; before: any; after: any }[] = [];

    for (const [key, val] of Object.entries(body)) {
      if (key.startsWith('_') || key === 'adminOverride' || key === 'overrideReason' || key === 'adminId') continue;

      // Check if this field is in the role's allowed list
      const isAllowed = scope.fields.includes('*') || scope.fields.includes(key);
      const isAllowedSnapshot = scope.snapshots.includes('*') || scope.snapshots.includes(key);

      if (!isAllowed && !isAllowedSnapshot) {
        // Field is outside this role's lane — skip it silently (don't error, just ignore)
        continue;
      }

      // Serialize objects/arrays to JSON strings
      const serialized = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
      updateData[key] = serialized;

      // Track before/after for audit
      const beforeValue = (existing as any)[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(serialized)) {
        fieldsChanged.push({ field: key, before: beforeValue, after: serialized });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update (all fields outside your role scope)' }, { status: 400 });
    }

    // ── v47: FIELD-LEVEL BEFORE/AFTER AUDIT ─────────────────────────────
    await db.auditLog.create({
      data: {
        adminId: admin.id,
        action: isSnapshotWrite ? 'snapshot_created' : 'updated',
        module: 'appraisal',
        description: `${isSnapshotWrite ? `${admin.role.toUpperCase()} snapshot` : 'CAM edit'} on loan ${existing.loan?.applicationRef || id} by ${admin.firstName} ${admin.lastName} (${admin.role})${body.overrideReason ? ` — Override: ${body.overrideReason}` : ''}`,
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        severity: isLocked ? 'critical' : 'info',
        metadata: JSON.stringify({
          loanId: id,
          currentStep,
          role: admin.role,
          fieldsChanged: fieldsChanged.map(f => ({ field: f.field, before: f.before, after: f.after })),
          overrideReason: body.overrideReason || null,
        }),
      },
    });

    // ── v53 — P3 #33/#34: SERVER-AUTHORITATIVE CAM RECOMPUTATION ──────
    // When the LO submits raw CAM inputs (sales, inventory, expenses, loan
    // terms, sector benchmark, balance sheet, collaterals, guarantor),
    // the server recomputes the engine result via executeFullAppraisal()
    // and stores the SERVER-computed values for verifiedMonthlySales,
    // verifiedMonthlyCogs, verifiedMonthlyNetProfit, dsrRatio, dscrRatio,
    // riskScore, riskGrade, engineVerdict, weightedMargin, salesVariancePercent,
    // hasHighVariance, and engineDump.
    //
    // Frontend-supplied values for these fields (if any) are silently
    // discarded — they were already excluded from `updateData` by the
    // role-scope filter above.
    if (admin.role === 'loan' || admin.role === 'super') {
      try {
        // Reconstruct EngineInput from the union of (a) the existing
        // appraisal row, (b) the body's raw inputs that the LO just
        // submitted. We use a defensive merge: body values override
        // existing values when present.
        const merged: any = { ...(existing as any), ...body };
        // Deserialize JSON-string columns
        for (const jsonField of ['inventorySnapshot', 'balanceSheet', 'collateralRegister', 'guarantorRegister', 'riskInputs', 'camFormData']) {
          if (typeof merged[jsonField] === 'string' && merged[jsonField]) {
            try { merged[jsonField] = JSON.parse(merged[jsonField]); } catch {}
          }
        }
        const camFormData = merged.camFormData || {};
        const inventoryItems = merged.inventorySnapshot || camFormData.inventory || [];
        const balanceSheet = merged.balanceSheet || camFormData.balanceSheet || {};
        const collaterals = merged.collateralRegister || camFormData.collaterals || [];
        const guarantor = merged.guarantorRegister || camFormData.guarantor || {};
        const riskInputs = merged.riskInputs || camFormData.riskInputs || { sectorRiskScore: 0.5, previousDefault: false };

        // Build engine input
        const engineInput: EngineInput = {
          sales: {
            clientEstimate: Number(merged.salesClientEstimate ?? camFormData.salesClientEstimate ?? 0),
            spotCheck: Number(merged.salesSpotCheck ?? camFormData.salesSpotCheck ?? 0),
            bankStatement: Number(merged.salesBankStatement ?? camFormData.salesBankStatement ?? 0),
            bookRecords: Number(merged.salesBookRecord ?? camFormData.salesBookRecord ?? 0),
          },
          inventory: Array.isArray(inventoryItems) ? inventoryItems.map((it: any) => ({
            description: it.description || '',
            qty: Number(it.qty || 0),
            cost: Number(it.cost || 0),
            sell: Number(it.sell || 0),
          })) : [],
          sectorBenchmarkMargin: Number(merged.sectorBenchmarkMargin ?? 0),
          loan: {
            principal: Number(merged.loanPrincipal ?? camFormData.loanPrincipal ?? 0),
            annualInterestRate: Number(merged.loanInterestRate ?? camFormData.loanInterestRate ?? 0),
            tenorMonths: Number(merged.loanTenorMonths ?? camFormData.loanTenorMonths ?? 0),
            repaymentMethod: (merged.repaymentMethod ?? camFormData.repaymentMethod ?? 'REDUCING') === 'FLAT' ? 'FLAT' : 'REDUCING',
            upfrontFeePercent: Number(merged.upfrontFeePercent ?? camFormData.upfrontFeePercent ?? 0),
            ccdPercent: Number(merged.ccdPercent ?? camFormData.ccdPercent ?? 0),
          },
          expenses: {
            businessRegular: Number(merged.monthlyBusinessExpenses ?? camFormData.monthlyBusinessExpenses ?? 0),
            businessIrregular: Number(merged.businessIrregularExpenses ?? camFormData.businessIrregularExpenses ?? 0),
            familyRegular: Number(merged.monthlyFamilyExpenses ?? camFormData.monthlyFamilyExpenses ?? 0),
            familyIrregular: Number(merged.familyIrregularExpenses ?? camFormData.familyIrregularExpenses ?? 0),
            otherLoanInstallments: Number(merged.otherLoanRepayments ?? camFormData.otherLoanRepayments ?? 0),
          },
          bufferRate: Number(merged.bufferRate ?? camFormData.bufferRate ?? 0),
          openingCash: Number(merged.openingCash ?? camFormData.openingCash ?? 0),
          balanceSheet: {
            cashAtHand: Number(balanceSheet.cashAtHand ?? 0),
            cashInBanks: Number(balanceSheet.cashInBanks ?? 0),
            receivables: Number(balanceSheet.receivables ?? 0),
            stockValue: Number(balanceSheet.stockValue ?? merged.totalStockValue ?? 0),
            fixedBusinessAssets: Number(balanceSheet.fixedBusinessAssets ?? 0),
            fixedFamilyAssets: Number(balanceSheet.fixedFamilyAssets ?? 0),
            shortTermLiabilities: Number(balanceSheet.shortTermLiabilities ?? 0),
            longTermLiabilities: Number(balanceSheet.longTermLiabilities ?? 0),
            payables: Number(balanceSheet.payables ?? 0),
          },
          riskInputs: {
            sectorRiskScore: Number(riskInputs.sectorRiskScore ?? 0.5),
            previousDefault: !!(riskInputs.previousDefault ?? merged.previousDefault ?? false),
            successionPlanVerified: !!(merged.successionPlanVerified ?? false),
            bankAccountVerified: !!(merged.bankAccountVerified ?? false),
          },
          loanBaseAmount: Number(merged.loanPrincipal ?? camFormData.loanPrincipal ?? 0),
          collaterals: Array.isArray(collaterals) ? collaterals.map((c: any) => ({
            type: c.type || 'MOVABLE',
            marketValue: Number(c.marketValue || 0),
          })) : [],
          guarantor: {
            income: Number(guarantor.monthlyIncome ?? guarantor.income ?? 0),
            cogs: Number(guarantor.cogs ?? 0),
            operationExpenses: Number(guarantor.operationExpenses ?? guarantor.monthlyLivingExpenses ?? 0),
            existingInstallment: Number(guarantor.existingInstallments ?? guarantor.existingInstallment ?? 0),
          },
          stress: {
            salesHaircut: 10,
            marginCompression: 5,
            opexIncrease: 10,
          },
        };

        const engineResult = executeFullAppraisal(engineInput);

        // Stamp the SERVER-computed engine result back into updateData.
        // These are the AUTHORITATIVE values — the audit trail reflects
        // that they came from server recomputation, not client claim.
        updateData.verifiedMonthlySales = engineResult.forensics.consideredSales;
        updateData.verifiedMonthlyCogs = engineResult.purchases.finalPurchases;
        updateData.verifiedMonthlyNetProfit = engineResult.pnl.netProfit;
        updateData.weightedMargin = engineResult.marginSummary.marginUsed;
        updateData.dsrRatio = engineResult.ratios.dsr;
        updateData.dscrRatio = engineResult.ratios.dscr;
        updateData.riskScore = engineResult.finalScore;
        updateData.riskGrade = engineResult.riskGrade.grade;
        updateData.engineVerdict = engineResult.engineVerdict;
        updateData.salesVariancePercent = engineResult.forensics.variancePercent;
        updateData.hasHighVariance = engineResult.forensics.variancePercent > 25;
        updateData.engineDump = JSON.stringify({
          policyVersion: engineResult.policyVersion,
          marginSummary: engineResult.marginSummary,
          forensics: engineResult.forensics,
          purchases: engineResult.purchases,
          pnl: engineResult.pnl,
          ratios: engineResult.ratios,
          pmt: engineResult.pmt,
          isSolvent: engineResult.isSolvent,
          stress: engineResult.stress,
          collateralCoverage: engineResult.collateralCoverage,
          guarantorDSR: engineResult.guarantorDSR,
          bankYield: engineResult.bankYield,
          riskGrade: engineResult.riskGrade,
          redFlags: engineResult.redFlags,
          finalScore: engineResult.finalScore,
          engineVerdict: engineResult.engineVerdict,
          authSource: 'server_recomputed',
          recomputedAt: new Date().toISOString(),
        });
      } catch (recomputeErr: any) {
        // If recomputation fails (e.g. malformed inputs), log the error
        // but do NOT block the CAM save — the LO can fix and resubmit.
        // The engine-result fields simply won't be updated this round.
        console.error('[v53 appraisal] engine recompute failed:', recomputeErr?.message);
      }
    }

    const updated = await db.creditAppraisal.update({
      where: { loanApplicantId: id },
      data: updateData,
    });

    return NextResponse.json({ appraisal: updated });
  } catch (e: any) {
    console.error('Appraisal PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

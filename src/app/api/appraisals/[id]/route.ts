import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { FORMULA_LIMITS } from '@/lib/constants';
import {
  executeFullAppraisal,
  type EngineInput,
} from '@/lib/credit-engine';

// ============================================================================
// GET /api/appraisals/[id]
// v47: Added read-access control — only roles in the approval chain can view
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authPayload =
      await getAuthFromRequest(req);

    if (!authPayload) {
      return NextResponse.json(
        {
          error:
            'Authentication required.',
        },
        {
          status: 401,
        },
      );
    }

    const { id } = await params;

    const appraisal =
      await db.creditAppraisal.findUnique({
        where: {
          loanApplicantId: id,
        },
        include: {
          loan: {
            include: {
              user: {
                include: {
                  business: true,
                },
              },
              plan: true,
              branch: true,
              loanOfficer: true,
            },
          },
          analyst: true,
        },
      });

    if (!appraisal) {
      return NextResponse.json(
        {
          error: 'Appraisal not found',
        },
        {
          status: 404,
        },
      );
    }

    // v47: Read-access control — restrict to roles in the approval chain.
    const admin =
      await db.admin.findUnique({
        where: {
          id: authPayload.id,
        },
      });

    if (!admin) {
      return NextResponse.json(
        {
          error: 'Admin not found',
        },
        {
          status: 404,
        },
      );
    }

    // Super admin can view everything.
    if (admin.role !== 'super') {
      const allowedViewRoles = [
        'loan',
        'bm',
        'analyst',
        'hoc',
        'cro',
        'cfo',
        'legal',
        'md',
        'admin',
        'cs',
      ];

      if (
        !allowedViewRoles.includes(
          admin.role,
        )
      ) {
        return NextResponse.json(
          {
            error:
              'You do not have permission to view CAM data',
          },
          {
            status: 403,
          },
        );
      }

      // Branch scoping: branch-scoped roles can only view CAMs in their branch.
      const branchScopedRoles = [
        'bm',
        'loan',
        'frontdesk',
        'treasury',
      ];

      if (
        branchScopedRoles.includes(
          admin.role,
        ) &&
        admin.branchId &&
        appraisal.loan?.branchId &&
        admin.branchId !==
          appraisal.loan.branchId
      ) {
        return NextResponse.json(
          {
            error:
              'Access denied — this loan belongs to a different branch.',
          },
          {
            status: 403,
          },
        );
      }
    }

    // Remove sensitive credentials before returning appraisal data.
    const safe: any = {
      ...appraisal,
    };

    if (safe.loan?.user) {
      safe.loan.user.password =
        undefined;
    }

    if (safe.loan?.loanOfficer) {
      safe.loan.loanOfficer.password =
        undefined;
    }

    if (safe.analyst) {
      safe.analyst.password =
        undefined;
    }

    return NextResponse.json({
      appraisal: safe,
    });
  } catch (e: any) {
    console.error(
      'Appraisal GET error:',
      e,
    );

    return NextResponse.json(
      {
        error: e.message,
      },
      {
        status: 500,
      },
    );
  }
}

// ============================================================================
// PUT /api/appraisals/[id]
// v47: Comprehensive rewrite with:
//   1. Role + assignment + branch authorization
//   2. Per-field role scoping
//   3. Per-snapshot role enforcement
//   4. Snapshot cascade fix
//   5. camFormData JSON column for structured fields
//   6. Field-level before/after audit
//   7. v53 server-authoritative CAM recomputation
// ============================================================================

// v47: Per-role field scoping — each role can only write its lane of fields.
const ROLE_FIELD_SCOPES: Record<
  string,
  {
    fields: string[];
    snapshots: string[];
  }
> = {
  super: {
    fields: ['*'],
    snapshots: ['*'],
  },

  loan: {
    fields: [
      'salesClientEstimate',
      'salesSpotCheck',
      'salesBookRecord',
      'salesBankStatement',
      'salesRecords',
      'consideredMonthlySales',
      'selectedSalesSource',

      'purchasesClientEstimate',
      'purchasesBankDebit',
      'purchasesInvoices',
      'consideredMonthlyPurchases',

      'totalStockValue',
      'stockTurnoverDays',

      'monthlyGrossProfit',
      'monthlyBusinessExpenses',
      'monthlyFamilyExpenses',
      'irregularFamilyExpenses',
      'otherLoanRepayments',
      'monthlyNetSurplus',
      'adjustedNetCashflow',
      'salesOnCreditPercent',

      'businessAssetValue',
      'familyAssetValue',

      'creditBureauHistory',
      'lastPurchaseDate',
      'evaluationDate',
      'cashSalesPerDay',
      'estimatedTreasury',
      'treasuryVerdict',

      'scoreFinancial',
      'scoreBusiness',
      'scoreIndustry',
      'scoreCollateral',
      'totalScore',

      'loanPurpose',
      'loanCycle',
      'businessStartDate',
      'bankName',
      'accountNumber',

      'applicantAge',
      'yearsAtAddress',
      'yearsInOperation',
      'managementExperience',
      'successionPlanVerified',
      'bankAccountVerified',
      'previousDefault',

      'competitionIntensity',
      'marketRiskCommentary',
      'unforeseenBufferRate',

      'loanPrincipal',
      'loanInterestRate',
      'loanTenorMonths',
      'ccdPercent',
      'upfrontFeePercent',
      'repaymentMethod',

      'inventorySnapshot',
      'assetsRegister',
      'balanceSheet',
      'marginAnalysis',

      'gpsData',
      'commentTrail',
      'bmFieldVisit',

      'collateralRegister',
      'guarantorRegister',
      'guarantorBizVerification',
      'bankBalancesRegister',

      'appraisalGpsLat',
      'appraisalGpsLong',

      'camFormData',
      'engineSnapshot',

      'status',
      'isSnapshotLocked',
      'submittedAt',
    ],
    snapshots: ['loSnapshot'],
  },

  bm: {
    fields: [
      'bmRecommendedAmount',
      'bmRecommendedTenor',
      'bmComment',
      'bmFieldVisit',
      'bmRiskFlags',
      'bmChecklist',
    ],
    snapshots: ['bmSnapshot'],
  },

  analyst: {
    fields: [
      'appraisedAmount',
      'appraisedTenor',
      'structuredAmount',
      'structuredTenor',
      'analystReviewedAt',
    ],
    snapshots: ['analystSnapshot'],
  },

  hoc: {
    fields: [
      'hocRecommendedAmount',
      'hocRecommendedTenor',
      'hocMoratorium',
      'hocRepaymentCycle',
      'hocComment',
      'hocStructuredAt',

      'loanPrincipal',
      'loanInterestRate',
      'loanTenorMonths',
      'ccdPercent',
      'upfrontFeePercent',
      'repaymentMethod',

      'camFormData',
    ],
    snapshots: ['hocSnapshot'],
  },

  cro: {
    fields: [
      'croComment',
      'riskApprovedAmount',
      'riskApprovedAt',
      'croCheckedAt',
      'riskScore',
      'riskGrade',
    ],
    snapshots: ['croSnapshot'],
  },

  cfo: {
    fields: [
      'cfoApprovedAmount',
      'cfoApprovedTenor',
      'cfoComment',
      'cfoClearedAt',
    ],
    snapshots: ['cfoSnapshot'],
  },

  legal: {
    fields: [
      'legalClearedAt',
      'finalOfferGeneratedAt',
    ],
    snapshots: ['legalSnapshot'],
  },

  md: {
    fields: [
      'finalApprovedAmount',
      'finalApprovedTenor',
      'finalInterestRate',
      'mdApprovedAt',
      'offerLetterGeneratedAt',
      'approvedAt',
    ],
    snapshots: ['mdSnapshot'],
  },
};

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authPayload =
      await getAuthFromRequest(req);

    if (!authPayload) {
      return NextResponse.json(
        {
          error:
            'Authentication required.',
        },
        {
          status: 401,
        },
      );
    }

    const { id } = await params;
    const body = await req.json();

    // IMPORTANT:
    // Authenticated administrator identity is derived from the JWT.
    const authenticatedAdminId =
      authPayload.id;

    const existing =
      await db.creditAppraisal.findUnique({
        where: {
          loanApplicantId: id,
        },
        include: {
          loan: {
            include: {
              user: {
                select: {
                  business: {
                    select: {
                      sectorId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error: 'Appraisal not found',
        },
        {
          status: 404,
        },
      );
    }

    const admin =
      await db.admin.findUnique({
        where: {
          id: authenticatedAdminId,
        },
      });

    if (!admin) {
      return NextResponse.json(
        {
          error: 'Admin not found',
        },
        {
          status: 404,
        },
      );
    }

    const currentStep =
      existing.loan?.currentStep || '';

    const isLocked =
      existing.isSnapshotLocked;

    // ========================================================================
    // v47: SNAPSHOT CASCADE FIX
    // ========================================================================
    const snapshotFieldMap: Record<
      string,
      string
    > = {
      loan: 'loSnapshot',
      bm: 'bmSnapshot',
      analyst: 'analystSnapshot',
      hoc: 'hocSnapshot',
      cro: 'croSnapshot',
      cfo: 'cfoSnapshot',
      legal: 'legalSnapshot',
      md: 'mdSnapshot',
    };

    const adminSnapshotField =
      snapshotFieldMap[admin.role];

    const isSnapshotWrite =
      Boolean(
        adminSnapshotField &&
          body[adminSnapshotField] !==
            undefined,
      );

    if (
      isLocked &&
      !isSnapshotWrite
    ) {
      const canOverride =
        admin.role === 'super' ||
        admin.role === 'md';

      if (!body.adminOverride) {
        return NextResponse.json(
          {
            error:
              'Snapshot is locked — cannot edit LO data. Override requires super-admin or MD approval.',
          },
          {
            status: 403,
          },
        );
      }

      if (!canOverride) {
        return NextResponse.json(
          {
            error:
              'Snapshot override denied — only super-admin or MD can unlock.',
          },
          {
            status: 403,
          },
        );
      }

      if (
        !body.overrideReason ||
        String(
          body.overrideReason,
        )
          .trim()
          .length < 10
      ) {
        return NextResponse.json(
          {
            error:
              'Override reason is required (minimum 10 characters) for audit trail.',
          },
          {
            status: 400,
          },
        );
      }
    }

    // ========================================================================
    // PER-FIELD ROLE SCOPING
    // ========================================================================

    const scope =
      ROLE_FIELD_SCOPES[admin.role];

    if (!scope) {
      return NextResponse.json(
        {
          error:
            `Role ${admin.role} cannot edit CAM data`,
        },
        {
          status: 403,
        },
      );
    }

    // ========================================================================
    // Branch scoping
    // ========================================================================

    const branchScopedRoles = [
      'bm',
      'loan',
      'frontdesk',
      'treasury',
    ];

    if (
      branchScopedRoles.includes(
        admin.role,
      ) &&
      admin.branchId &&
      existing.loan?.branchId &&
      admin.branchId !==
        existing.loan.branchId
    ) {
      return NextResponse.json(
        {
          error:
            'Access denied — this loan belongs to a different branch.',
        },
        {
          status: 403,
        },
      );
    }

    // ========================================================================
    // LO assignment check
    // ========================================================================

    if (
      admin.role === 'loan' &&
      existing.loan?.staffId &&
      existing.loan.staffId !==
        admin.id
    ) {
      return NextResponse.json(
        {
          error:
            'You are not the assigned Loan Officer for this loan.',
        },
        {
          status: 403,
        },
      );
    }

    // ========================================================================
    // Build field-scoped update
    // ========================================================================

    const updateData: any = {};

    const fieldsChanged: {
      field: string;
      before: any;
      after: any;
    }[] = [];

    for (const [key, val] of Object.entries(
      body,
    )) {
      if (
        key.startsWith('_') ||
        key === 'adminOverride' ||
        key === 'overrideReason' ||
        key === 'adminId'
      ) {
        continue;
      }

      const isAllowed =
        scope.fields.includes('*') ||
        scope.fields.includes(key);

      const isAllowedSnapshot =
        scope.snapshots.includes('*') ||
        scope.snapshots.includes(key);

      if (
        !isAllowed &&
        !isAllowedSnapshot
      ) {
        continue;
      }

      const serialized =
        typeof val === 'object' &&
        val !== null
          ? JSON.stringify(val)
          : val;

      updateData[key] = serialized;

      const beforeValue =
        (existing as any)[key];

      if (
        JSON.stringify(
          beforeValue,
        ) !==
        JSON.stringify(serialized)
      ) {
        fieldsChanged.push({
          field: key,
          before: beforeValue,
          after: serialized,
        });
      }
    }

    if (
      Object.keys(updateData)
        .length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'No fields to update (all fields outside your role scope)',
        },
        {
          status: 400,
        },
      );
    }

    // ========================================================================
    // FIELD-LEVEL BEFORE/AFTER AUDIT
    // ========================================================================

    await db.auditLog.create({
      data: {
        adminId: admin.id,

        action: isSnapshotWrite
          ? 'snapshot_created'
          : 'updated',

        module: 'appraisal',

        description:
          `${isSnapshotWrite ? `${admin.role.toUpperCase()} snapshot` : 'CAM edit'} on loan ${existing.loan?.applicationRef || id} by ${admin.firstName} ${admin.lastName} (${admin.role})${
            body.overrideReason
              ? ` — Override: ${body.overrideReason}`
              : ''
          }`,

        ipAddress:
          req.headers.get(
            'x-forwarded-for',
          ) || 'unknown',

        severity:
          isLocked
            ? 'critical'
            : 'info',

        metadata: JSON.stringify({
          loanId: id,
          currentStep,
          role: admin.role,

          fieldsChanged:
            fieldsChanged.map(
              (f) => ({
                field: f.field,
                before: f.before,
                after: f.after,
              }),
            ),

          overrideReason:
            body.overrideReason ||
            null,
        }),
      },
    });

    // ========================================================================
    // v53: SERVER-AUTHORITATIVE CAM RECOMPUTATION
    // ========================================================================
    //
    // IMPORTANT:
    // `merged` MUST be constructed BEFORE any access to merged.*.
    // The previous build failure occurred because requestedSectorId attempted
    // to use `merged` before its declaration.
    // ========================================================================

    if (
      admin.role === 'loan' ||
      admin.role === 'super'
    ) {
      try {
        // --------------------------------------------------------------------
        // FIX:
        // Build the merged appraisal state FIRST.
        // Body values override the persisted appraisal values.
        // --------------------------------------------------------------------
        const merged: any = {
          ...(existing as any),
          ...body,
        };

        // --------------------------------------------------------------------
        // Sector selection
        // --------------------------------------------------------------------
        //
        // The requested sector ID may come from the submitted CAM form, but
        // the benchmark margin and sector risk score are ALWAYS taken from the
        // authoritative database Sector record.
        // --------------------------------------------------------------------

        const requestedSectorId =
          typeof merged.selectedSectorId ===
          'string'
            ? merged.selectedSectorId
            : null;

        const authoritativeSectorId =
          requestedSectorId ||
          existing.sectorId ||
          existing.loan?.sectorId ||
          existing.loan?.user?.business
            ?.sectorId ||
          null;

        if (!authoritativeSectorId) {
          return NextResponse.json(
            {
              error:
                'Sector is required before server-authoritative CAM calculation.',
            },
            {
              status: 400,
            },
          );
        }

        const sector =
          await db.sector.findUnique({
            where: {
              id: authoritativeSectorId,
            },
            select: {
              id: true,
              benchmarkedMargin: true,
              riskScore: true,
            },
          });

        if (!sector) {
          return NextResponse.json(
            {
              error:
                'Loan sector not found.',
            },
            {
              status: 400,
            },
          );
        }

        // --------------------------------------------------------------------
        // Dynamic sector margin validation
        // --------------------------------------------------------------------
        //
        // Benchmark margin comes from Sector.benchmarkedMargin.
        // It is dynamically configurable by an authorized administrator.
        // Browser-supplied sectorBenchmarkMargin is NEVER authoritative.
        // --------------------------------------------------------------------

        if (
          sector.benchmarkedMargin ==
            null ||
          !Number.isFinite(
            Number(
              sector.benchmarkedMargin,
            ),
          ) ||
          Number(
            sector.benchmarkedMargin,
          ) < 0
        ) {
          return NextResponse.json(
            {
              error:
                'Sector benchmark margin is not configured. An admin must configure the sector margin before CAM calculation.',
            },
            {
              status: 400,
            },
          );
        }

        // --------------------------------------------------------------------
        // Deserialize JSON-backed fields
        // --------------------------------------------------------------------

        for (
          const jsonField of [
            'inventorySnapshot',
            'balanceSheet',
            'collateralRegister',
            'guarantorRegister',
            'riskInputs',
            'camFormData',
          ]
        ) {
          if (
            typeof merged[
              jsonField
            ] === 'string' &&
            merged[jsonField]
          ) {
            try {
              merged[jsonField] =
                JSON.parse(
                  merged[jsonField],
                );
            } catch {
              // Preserve original value if malformed.
            }
          }
        }

        const camFormData =
          merged.camFormData || {};

        const inventoryItems =
          merged.inventorySnapshot ||
          camFormData.inventory ||
          [];

        const balanceSheet =
          merged.balanceSheet ||
          camFormData.balanceSheet ||
          {};

        const collaterals =
          merged.collateralRegister ||
          camFormData.collaterals ||
          [];

        const guarantor =
          merged.guarantorRegister ||
          camFormData.guarantor ||
          {};

        const riskInputs =
          merged.riskInputs ||
          camFormData.riskInputs || {
            sectorRiskScore: 0.5,
            previousDefault: false,
          };

        // ====================================================================
        // Build server-side EngineInput
        // ====================================================================

        const engineInput: EngineInput = {
          sales: {
            clientEstimate:
              Number(
                merged.salesClientEstimate ??
                  camFormData.salesClientEstimate ??
                  0,
              ),

            spotCheck:
              Number(
                merged.salesSpotCheck ??
                  camFormData.salesSpotCheck ??
                  0,
              ),

            bankStatement:
              Number(
                merged.salesBankStatement ??
                  camFormData.salesBankStatement ??
                  0,
              ),

            bookRecords:
              Number(
                merged.salesBookRecord ??
                  camFormData.salesBookRecord ??
                  0,
              ),
          },

          inventory:
            Array.isArray(
              inventoryItems,
            )
              ? inventoryItems.map(
                  (it: any) => ({
                    description:
                      it.description ||
                      '',
                    qty: Number(
                      it.qty || 0,
                    ),
                    cost: Number(
                      it.cost || 0,
                    ),
                    sell: Number(
                      it.sell || 0,
                    ),
                  }),
                )
              : [],

          // SERVER-AUTHORITATIVE dynamic sector margin.
          sectorBenchmarkMargin:
            Number(
              sector.benchmarkedMargin,
            ),

          loan: {
            principal:
              Number(
                merged.loanPrincipal ??
                  camFormData.loanPrincipal ??
                  0,
              ),

            annualInterestRate:
              Number(
                merged.loanInterestRate ??
                  camFormData.loanInterestRate ??
                  0,
              ),

            tenorMonths:
              Number(
                merged.loanTenorMonths ??
                  camFormData.loanTenorMonths ??
                  0,
              ),

            repaymentMethod:
              (
                merged.repaymentMethod ??
                camFormData.repaymentMethod ??
                'REDUCING'
              ) === 'FLAT'
                ? 'FLAT'
                : 'REDUCING',

            upfrontFeePercent:
              Number(
                merged.upfrontFeePercent ??
                  camFormData.upfrontFeePercent ??
                  0,
              ),

            ccdPercent:
              Number(
                merged.ccdPercent ??
                  camFormData.ccdPercent ??
                  0,
              ),
          },

          expenses: {
            businessRegular:
              Number(
                merged.monthlyBusinessExpenses ??
                  camFormData.monthlyBusinessExpenses ??
                  0,
              ),

            businessIrregular:
              Number(
                merged.businessIrregularExpenses ??
                  camFormData.businessIrregularExpenses ??
                  0,
              ),

            familyRegular:
              Number(
                merged.monthlyFamilyExpenses ??
                  camFormData.monthlyFamilyExpenses ??
                  0,
              ),

            familyIrregular:
              Number(
                merged.familyIrregularExpenses ??
                  camFormData.familyIrregularExpenses ??
                  0,
              ),

            otherLoanInstallments:
              Number(
                merged.otherLoanRepayments ??
                  camFormData.otherLoanRepayments ??
                  0,
              ),
          },

          bufferRate:
            FORMULA_LIMITS.BUFFER_RATE,

          openingCash:
            Number(
              merged.openingCash ??
                camFormData.openingCash ??
                0,
            ),

          balanceSheet: {
            cashAtHand:
              Number(
                balanceSheet.cashAtHand ??
                  0,
              ),

            cashInBanks:
              Number(
                balanceSheet.cashInBanks ??
                  0,
              ),

            receivables:
              Number(
                balanceSheet.receivables ??
                  0,
              ),

            stockValue:
              Number(
                balanceSheet.stockValue ??
                  merged.totalStockValue ??
                  0,
              ),

            fixedBusinessAssets:
              Number(
                balanceSheet.fixedBusinessAssets ??
                  0,
              ),

            fixedFamilyAssets:
              Number(
                balanceSheet.fixedFamilyAssets ??
                  0,
              ),

            shortTermLiabilities:
              Number(
                balanceSheet.shortTermLiabilities ??
                  0,
              ),

            longTermLiabilities:
              Number(
                balanceSheet.longTermLiabilities ??
                  0,
              ),

            payables:
              Number(
                balanceSheet.payables ??
                  0,
              ),
          },

          riskInputs: {
            // Server-side sector risk score.
            sectorRiskScore:
              Number(
                sector.riskScore ??
                  0.5,
              ),

            previousDefault:
              !!(
                riskInputs.previousDefault ??
                merged.previousDefault ??
                false
              ),

            successionPlanVerified:
              !!(
                merged.successionPlanVerified ??
                false
              ),

            bankAccountVerified:
              !!(
                merged.bankAccountVerified ??
                false
              ),
          },

          loanBaseAmount:
            Number(
              merged.loanPrincipal ??
                camFormData.loanPrincipal ??
                0,
            ),

          collaterals:
            Array.isArray(
              collaterals,
            )
              ? collaterals.map(
                  (c: any) => ({
                    type:
                      c.type ||
                      'MOVABLE',

                    marketValue:
                      Number(
                        c.marketValue ||
                          0,
                      ),
                  }),
                )
              : [],

          guarantor: {
            income:
              Number(
                guarantor.monthlyIncome ??
                  guarantor.income ??
                  0,
              ),

            cogs:
              Number(
                guarantor.cogs ??
                  0,
              ),

            operationExpenses:
              Number(
                guarantor.operationExpenses ??
                  guarantor.monthlyLivingExpenses ??
                  0,
              ),

            existingInstallment:
              Number(
                guarantor.existingInstallments ??
                  guarantor.existingInstallment ??
                  0,
              ),
          },

          stress: {
            salesHaircut: 10,
            marginCompression: 5,
            opexIncrease: 10,
          },
        };

        // ====================================================================
        // Execute server-side CAM engine
        // ====================================================================

        const engineResult =
          executeFullAppraisal(
            engineInput,
          );

        // ====================================================================
        // Stamp SERVER-COMPUTED values
        // ====================================================================

        updateData.sectorId =
          sector.id;

        updateData.verifiedMonthlySales =
          engineResult.forensics
            .consideredSales;

        updateData.verifiedMonthlyCogs =
          engineResult.purchases
            .finalPurchases;

        updateData.verifiedMonthlyNetProfit =
          engineResult.pnl.netProfit;

        updateData.weightedMargin =
          engineResult.marginSummary
            .marginUsed;

        updateData.dsrRatio =
          engineResult.ratios.dsr;

        updateData.dscrRatio =
          engineResult.ratios.dscr;

        updateData.riskScore =
          engineResult.finalScore;

        updateData.riskGrade =
          engineResult.riskGrade.grade;

        updateData.engineVerdict =
          engineResult.engineVerdict;

        updateData.salesVariancePercent =
          engineResult.forensics
            .variancePercent;

        updateData.hasHighVariance =
          engineResult.forensics
            .variancePercent > 25;

        updateData.engineDump =
          JSON.stringify({
            policyVersion:
              engineResult.policyVersion,

            marginSummary:
              engineResult.marginSummary,

            forensics:
              engineResult.forensics,

            purchases:
              engineResult.purchases,

            pnl:
              engineResult.pnl,

            ratios:
              engineResult.ratios,

            pmt:
              engineResult.pmt,

            isSolvent:
              engineResult.isSolvent,

            stress:
              engineResult.stress,

            collateralCoverage:
              engineResult.collateralCoverage,

            guarantorDSR:
              engineResult.guarantorDSR,

            bankYield:
              engineResult.bankYield,

            riskGrade:
              engineResult.riskGrade,

            redFlags:
              engineResult.redFlags,

            finalScore:
              engineResult.finalScore,

            engineVerdict:
              engineResult.engineVerdict,

            authSource:
              'server_recomputed',

            recomputedAt:
              new Date().toISOString(),
          });
      } catch (
        recomputeErr: any
      ) {
        // Do not block saving a draft if the engine cannot recompute.
        // The authoritative engine fields are only refreshed when valid
        // CAM input is available.
        console.error(
          '[v53 appraisal] engine recompute failed:',
          recomputeErr?.message,
        );
      }
    }

    // ========================================================================
    // Persist update
    // ========================================================================

    const updated =
      await db.creditAppraisal.update({
        where: {
          loanApplicantId: id,
        },
        data: updateData,
      });

    return NextResponse.json({
      appraisal: updated,
    });
  } catch (e: any) {
    console.error(
      'Appraisal PUT error:',
      e,
    );

    return NextResponse.json(
      {
        error:
          'Internal server error',
      },
      {
        status: 500,
      },
    );
  }
}

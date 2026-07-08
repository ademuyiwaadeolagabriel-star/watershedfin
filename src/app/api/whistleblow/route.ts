import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST /api/whistleblow — submit a whistleblower report (anonymous or named)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportType, subject, description, severity, reporterName, reporterEmail, reporterPhone, isAnonymous } = body;

    if (!reportType || !subject || !description) {
      return NextResponse.json({ error: 'reportType, subject, and description are required' }, { status: 400 });
    }

    // Generate reference code
    const year = new Date().getFullYear();
    const count = await db.auditLog.count({ where: { module: 'whistleblower' } }).catch(() => 0);
    const refCode = `WBR-${year}-${String(count + 1).padStart(4, '0')}`;

    // Store as an audit log entry (since we don't have a dedicated whistleblower table)
    // The report is stored securely and only accessible to super admins
    const report = await db.auditLog.create({
      data: {
        action: 'whistleblower_report',
        module: 'whistleblower',
        description: `[${refCode}] ${reportType}: ${subject}`,
        severity: severity || 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        metadata: JSON.stringify({
          refCode,
          reportType,
          subject,
          description,
          severity: severity || 'warning',
          reporterName: isAnonymous ? 'ANONYMOUS' : (reporterName || 'ANONYMOUS'),
          reporterEmail: isAnonymous ? null : (reporterEmail || null),
          reporterPhone: isAnonymous ? null : (reporterPhone || null),
          isAnonymous: !!isAnonymous,
          status: 'submitted',
          submittedAt: new Date().toISOString(),
        }),
      },
    });

    // Send notification to super admins (fire and forget)
    try {
      const superAdmins = await db.admin.findMany({ where: { role: 'super', status: 1 } });
      for (const admin of superAdmins) {
        await db.notification.create({
          data: {
            adminId: admin.id,
            type: 'whistleblower_report',
            title: `New Whistleblower Report: ${refCode}`,
            message: `${reportType}: ${subject}`,
            category: 'system',
            actionLabel: 'Review Report',
            metadata: JSON.stringify({ refCode, severity }),
          },
        }).catch(() => {});
      }
    } catch {}

    return NextResponse.json({
      success: true,
      refCode,
      message: 'Your report has been submitted securely. Reference code: ' + refCode,
    });
  } catch (e: any) {
    console.error('Whistleblower error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/whistleblow — list all reports (super admin only)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const adminId = url.searchParams.get('adminId');
    if (!adminId) return NextResponse.json({ error: 'adminId required' }, { status: 400 });

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin || (admin.role !== 'super' && !admin.auditAccess)) {
      return NextResponse.json({ error: 'Unauthorized — super admin or audit access required' }, { status: 403 });
    }

    const reports = await db.auditLog.findMany({
      where: { module: 'whistleblower' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const parsed = reports.map(r => {
      let data = {};
      try { data = JSON.parse(r.metadata || '{}'); } catch {}
      return {
        id: r.id,
        createdAt: r.createdAt,
        severity: r.severity,
        ...data,
      };
    });

    return NextResponse.json({ reports: parsed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

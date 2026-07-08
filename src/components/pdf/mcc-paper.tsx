import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// MCC Paper PDF — A4 portrait MCC decision paper
// Used by mcc-detail.tsx "Export PDF" button (client-side via pdf().toBlob())
// NOTE: Do NOT add 'use client' — this is a React component consumed by the
// @react-pdf/renderer pdf() renderer on the client.
// ============================================================================

export interface McCPaperDecision {
  id?: string;
  approvalLevel: number;
  approverName: string;
  approverRole: string;
  recommendedAmount: number | null;
  duration: number | null;
  ccdPercentage: number | null;
  upfrontFeePercentage: number | null;
  interestRatePercentage: number | null;
  comment: string | null;
  decisionType: string;
  decisionDate: string | Date;
}

export interface McCPaperLoan {
  id?: string;
  applicationRef: string | null;
  amount?: number;
  duration?: number;
  reason?: string | null;
  status?: string;
  statusLabel?: string;
  currentStep?: string;
  currentStepLabel?: string;
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    bvn?: string | null;
    accountNumber?: string | null;
    business?: {
      name?: string;
      sector?: string | null;
      shopAddress?: string | null;
      state?: string | null;
    } | null;
  } | null;
  branch?: { name?: string; code?: string } | null;
  plan?: { name?: string; interest?: number } | null;
  loanOfficer?: { firstName?: string; lastName?: string } | null;
}

export interface McCPaperSummary {
  initialAmount: number;
  finalAmount: number;
  amountChange: number;
  amountChangePercent: number;
  progressPercent: number;
  decisionCount: number;
  totalLevels: number;
  isComplete: boolean;
  latestRates: {
    ccd: number | null;
    upfront: number | null;
    interest: number | null;
  };
  latestDecisionType: string | null;
  latestDecisionDate: string | Date | null;
}

export interface McCPaperPDFProps {
  loan: McCPaperLoan;
  decisions: McCPaperDecision[];
  summary: McCPaperSummary;
  generatedAt?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    paddingBottom: 60,
  },
  header: { textAlign: 'center', marginBottom: 16 },
  brandTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F7A4A' },
  title: { fontSize: 13, fontWeight: 'bold', marginTop: 4, marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#666' },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    backgroundColor: '#f0f0f0',
    padding: 5,
    color: '#1F7A4A',
  },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: '40%', color: '#666' },
  value: { width: '60%', fontWeight: 'bold' },
  table: { marginTop: 6, borderWidth: 1, borderColor: '#eee' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1F7A4A', color: 'white' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    minHeight: 22,
  },
  cell: { padding: 4, fontSize: 8 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7,
    color: '#999',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 6,
  },
  decisionBadge: {
    fontSize: 7,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    color: 'white',
    textAlign: 'center',
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 4,
    padding: 8,
    margin: 2,
  },
  summaryLabel: { fontSize: 7, color: '#666', marginBottom: 2 },
  summaryValue: { fontSize: 11, fontWeight: 'bold', color: '#1F7A4A' },
  summarySub: { fontSize: 7, color: '#666', marginTop: 2 },
  signCell: { padding: 4, fontSize: 8, textAlign: 'center' },
});

function naira(n?: number | null): string {
  if (n == null || isNaN(n)) return '—';
  return '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

function fmtDate(d: string | Date | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function decisionColor(t: string): string {
  switch (t) {
    case 'approved':
      return '#16a34a';
    case 'rejected':
      return '#dc2626';
    case 'deferred':
      return '#d97706';
    case 'conditional':
      return '#2563eb';
    default:
      return '#64748b';
  }
}

const COL = {
  sn: '5%',
  name: '20%',
  role: '12%',
  amount: '14%',
  tenor: '7%',
  int: '7%',
  ccd: '7%',
  comment: '28%',
};

export function McCPaperPDF({ loan, decisions, summary, generatedAt }: McCPaperPDFProps) {
  const genAt = generatedAt || new Date().toISOString();
  const user = loan.user;
  const borrowerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '—';
  const business = user?.business;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>WATERSHED FINANCE LIMITED</Text>
          <Text style={styles.title}>Management Credit Committee — Decision Paper</Text>
          <Text style={styles.subtitle}>
            Application Ref: {loan.applicationRef || '—'}
          </Text>
          <Text style={styles.subtitle}>
            Status: {loan.statusLabel || loan.status || '—'} · Stage:{' '}
            {loan.currentStepLabel || loan.currentStep || '—'}
          </Text>
        </View>

        {/* Customer Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Borrower Name:</Text>
            <Text style={styles.value}>{borrowerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Business Name:</Text>
            <Text style={styles.value}>{business?.name || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{user?.email || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Phone:</Text>
            <Text style={styles.value}>{user?.phone || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Sector:</Text>
            <Text style={styles.value}>{business?.sector || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Branch:</Text>
            <Text style={styles.value}>{loan.branch?.name || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Loan Officer:</Text>
            <Text style={styles.value}>
              {loan.loanOfficer
                ? `${loan.loanOfficer.firstName || ''} ${loan.loanOfficer.lastName || ''}`.trim()
                : '—'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Loan Product:</Text>
            <Text style={styles.value}>{loan.plan?.name || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Requested Amount:</Text>
            <Text style={styles.value}>{naira(loan.amount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tenure:</Text>
            <Text style={styles.value}>{loan.duration || '—'} months</Text>
          </View>
          {loan.reason && (
            <View style={styles.row}>
              <Text style={styles.label}>Purpose:</Text>
              <Text style={styles.value}>{loan.reason}</Text>
            </View>
          )}
        </View>

        {/* MCC Decision Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            MCC Decision Ledger ({decisions.length}/{summary.totalLevels} levels)
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: COL.sn }]}>S/N</Text>
              <Text style={[styles.cell, { width: COL.name }]}>Name</Text>
              <Text style={[styles.cell, { width: COL.role }]}>Designation</Text>
              <Text style={[styles.cell, { width: COL.amount }]}>Amount</Text>
              <Text style={[styles.cell, { width: COL.tenor }]}>Tenor</Text>
              <Text style={[styles.cell, { width: COL.int }]}>Int%</Text>
              <Text style={[styles.cell, { width: COL.ccd }]}>CCD%</Text>
              <Text style={[styles.cell, { width: COL.comment }]}>Comment</Text>
            </View>
            {decisions.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No MCC decisions recorded yet.
                </Text>
              </View>
            ) : (
              decisions.map((d, i) => (
                <View key={d.id || i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: COL.sn }]}>{d.approvalLevel}</Text>
                  <Text style={[styles.cell, { width: COL.name }]}>{d.approverName}</Text>
                  <Text style={[styles.cell, { width: COL.role }]}>{d.approverRole}</Text>
                  <Text style={[styles.cell, { width: COL.amount }]}>{naira(d.recommendedAmount)}</Text>
                  <Text style={[styles.cell, { width: COL.tenor }]}>{d.duration || '—'}</Text>
                  <Text style={[styles.cell, { width: COL.int }]}>{d.interestRatePercentage ?? '—'}%</Text>
                  <Text style={[styles.cell, { width: COL.ccd }]}>{d.ccdPercentage ?? '—'}%</Text>
                  <Text style={[styles.cell, { width: COL.comment }]}>
                    {d.comment || '—'}
                    {'\n'}
                    <Text style={[styles.decisionBadge, { backgroundColor: decisionColor(d.decisionType) }]}>
                      {d.decisionType.toUpperCase()} · {fmtDate(d.decisionDate)}
                    </Text>
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Initial Request</Text>
              <Text style={styles.summaryValue}>{naira(summary.initialAmount)}</Text>
              <Text style={styles.summarySub}>Customer ask</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Final MCC Amount</Text>
              <Text style={styles.summaryValue}>{naira(summary.finalAmount)}</Text>
              <Text style={styles.summarySub}>
                {summary.amountChangePercent > 0 ? '▲' : summary.amountChangePercent < 0 ? '▼' : '·'}{' '}
                {Math.abs(summary.amountChangePercent)}% change
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Approval Progress</Text>
              <Text style={styles.summaryValue}>
                {summary.decisionCount}/{summary.totalLevels}
              </Text>
              <Text style={styles.summarySub}>{summary.progressPercent}% complete</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Status</Text>
              <Text style={styles.summaryValue}>
                {summary.isComplete ? 'COMPLETE' : (summary.latestDecisionType || 'PENDING').toUpperCase()}
              </Text>
              <Text style={styles.summarySub}>{fmtDate(summary.latestDecisionDate)}</Text>
            </View>
          </View>
        </View>

        {/* Latest Approved Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Approved Terms</Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>CCD %</Text>
              <Text style={styles.summaryValue}>{summary.latestRates.ccd ?? '—'}%</Text>
              <Text style={styles.summarySub}>Capital Contribution Deposit</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Upfront Fee %</Text>
              <Text style={styles.summaryValue}>{summary.latestRates.upfront ?? '—'}%</Text>
              <Text style={styles.summarySub}>One-time fee</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Interest Rate %</Text>
              <Text style={styles.summaryValue}>{summary.latestRates.interest ?? '—'}%</Text>
              <Text style={styles.summarySub}>Per annum</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Watershed Finance Limited · No 8, Jubilee/CMD Road, Magodo GRA II, Lagos ·{' '}
          Generated {fmtDate(genAt)} · This document is confidential and governed by the BOFIA 2020.
        </Text>
      </Page>
    </Document>
  );
}

export default McCPaperPDF;

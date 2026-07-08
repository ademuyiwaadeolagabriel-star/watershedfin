import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// CAM Memo PDF — A4 portrait Credit Appraisal Memorandum
// Sections: Header, Executive Summary, Forensic Financial Analysis (P&L table),
// Risk Ratios & Grading, Security Pledged, Recommendation, Approval Signatures
// ============================================================================

export interface CamPAndLRow {
  label: string;
  value: number | null;
  note?: string | null;
}

export interface CamRiskRatio {
  label: string;
  value: string | number | null;
  benchmark: string;
  verdict: 'pass' | 'review' | 'fail' | 'na';
}

export interface CamSecurityItem {
  type: string;
  description: string;
  value: number | null;
  fsv: number | null;
}

export interface CamSignatory {
  name: string;
  role: string;
  signed?: boolean;
  date?: string | Date | null;
}

export interface CamMemoPDFProps {
  loan: {
    applicationRef: string | null;
    amount?: number;
    duration?: number;
    reason?: string | null;
    user?: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      bvn?: string | null;
      business?: {
        name?: string;
        sector?: string | null;
        shopAddress?: string | null;
        state?: string | null;
        yearsInOperation?: number | null;
        monthlySales?: number | null;
        stockValue?: number | null;
      } | null;
    } | null;
    branch?: { name?: string } | null;
    loanOfficer?: { firstName?: string; lastName?: string } | null;
  };
  executiveSummary: string;
  pnL: CamPAndLRow[];
  riskRatios: CamRiskRatio[];
  riskGrade: string;
  riskGradeLabel: string;
  securities: CamSecurityItem[];
  recommendation: string;
  recommendedAmount: number | null;
  recommendedTenor: number | null;
  recommendedRate: number | null;
  signatories: CamSignatory[];
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
  paragraph: { fontSize: 9, lineHeight: 1.5, color: '#333', marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: '40%', color: '#666' },
  value: { width: '60%', fontWeight: 'bold' },
  table: { marginTop: 6, borderWidth: 1, borderColor: '#eee' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1F7A4A', color: 'white' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    minHeight: 20,
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
  gradeBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  verdictBadge: {
    fontSize: 7,
    paddingHorizontal: 3,
    paddingVertical: 1,
    color: 'white',
    textAlign: 'center',
    borderRadius: 2,
  },
  sigBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    margin: 2,
    minHeight: 70,
  },
  sigLabel: { fontSize: 7, color: '#666' },
  sigName: { fontSize: 9, fontWeight: 'bold', marginTop: 2 },
  sigRole: { fontSize: 7, color: '#666' },
  sigLine: {
    marginTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    width: '80%',
  },
  sigDate: { fontSize: 7, color: '#999', marginTop: 4 },
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

function gradeColor(g: string): string {
  switch (g?.toUpperCase()) {
    case 'A':
      return '#16a34a';
    case 'B':
      return '#65a30d';
    case 'C':
      return '#d97706';
    case 'D':
      return '#ea580c';
    case 'F':
      return '#dc2626';
    default:
      return '#64748b';
  }
}

function verdictColor(v: string): string {
  switch (v) {
    case 'pass':
      return '#16a34a';
    case 'review':
      return '#d97706';
    case 'fail':
      return '#dc2626';
    default:
      return '#64748b';
  }
}

export function CamMemoPDF({
  loan,
  executiveSummary,
  pnL,
  riskRatios,
  riskGrade,
  riskGradeLabel,
  securities,
  recommendation,
  recommendedAmount,
  recommendedTenor,
  recommendedRate,
  signatories,
  generatedAt,
}: CamMemoPDFProps) {
  const genAt = generatedAt || new Date().toISOString();
  const user = loan.user;
  const business = user?.business;
  const borrowerName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : '—';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>WATERSHED FINANCE LIMITED</Text>
          <Text style={styles.title}>Credit Appraisal Memorandum (CAM)</Text>
          <Text style={styles.subtitle}>
            Application Ref: {loan.applicationRef || '—'}
          </Text>
          <Text style={styles.subtitle}>
            Borrower: {borrowerName} · {business?.name || '—'}
          </Text>
        </View>

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Executive Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Requested Amount:</Text>
            <Text style={styles.value}>{naira(loan.amount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Requested Tenor:</Text>
            <Text style={styles.value}>{loan.duration || '—'} months</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Sector:</Text>
            <Text style={styles.value}>{business?.sector || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Years in Operation:</Text>
            <Text style={styles.value}>{business?.yearsInOperation ?? '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Risk Grade:</Text>
            <Text style={[styles.gradeBadge, { backgroundColor: gradeColor(riskGrade) }]}>
              {riskGrade} — {riskGradeLabel}
            </Text>
          </View>
          <Text style={[styles.paragraph, { marginTop: 6 }]}>{executiveSummary}</Text>
        </View>

        {/* Forensic Financial Analysis (P&L) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Forensic Financial Analysis (P&amp;L)</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: '50%' }]}>Line Item</Text>
              <Text style={[styles.cell, { width: '25%', textAlign: 'right' }]}>Value (₦)</Text>
              <Text style={[styles.cell, { width: '25%' }]}>Note</Text>
            </View>
            {pnL.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No P&amp;L data captured.
                </Text>
              </View>
            ) : (
              pnL.map((row, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '50%' }]}>{row.label}</Text>
                  <Text style={[styles.cell, { width: '25%', textAlign: 'right' }]}>
                    {row.value != null ? naira(row.value) : '—'}
                  </Text>
                  <Text style={[styles.cell, { width: '25%' }]}>{row.note || '—'}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Risk Ratios & Grading */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Risk Ratios &amp; Grading</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: '30%' }]}>Ratio</Text>
              <Text style={[styles.cell, { width: '20%', textAlign: 'right' }]}>Value</Text>
              <Text style={[styles.cell, { width: '25%' }]}>Benchmark</Text>
              <Text style={[styles.cell, { width: '25%' }]}>Verdict</Text>
            </View>
            {riskRatios.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No risk ratios computed.
                </Text>
              </View>
            ) : (
              riskRatios.map((r, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '30%' }]}>{r.label}</Text>
                  <Text style={[styles.cell, { width: '20%', textAlign: 'right' }]}>
                    {r.value ?? '—'}
                  </Text>
                  <Text style={[styles.cell, { width: '25%' }]}>{r.benchmark}</Text>
                  <Text style={[styles.cell, { width: '25%' }]}>
                    <Text
                      style={[
                        styles.verdictBadge,
                        { backgroundColor: verdictColor(r.verdict) },
                      ]}
                    >
                      {r.verdict.toUpperCase()}
                    </Text>
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Security Pledged */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Security Pledged</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: '20%' }]}>Type</Text>
              <Text style={[styles.cell, { width: '45%' }]}>Description</Text>
              <Text style={[styles.cell, { width: '17%', textAlign: 'right' }]}>Value</Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>FSV</Text>
            </View>
            {securities.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No security pledged.
                </Text>
              </View>
            ) : (
              securities.map((s, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '20%' }]}>{s.type}</Text>
                  <Text style={[styles.cell, { width: '45%' }]}>{s.description}</Text>
                  <Text style={[styles.cell, { width: '17%', textAlign: 'right' }]}>
                    {naira(s.value)}
                  </Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(s.fsv)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Recommendation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Recommendation</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Recommended Amount:</Text>
            <Text style={styles.value}>{naira(recommendedAmount)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Recommended Tenor:</Text>
            <Text style={styles.value}>{recommendedTenor || '—'} months</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Recommended Rate:</Text>
            <Text style={styles.value}>{recommendedRate ?? '—'}% p.a.</Text>
          </View>
          <Text style={[styles.paragraph, { marginTop: 6 }]}>{recommendation}</Text>
        </View>

        {/* Approval Signatures */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Approval Signatures</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {signatories.length === 0 ? (
              <Text style={[styles.paragraph, { color: '#999' }]}>
                No signatories recorded.
              </Text>
            ) : (
              signatories.map((s, i) => (
                <View key={i} style={styles.sigBox}>
                  <Text style={styles.sigLabel}>Name</Text>
                  <Text style={styles.sigName}>{s.name}</Text>
                  <Text style={styles.sigRole}>{s.role}</Text>
                  <View style={styles.sigLine} />
                  <Text style={styles.sigDate}>
                    {s.signed ? `Signed · ${fmtDate(s.date)}` : 'Pending signature'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        <Text style={styles.footer}>
          Watershed Finance Limited · No 8, Jubilee/CMD Road, Magodo GRA II, Lagos ·{' '}
          Generated {fmtDate(genAt)} · Confidential — For internal MCC use only.
        </Text>
      </Page>
    </Document>
  );
}

export default CamMemoPDF;

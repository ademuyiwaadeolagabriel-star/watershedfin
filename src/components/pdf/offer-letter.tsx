import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// Offer Letter PDF — A4 portrait provisional offer letter
// Sections: Header, Provisional Offer Terms table, General Terms (12 clauses
// summarized), Repayment Schedule table, Loan & Security Agreement preamble,
// Cryptographic Signature Block.
// ============================================================================

export interface OfferTerm {
  label: string;
  value: string;
}

export interface RepaymentRow {
  installmentNo: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  balance: number;
}

export interface SignatureBlock {
  signatoryName: string;
  signatoryRole: string;
  otpMethod: string;
  timestamp: string | Date;
  ipAddress: string;
  legalCitation: string;
  signatureHash: string;
}

export interface OfferLetterPDFProps {
  loan: {
    applicationRef: string | null;
    amount?: number;
    duration?: number;
    user?: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      bvn?: string | null;
      business?: { name?: string; shopAddress?: string | null } | null;
    } | null;
    branch?: { name?: string } | null;
  };
  offerTerms: OfferTerm[];
  generalTerms: string[];
  repaymentSchedule: RepaymentRow[];
  agreementPreamble: string;
  signature: SignatureBlock;
  generatedAt?: string;
  // Optional cost-of-credit breakdown (used to render DOCX-aligned summary rows)
  costOfCredit?: {
    totalInterest?: number;
    upfrontFee?: number;
    ccdAmount?: number;
    totalOtherCharges?: number;
    totalCostOfCredit?: number;
  };
  // Optional up-front processing fee disclosure (DOCX clause 5c)
  processingFeePercent?: number;
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
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    fontSize: 8,
    color: '#666',
  },
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
  numberedClause: { fontSize: 9, lineHeight: 1.5, marginBottom: 4 },
  clauseNumber: { fontWeight: 'bold', color: '#1F7A4A' },
  sigBox: {
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 4,
    padding: 10,
    marginTop: 8,
    backgroundColor: '#f0fdf4',
  },
  sigHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#16a34a',
    marginBottom: 6,
    textAlign: 'center',
  },
  sigRow: { flexDirection: 'row', marginBottom: 3, fontSize: 8 },
  sigLabel: { width: '30%', color: '#666' },
  sigValue: { width: '70%', fontWeight: 'bold', fontFamily: 'Courier' },
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

function fmtDateTime(d: string | Date | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function OfferLetterPDF({
  loan,
  offerTerms,
  generalTerms,
  repaymentSchedule,
  agreementPreamble,
  signature,
  generatedAt,
  costOfCredit,
  processingFeePercent,
}: OfferLetterPDFProps) {
  const genAt = generatedAt || new Date().toISOString();
  const user = loan.user;
  const borrowerName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
    : '—';
  const borrowerAddress = user?.address || user?.business?.shopAddress || '—';

  // ---- DOCX-aligned summary rows (computed from schedule + costOfCredit) ----
  const firstRepaymentDate =
    repaymentSchedule.length > 0 ? repaymentSchedule[0].dueDate : '—';
  const maturityDate =
    repaymentSchedule.length > 0
      ? repaymentSchedule[repaymentSchedule.length - 1].dueDate
      : '—';

  // Build the extended summary rows: caller-provided offerTerms + the new
  // DOCX-mandated summary rows. We always include them so the PDF matches
  // the DOCX section "Summary of the Loan Offer" exactly.
  const extendedTerms: OfferTerm[] = [
    ...offerTerms,
    { label: 'First Repayment Date', value: firstRepaymentDate },
    { label: 'Maturity Date', value: maturityDate },
    {
      label: 'Total interest charges (Total interest you will pay)',
      value: naira(costOfCredit?.totalInterest),
    },
    {
      label:
        'Total other charges you will pay throughout the duration of the loan, inclusive of VAT',
      value: naira(
        costOfCredit?.totalOtherCharges ??
          (costOfCredit?.upfrontFee ?? 0) + (costOfCredit?.ccdAmount ?? 0),
      ),
    },
    {
      label:
        'Total cost of credit (This is made up of total interest and all other charges for the tenor of the loan)',
      value: naira(costOfCredit?.totalCostOfCredit),
    },
  ];

  // Processing fee clause text (DOCX clause 5c)
  const processingFeeClause = `Processing, Insurance and Commission Fee: ${
    processingFeePercent != null ? processingFeePercent : 3.2
  }% of the Loan, to be paid upfront. All fees are exclusive of VAT and other statutory charges.`;

  // Cooling-off / Penalties clause text (DOCX clause 2)
  const coolingOffClause = [
    'Late Payment: If a repayment is more than 2 days later than the due date, you will be charged 0.03% per day on the outstanding sums on the overdue amount.',
    'Cooling Off Period: You may cancel your loan contract within 3 days after signing provided Watershed Capital has not disbursed the loan to you.',
    'Variations: The interest rate, fees and charges disclosed here may change during the subsistence of the contract.',
  ];

  // Events of default (DOCX clause 7)
  const eventsOfDefault = [
    'Failure to pay any installment when due',
    'Breach of any terms of this offer or security documents',
    'Bankruptcy or insolvency of the borrower',
    'Misrepresentation or concealment of material facts',
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>WATERSHED FINANCE LIMITED</Text>
          <Text style={styles.title}>Provisional Offer Letter</Text>
          <Text style={styles.subtitle}>
            No 8, Jubilee/CMD Road, Magodo GRA II, Lagos · RC 1234567
          </Text>
        </View>

        <View style={styles.refRow}>
          <Text>Ref: {loan.applicationRef || '—'}</Text>
          <Text>Date: {fmtDate(genAt)}</Text>
        </View>

        {/* Borrower Address */}
        <View style={styles.section}>
          <Text style={styles.paragraph}>To:</Text>
          <Text style={[styles.paragraph, { fontWeight: 'bold' }]}>{borrowerName}</Text>
          <Text style={styles.paragraph}>{borrowerAddress}</Text>
          <Text style={styles.paragraph}>Dear {user?.firstName || 'Customer'},</Text>
        </View>

        {/* Provisional Offer Terms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Provisional Offer Terms</Text>
          <View style={styles.table}>
            {extendedTerms.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No offer terms captured.
                </Text>
              </View>
            ) : (
              extendedTerms.map((t, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '50%', color: '#666' }]}>{t.label}</Text>
                  <Text style={[styles.cell, { width: '50%', fontWeight: 'bold' }]}>
                    {t.value}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* General Terms (12 clauses summarized) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. General Terms &amp; Conditions</Text>
          {generalTerms.length === 0 ? (
            <Text style={[styles.paragraph, { color: '#999' }]}>
              No general terms captured.
            </Text>
          ) : (
            generalTerms.map((term, i) => (
              <Text key={i} style={styles.numberedClause}>
                <Text style={styles.clauseNumber}>{i + 1}. </Text>
                {term}
              </Text>
            ))
          )}
        </View>

        {/* Penalties & Cooling-Off Period (DOCX clause 2) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2A. Penalties and Additional Requirements</Text>
          {coolingOffClause.map((line, i) => (
            <Text key={i} style={styles.numberedClause}>
              <Text style={styles.clauseNumber}>• </Text>
              {line}
            </Text>
          ))}
        </View>

        {/* Processing Fee Clause (DOCX clause 5c) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5C. Processing, Insurance and Commission Fee</Text>
          <Text style={styles.paragraph}>{processingFeeClause}</Text>
        </View>

        {/* Events of Default (DOCX clause 7) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Events of Default</Text>
          <Text style={styles.paragraph}>
            Any of the following shall constitute an event of default under this Agreement:
          </Text>
          {eventsOfDefault.map((line, i) => (
            <Text key={i} style={styles.numberedClause}>
              <Text style={styles.clauseNumber}>• </Text>
              {line}
            </Text>
          ))}
        </View>

        {/* Repayment Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Repayment Schedule</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: '8%' }]}>#</Text>
              <Text style={[styles.cell, { width: '20%' }]}>Due Date</Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>Principal</Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>Interest</Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>Total</Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>Balance</Text>
            </View>
            {repaymentSchedule.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}>
                  No repayment schedule generated.
                </Text>
              </View>
            ) : (
              repaymentSchedule.map((r, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '8%' }]}>{r.installmentNo}</Text>
                  <Text style={[styles.cell, { width: '20%' }]}>{r.dueDate}</Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(r.principal)}
                  </Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(r.interest)}
                  </Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(r.total)}
                  </Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(r.balance)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Loan & Security Agreement preamble */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Loan &amp; Security Agreement</Text>
          <Text style={styles.paragraph}>{agreementPreamble}</Text>
        </View>

        {/* Cryptographic Signature Block */}
        <View style={styles.section}>
          <View style={styles.sigBox}>
            <Text style={styles.sigHeader}>SIGNED AND ACCEPTED</Text>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Signatory:</Text>
              <Text style={styles.sigValue}>{signature.signatoryName}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Role:</Text>
              <Text style={styles.sigValue}>{signature.signatoryRole}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>OTP Method:</Text>
              <Text style={styles.sigValue}>{signature.otpMethod}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Timestamp:</Text>
              <Text style={styles.sigValue}>{fmtDateTime(signature.timestamp)}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>IP Address:</Text>
              <Text style={styles.sigValue}>{signature.ipAddress}</Text>
            </View>
            <View style={styles.sigRow}>
              <Text style={styles.sigLabel}>Legal Citation:</Text>
              <Text style={styles.sigValue}>{signature.legalCitation}</Text>
            </View>
            <View style={[styles.sigRow, { marginTop: 4 }]}>
              <Text style={styles.sigLabel}>Signature Hash:</Text>
              <Text style={[styles.sigValue, { fontSize: 7, wordBreak: 'break-all' } as any]}>
                {signature.signatureHash}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Watershed Finance Limited · Regulated by the Central Bank of Nigeria ·{' '}
          Generated {fmtDate(genAt)} · This offer is valid for 14 days from the date of issue.
        </Text>
      </Page>
    </Document>
  );
}

export default OfferLetterPDF;

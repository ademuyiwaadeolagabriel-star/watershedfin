import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// PAYMENT RECEIPT PDF
// ============================================================================
// A4 portrait receipt for each loan repayment. Sections:
//   • Header (brand + "PAYMENT RECEIPT" + sub-line)
//   • Receipt meta (receipt number, date issued, loan ref)
//   • Customer block (name + account number)
//   • Payment amount hero (big ₦ amount)
//   • Payment details table (method, reference, payment date)
//   • Loan summary (outstanding balance, next due date, next due amount)
//   • Footer ("computer-generated receipt" disclaimer)
//
// No 'use client' — this is a server-renderable @react-pdf/renderer document.
// ============================================================================

const BRAND_GREEN = '#1F7A4A';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    paddingBottom: 60,
    position: 'relative',
  },
  header: { textAlign: 'center', marginBottom: 18 },
  brandTitle: { fontSize: 16, fontWeight: 'bold', color: BRAND_GREEN, letterSpacing: 1 },
  title: { fontSize: 13, fontWeight: 'bold', marginTop: 4, marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#666' },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: BRAND_GREEN,
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    fontSize: 9,
    color: '#666',
  },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    color: BRAND_GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { color: '#666', fontSize: 9 },
  value: { fontWeight: 'bold', fontSize: 9 },
  amountHero: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  amountLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  amountValue: { fontSize: 26, fontWeight: 'bold', color: BRAND_GREEN, marginTop: 4 },
  amountSub: { fontSize: 9, color: '#666', marginTop: 4 },
  table: { borderWidth: 1, borderColor: '#eee', marginTop: 4 },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    minHeight: 22,
  },
  tableLabelCell: { padding: 6, fontSize: 9, width: '40%', color: '#666', backgroundColor: '#fafafa' },
  tableValueCell: { padding: 6, fontSize: 9, width: '60%', fontWeight: 'bold' },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    backgroundColor: '#ecfdf5',
    borderRadius: 4,
    marginBottom: 12,
  },
  successText: { fontSize: 10, fontWeight: 'bold', color: '#047857', marginLeft: 6 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
  },
});

export interface PaymentReceiptPDFProps {
  receiptNumber: string;
  loanRef: string;
  customerName: string;
  accountNumber: string;
  amount: number;
  paymentMethod: string;
  paymentDate: Date | string;
  reference: string;
  outstandingBalance: number;
  nextDueDate: Date | string | null;
  nextDueAmount: number | null;
  generatedAt?: Date | string;
}

function naira(n?: number | null): string {
  if (n == null || isNaN(n)) return '₦0';
  return '₦' + Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

function fmtDate(d: Date | string | null | undefined): string {
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

function fmtDateTime(d: Date | string | null | undefined): string {
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

function titleCase(s: string): string {
  if (!s) return '';
  return s
    .replace(/[_-]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function PaymentReceiptPDF(props: PaymentReceiptPDFProps) {
  const {
    receiptNumber,
    loanRef,
    customerName,
    accountNumber,
    amount,
    paymentMethod,
    paymentDate,
    reference,
    outstandingBalance,
    nextDueDate,
    nextDueAmount,
    generatedAt,
  } = props;

  const genAt = generatedAt || new Date();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>WATERSHED CAPITAL</Text>
          <Text style={styles.title}>PAYMENT RECEIPT</Text>
          <Text style={styles.subtitle}>
            No 8, Jubilee/CMD Road, Magodo GRA II, Lagos · CBN-licensed Loan Company
          </Text>
        </View>
        <View style={styles.divider} />

        {/* Receipt meta */}
        <View style={styles.section}>
          <View style={styles.metaRow}>
            <Text>Receipt No: {receiptNumber}</Text>
            <Text>Date Issued: {fmtDateTime(genAt)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text>Loan Reference: {loanRef}</Text>
            <Text>Status: SUCCESS</Text>
          </View>
        </View>

        {/* Success badge */}
        <View style={styles.successBadge}>
          <Text style={styles.successText}>✓ PAYMENT SUCCESSFULLY RECEIVED</Text>
        </View>

        {/* Amount hero */}
        <View style={styles.amountHero}>
          <Text style={styles.amountLabel}>Amount Paid</Text>
          <Text style={styles.amountValue}>{naira(amount)}</Text>
          <Text style={styles.amountSub}>
            Received from {customerName} on {fmtDate(paymentDate)}
          </Text>
        </View>

        {/* Customer block */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{customerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Account Number</Text>
            <Text style={styles.value}>{accountNumber || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Loan Reference</Text>
            <Text style={styles.value}>{loanRef}</Text>
          </View>
        </View>

        {/* Payment details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Payment Method</Text>
              <Text style={styles.tableValueCell}>{titleCase(paymentMethod)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Reference</Text>
              <Text style={styles.tableValueCell}>{reference}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Payment Date</Text>
              <Text style={styles.tableValueCell}>{fmtDateTime(paymentDate)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Amount</Text>
              <Text style={styles.tableValueCell}>{naira(amount)}</Text>
            </View>
          </View>
        </View>

        {/* Loan summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loan Summary</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Outstanding Balance</Text>
              <Text style={styles.tableValueCell}>{naira(outstandingBalance)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Next Due Date</Text>
              <Text style={styles.tableValueCell}>{fmtDate(nextDueDate)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabelCell}>Next Due Amount</Text>
              <Text style={styles.tableValueCell}>
                {nextDueAmount != null ? naira(nextDueAmount) : '—'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          This is a computer-generated receipt and does not require a signature. ·{' '}
          For enquiries contact support@watershedcapital.com · Generated{' '}
          {fmtDateTime(genAt)}
        </Text>
      </Page>
    </Document>
  );
}

export default PaymentReceiptPDF;

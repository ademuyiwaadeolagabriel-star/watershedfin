import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// ============================================================================
// Loan & Security Agreement PDF — A4 portrait
// Mirrors the DOCX "LOAN AND SECURITY AGREEMENT" structure:
//   Header, BETWEEN (Borrower / Lender),
//   PART I DEFINITIONS, PART II CONSIDERATION, PART III SURVIVAL,
//   PART IV PURPOSE OF THE LOAN, PART V TERMS OF THE LOAN,
//   PART VI PREPAYMENT, PART VII SECURITY, PART VIII LENDER'S COVENANTS,
//   PART IX BORROWER'S REPRESENTATIONS,
//   Signature Block + optional Digital Signature Block.
// ============================================================================

export interface SecurityAgreementCollateral {
  type: string;
  description: string;
  marketValue: number;
  fsv: number;
}

export interface SecurityAgreementLender {
  name: string;
  address: string;
}

export interface SecurityAgreementBorrower {
  name: string;
  tradingAs?: string;
  address: string;
}

export interface SecurityAgreementLoanTerms {
  principal: number;
  annualRate: number;
  tenorMonths: number;
  repaymentMethod: string;
  purpose: string;
}

export interface SecurityAgreementDigitalSignature {
  signatory: string;
  method: string;
  timestamp: string;
  hash: string;
  legalCitation: string;
}

export interface SecurityAgreementPDFProps {
  borrower: SecurityAgreementBorrower;
  lender: SecurityAgreementLender;
  loanTerms: SecurityAgreementLoanTerms;
  collateral: SecurityAgreementCollateral[];
  agreementDate: Date;
  digitalSignature?: SecurityAgreementDigitalSignature;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    paddingBottom: 60,
    lineHeight: 1.45,
  },
  header: { textAlign: 'center', marginBottom: 14 },
  brandTitle: { fontSize: 16, fontWeight: 'bold', color: '#1F7A4A' },
  title: { fontSize: 13, fontWeight: 'bold', marginTop: 4, marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#666' },
  refRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    fontSize: 8,
    color: '#666',
  },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    backgroundColor: '#f0f0f0',
    padding: 5,
    color: '#1F7A4A',
  },
  partTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1F7A4A',
    marginTop: 8,
    marginBottom: 4,
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
  betweenRow: { flexDirection: 'row', marginBottom: 4, fontSize: 9 },
  betweenLabel: { width: '25%', color: '#666' },
  betweenValue: { width: '75%', fontWeight: 'bold' },
  sigBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 10,
    margin: 2,
    minHeight: 80,
  },
  sigLabel: { fontSize: 8, color: '#666' },
  sigName: { fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  sigRole: { fontSize: 8, color: '#666', marginTop: 2 },
  sigLine: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    width: '85%',
  },
  sigDate: { fontSize: 8, color: '#999', marginTop: 4 },
  digSigBox: {
    borderWidth: 2,
    borderColor: '#16a34a',
    borderRadius: 4,
    padding: 10,
    marginTop: 10,
    backgroundColor: '#f0fdf4',
  },
  digSigHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#16a34a',
    marginBottom: 6,
    textAlign: 'center',
  },
  digSigRow: { flexDirection: 'row', marginBottom: 3, fontSize: 8 },
  digSigLabel: { width: '30%', color: '#666' },
  digSigValue: { width: '70%', fontWeight: 'bold', fontFamily: 'Courier' },
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
      month: 'long',
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

const DEFINITIONS: { term: string; definition: string }[] = [
  {
    term: 'Borrower',
    definition:
      'means the party identified in this Agreement as the borrower, including its successors and permitted assigns.',
  },
  {
    term: 'Collateral',
    definition:
      'means the property, assets, and rights pledged by the Borrower to secure the Loan, as more particularly described in Part VII of this Agreement.',
  },
  {
    term: 'Debt',
    definition:
      'means all sums owing by the Borrower to the Lender under this Agreement, including principal, interest, fees, charges, and any enforcement costs.',
  },
  {
    term: 'Encumbrances',
    definition:
      'means any mortgage, charge, pledge, lien, hypothecation, security interest, or other adverse claim, right, or interest of any third party.',
  },
  {
    term: 'Personal Guarantee',
    definition:
      'means the personal guarantee executed by the guarantor(s) of the Borrower in favour of the Lender, guaranteeing the repayment of the Loan.',
  },
  {
    term: 'Personal Property',
    definition:
      'means any movable property, chattels, equipment, inventory, or other tangible assets of the Borrower pledged as Collateral.',
  },
  {
    term: 'Project',
    definition:
      'means the purpose for which the Loan is availed, as described in Part IV of this Agreement.',
  },
  {
    term: 'Refinancing',
    definition:
      'means the repayment of an existing loan facility by the proceeds of a new loan facility granted by the Lender or any other lender.',
  },
  {
    term: 'Sale',
    definition:
      'means the disposal, transfer, or assignment of any Collateral by the Borrower, whether voluntary or involuntary, save as expressly permitted under this Agreement.',
  },
];

export function SecurityAgreementPDF({
  borrower,
  lender,
  loanTerms,
  collateral,
  agreementDate,
  digitalSignature,
}: SecurityAgreementPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>WATERSHED FINANCE LIMITED</Text>
          <Text style={styles.title}>LOAN AND SECURITY AGREEMENT</Text>
          <Text style={styles.subtitle}>
            No 8, Jubilee/CMD Road, Magodo GRA II, Lagos · RC 1234567
          </Text>
        </View>

        <View style={styles.refRow}>
          <Text>Agreement Date: {fmtDate(agreementDate)}</Text>
          <Text>Executed at Lagos, Nigeria</Text>
        </View>

        {/* BETWEEN */}
        <View style={styles.section}>
          <Text style={styles.partTitle}>THIS LOAN AND SECURITY AGREEMENT is made</Text>
          <Text style={styles.paragraph}>
            <Text style={{ fontWeight: 'bold' }}>BETWEEN</Text>
          </Text>
          <View style={styles.betweenRow}>
            <Text style={styles.betweenLabel}>Borrower:</Text>
            <Text style={styles.betweenValue}>
              {borrower.name}
              {borrower.tradingAs ? ` (trading as ${borrower.tradingAs})` : ''}
            </Text>
          </View>
          <View style={styles.betweenRow}>
            <Text style={styles.betweenLabel}>Address:</Text>
            <Text style={styles.betweenValue}>{borrower.address}</Text>
          </View>
          <Text style={styles.paragraph}>
            <Text style={{ fontWeight: 'bold' }}>(the &quot;Borrower&quot;)</Text> of the one part;
          </Text>
          <Text style={styles.paragraph}>
            <Text style={{ fontWeight: 'bold' }}>AND</Text>
          </Text>
          <View style={styles.betweenRow}>
            <Text style={styles.betweenLabel}>Lender:</Text>
            <Text style={styles.betweenValue}>{lender.name}</Text>
          </View>
          <View style={styles.betweenRow}>
            <Text style={styles.betweenLabel}>Address:</Text>
            <Text style={styles.betweenValue}>{lender.address}</Text>
          </View>
          <Text style={styles.paragraph}>
            <Text style={{ fontWeight: 'bold' }}>(the &quot;Lender&quot;)</Text> of the other part.
          </Text>
        </View>

        {/* PART I — DEFINITIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART I — DEFINITIONS</Text>
          <Text style={styles.paragraph}>
            In this Agreement, unless the context otherwise requires, the following terms shall have
            the meanings ascribed to them below:
          </Text>
          {DEFINITIONS.map((d, i) => (
            <Text key={i} style={styles.numberedClause}>
              <Text style={styles.clauseNumber}>{i + 1}. </Text>
              <Text style={{ fontWeight: 'bold' }}>{d.term} </Text>
              {d.definition}
            </Text>
          ))}
        </View>

        {/* PART II — CONSIDERATION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART II — CONSIDERATION</Text>
          <Text style={styles.paragraph}>
            In consideration of the mutual covenants and undertakings contained in this Agreement,
            and for other good and valuable consideration, the receipt and sufficiency of which are
            hereby acknowledged, the Borrower is seeking funds from the Lender for the purpose
            stated in Part IV, and the Lender has agreed to provide the Loan to the Borrower on the
            terms and conditions set out in this Agreement.
          </Text>
        </View>

        {/* PART III — SURVIVAL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART III — SURVIVAL</Text>
          <Text style={styles.paragraph}>
            The representations, warranties, covenants, and undertakings of the Borrower contained
            in this Agreement shall survive the execution and delivery of this Agreement and the
            closing of the Loan, and shall continue in full force and effect until the Debt has been
            repaid in full.
          </Text>
        </View>

        {/* PART IV — PURPOSE OF THE LOAN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART IV — PURPOSE OF THE LOAN</Text>
          <Text style={styles.paragraph}>
            The Borrower shall apply the Loan solely towards the following purpose:
          </Text>
          <Text style={[styles.paragraph, { fontWeight: 'bold' }]}>
            {loanTerms.purpose || 'Business expansion and working capital.'}
          </Text>
          <Text style={styles.paragraph}>
            The Borrower shall not apply the Loan, in whole or in part, for any purpose other than
            that stated above without the prior written consent of the Lender.
          </Text>
        </View>

        {/* PART V — TERMS OF THE LOAN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART V — TERMS OF THE LOAN</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Principal Amount:</Text>
            <Text style={styles.value}>{naira(loanTerms.principal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Interest Rate:</Text>
            <Text style={styles.value}>{loanTerms.annualRate}% per annum</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Tenor:</Text>
            <Text style={styles.value}>{loanTerms.tenorMonths} months</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Repayment Method:</Text>
            <Text style={styles.value}>{loanTerms.repaymentMethod}</Text>
          </View>
          <Text style={[styles.paragraph, { marginTop: 4 }]}>
            The Borrower shall repay the principal amount of the Loan together with interest thereon
            in equal monthly instalments in accordance with the repayment schedule annexed to the
            Offer Letter. All payments shall be made to the Lender&apos;s designated bank account
            without set-off or counterclaim.
          </Text>
        </View>

        {/* PART VI — PREPAYMENT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART VI — PREPAYMENT</Text>
          <Text style={styles.paragraph}>
            The Borrower may prepay any portion of this Loan at any time without penalty, provided
            that the Borrower gives the Lender at least seven (7) days&apos; prior written notice of
            its intention to prepay. Any prepayment shall be applied first to accrued interest and
            thereafter to the principal amount outstanding.
          </Text>
        </View>

        {/* PART VII — SECURITY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART VII — SECURITY</Text>
          <Text style={styles.paragraph}>
            As security for the repayment of the Loan and all other sums owing under this Agreement,
            the Borrower hereby pledges and charges to the Lender the Collateral described below:
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.cell, { width: '20%' }]}>Type</Text>
              <Text style={[styles.cell, { width: '45%' }]}>Description</Text>
              <Text style={[styles.cell, { width: '17%', textAlign: 'right' }]}>
                Market Value
              </Text>
              <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                Forced Sale Value
              </Text>
            </View>
            {collateral.length === 0 ? (
              <View style={styles.tableRow}>
                <Text
                  style={[styles.cell, { width: '100%', textAlign: 'center', color: '#999' }]}
                >
                  No collateral pledged.
                </Text>
              </View>
            ) : (
              collateral.map((c, i) => (
                <View key={i} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: '20%' }]}>{c.type}</Text>
                  <Text style={[styles.cell, { width: '45%' }]}>{c.description}</Text>
                  <Text style={[styles.cell, { width: '17%', textAlign: 'right' }]}>
                    {naira(c.marketValue)}
                  </Text>
                  <Text style={[styles.cell, { width: '18%', textAlign: 'right' }]}>
                    {naira(c.fsv)}
                  </Text>
                </View>
              ))
            )}
          </View>
          <Text style={[styles.paragraph, { marginTop: 4 }]}>
            The Borrower shall not sell, transfer, assign, lease, or otherwise dispose of any
            Collateral without the prior written consent of the Lender. The Lender is hereby
            irrevocably authorised to realise the Collateral upon the occurrence of an Event of
            Default in accordance with the applicable laws of the Federal Republic of Nigeria.
          </Text>
        </View>

        {/* PART VIII — LENDER'S COVENANTS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART VIII — LENDER&apos;S COVENANTS</Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>8.1 Loan. </Text>
            The Lender covenants to advance the Loan to the Borrower in accordance with the terms of
            this Agreement, subject to the fulfilment of all conditions precedent.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>8.2 Disbursements. </Text>
            The Lender shall disburse the Loan to the Borrower&apos;s nominated bank account within a
            reasonable time after the satisfaction of all conditions precedent to disbursement.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>8.3 Payments by Lender. </Text>
            The Lender shall apply all sums received from the Borrower first towards accrued
            interest, then towards principal, and finally towards any fees, charges, or costs owing
            under this Agreement, unless otherwise agreed in writing.
          </Text>
        </View>

        {/* PART IX — BORROWER'S REPRESENTATIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PART IX — BORROWER&apos;S REPRESENTATIONS</Text>
          <Text style={styles.paragraph}>The Borrower represents and warrants to the Lender that:</Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.1 Authorization. </Text>
            The Borrower has full power, authority, and legal right to enter into and perform this
            Agreement, and all necessary corporate and regulatory approvals have been obtained.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.2 Certifications. </Text>
            All certifications, documents, and information furnished by the Borrower to the Lender
            are true, complete, and accurate in all material respects.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.3 Tax Compliance. </Text>
            The Borrower has duly filed all required tax returns and has paid all taxes due and
            payable by it, and there are no outstanding tax liabilities that would materially affect
            its ability to repay the Loan.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.4 No Liens. </Text>
            The Collateral is free from all Encumbrances except as disclosed to the Lender in
            writing, and the Borrower has good and marketable title to the Collateral.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.5 Accurate Financials. </Text>
            The financial statements and records of the Borrower delivered to the Lender fairly and
            accurately present the financial position of the Borrower, and there has been no material
            adverse change since the date of such statements.
          </Text>
          <Text style={styles.numberedClause}>
            <Text style={styles.clauseNumber}>9.6 Condition Precedent Fulfilment. </Text>
            The Borrower has fulfilled or shall fulfil all conditions precedent required for the
            disbursement of the Loan on or before the disbursement date.
          </Text>
        </View>

        {/* Signature Block */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SIGNATURES</Text>
          <Text style={styles.paragraph}>
            IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written
            above.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            <View style={styles.sigBox}>
              <Text style={styles.sigLabel}>For: {lender.name}</Text>
              <Text style={styles.sigName}>Authorised Signatory</Text>
              <Text style={styles.sigRole}>{lender.name}</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigDate}>Date: {fmtDate(agreementDate)}</Text>
            </View>
            <View style={styles.sigBox}>
              <Text style={styles.sigLabel}>For: Borrower</Text>
              <Text style={styles.sigName}>{borrower.name}</Text>
              <Text style={styles.sigRole}>
                {borrower.tradingAs ? `Trading as ${borrower.tradingAs}` : 'Borrower'}
              </Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigDate}>Date: {fmtDate(agreementDate)}</Text>
            </View>
          </View>
        </View>

        {/* Digital Signature Block (if signed electronically) */}
        {digitalSignature && (
          <View style={styles.section}>
            <View style={styles.digSigBox}>
              <Text style={styles.digSigHeader}>DIGITALLY SIGNED</Text>
              <View style={styles.digSigRow}>
                <Text style={styles.digSigLabel}>Signatory:</Text>
                <Text style={styles.digSigValue}>{digitalSignature.signatory}</Text>
              </View>
              <View style={styles.digSigRow}>
                <Text style={styles.digSigLabel}>Method:</Text>
                <Text style={styles.digSigValue}>{digitalSignature.method}</Text>
              </View>
              <View style={styles.digSigRow}>
                <Text style={styles.digSigLabel}>Timestamp:</Text>
                <Text style={styles.digSigValue}>{fmtDateTime(digitalSignature.timestamp)}</Text>
              </View>
              <View style={styles.digSigRow}>
                <Text style={styles.digSigLabel}>Legal Citation:</Text>
                <Text style={styles.digSigValue}>{digitalSignature.legalCitation}</Text>
              </View>
              <View style={[styles.digSigRow, { marginTop: 4 }]}>
                <Text style={styles.digSigLabel}>Signature Hash:</Text>
                <Text style={[styles.digSigValue, { fontSize: 7, wordBreak: 'break-all' } as any]}>
                  {digitalSignature.hash}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.footer}>
          Watershed Finance Limited · Regulated by the Central Bank of Nigeria ·{' '}
          Agreement executed on {fmtDate(agreementDate)} · This Agreement is governed by the laws of
          the Federal Republic of Nigeria.
        </Text>
      </Page>
    </Document>
  );
}

export default SecurityAgreementPDF;

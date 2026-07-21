/**
 * Seed default KYC fields for v25 dynamic KYC system.
 *
 * Run with:
 *   npx tsx scripts/seed-kyc-fields.ts
 *
 * Or after prisma db push:
 *   tsx scripts/seed-kyc-fields.ts
 *
 * This script is idempotent — if a field with the same key already exists,
 * it skips creating it.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

interface SeedField {
  key: string;
  label: string;
  description?: string;
  helpText?: string;
  type: 'text' | 'number' | 'email' | 'phone' | 'date' | 'select' | 'textarea' | 'file' | 'checkbox';
  options?: string[];
  section: 'personal' | 'physical' | 'business' | 'financial';
  required: boolean;
  editable: boolean;
  needsVerification?: boolean;
  placeholder?: string;
  validationPattern?: string;
  validationMessage?: string;
  sortOrder: number;
  adminOnly?: boolean;
}

const SEED_FIELDS: SeedField[] = [
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PERSONAL INFORMATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    key: 'date_of_birth',
    label: 'Date of Birth',
    type: 'date',
    section: 'personal',
    required: true,
    editable: true,
    needsVerification: true,
    sortOrder: 10,
    placeholder: 'Select your date of birth',
    helpText: 'Used to verify your identity and calculate your age for credit scoring.',
  },
  {
    key: 'place_of_birth',
    label: 'Place of Birth',
    type: 'text',
    section: 'personal',
    required: false,
    editable: true,
    sortOrder: 20,
    placeholder: 'e.g. Lagos',
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: ['Male', 'Female'],
    section: 'personal',
    required: true,
    editable: true,
    sortOrder: 30,
  },
  {
    key: 'marital_status',
    label: 'Marital Status',
    type: 'select',
    options: ['Single', 'Married', 'Divorced', 'Widowed'],
    section: 'personal',
    required: false,
    editable: true,
    sortOrder: 40,
  },
  {
    key: 'bvn',
    label: 'Bank Verification Number (BVN)',
    description: 'Your 11-digit BVN issued by your bank.',
    type: 'text',
    section: 'personal',
    required: true,
    editable: false, // Once verified, lock it
    needsVerification: true,
    sortOrder: 50,
    placeholder: '12345678901',
    validationPattern: '^\\d{11}$',
    validationMessage: 'BVN must be exactly 11 digits',
    helpText: 'Dial *565*0# on your registered phone to retrieve your BVN.',
  },
  {
    key: 'nin',
    label: 'National Identity Number (NIN)',
    description: 'Your 11-digit NIN issued by NIMC.',
    type: 'text',
    section: 'personal',
    required: true,
    editable: false,
    needsVerification: true,
    sortOrder: 60,
    placeholder: '12345678901',
    validationPattern: '^\\d{11}$',
    validationMessage: 'NIN must be exactly 11 digits',
    helpText: 'Dial *346# on your registered phone to retrieve your NIN.',
  },
  {
    key: 'mothers_maiden_name',
    label: "Mother's Maiden Name",
    type: 'text',
    section: 'personal',
    required: true,
    editable: false,
    sortOrder: 70,
    placeholder: 'e.g. Adeyemi',
    helpText: 'Used for additional identity verification. This cannot be changed after submission.',
  },
  {
    key: 'source_of_funds',
    label: 'Source of Funds',
    type: 'select',
    options: [
      'Personal Savings',
      'Family Savings',
      'Sale of Assets',
      'Business Profits',
      'Salary / Employment Income',
      'Investment Returns',
      'Inheritance',
      'Gift',
      'Pension / Retirement',
      'Rental Income',
      'Other',
    ],
    section: 'personal',
    required: true,
    editable: true,
    sortOrder: 80,
  },
  {
    key: 'next_of_kin_name',
    label: 'Next of Kin — Full Name',
    type: 'text',
    section: 'personal',
    required: true,
    editable: true,
    sortOrder: 90,
    placeholder: 'e.g. Adeyemi Johnson',
  },
  {
    key: 'next_of_kin_phone',
    label: 'Next of Kin — Phone Number',
    type: 'phone',
    section: 'personal',
    required: true,
    editable: true,
    sortOrder: 100,
    placeholder: '8012345678',
    validationPattern: '^\\d{10,11}$',
    validationMessage: 'Enter a valid 10 or 11-digit phone number',
  },
  {
    key: 'next_of_kin_relationship',
    label: 'Next of Kin — Relationship',
    type: 'select',
    options: ['Spouse', 'Parent', 'Child', 'Sibling', 'Other Relative', 'Friend', 'Guardian'],
    section: 'personal',
    required: true,
    editable: true,
    sortOrder: 110,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PHYSICAL / ADDRESS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    key: 'residential_address_line1',
    label: 'Residential Address — Line 1',
    type: 'text',
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 10,
    placeholder: 'House number + street name',
  },
  {
    key: 'residential_address_line2',
    label: 'Residential Address — Line 2 (optional)',
    type: 'text',
    section: 'physical',
    required: false,
    editable: true,
    sortOrder: 20,
    placeholder: 'Apartment, suite, unit, etc.',
  },
  {
    key: 'city',
    label: 'City / Town',
    type: 'text',
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 30,
    placeholder: 'e.g. Ikeja',
  },
  {
    key: 'state',
    label: 'State',
    type: 'select',
    options: [
      'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
      'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
      'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
      'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
      'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
    ],
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 40,
  },
  {
    key: 'lga',
    label: 'Local Government Area',
    type: 'text',
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 50,
    placeholder: 'e.g. Ikeja LGA',
  },
  {
    key: 'postal_code',
    label: 'Postal Code',
    type: 'text',
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 60,
    placeholder: 'e.g. 100271',
    validationPattern: '^\\d{6}$',
    validationMessage: 'Postal code must be 6 digits',
  },
  {
    key: 'residence_ownership',
    label: 'Residence Ownership Status',
    type: 'select',
    options: ['Owned', 'Rented', 'Family House', 'Employer-Provided'],
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 70,
  },
  {
    key: 'years_at_address',
    label: 'Years at Current Address',
    type: 'number',
    section: 'physical',
    required: true,
    editable: true,
    sortOrder: 80,
    placeholder: 'e.g. 3',
  },
  {
    key: 'proof_of_address',
    label: 'Proof of Address (Utility Bill)',
    description: 'Upload a recent electricity, water, or waste bill (not older than 3 months).',
    type: 'file',
    section: 'physical',
    required: true,
    editable: true,
    needsVerification: true,
    sortOrder: 90,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BUSINESS DETAILS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    key: 'business_name',
    label: 'Business / Trade Name',
    type: 'text',
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 10,
    placeholder: 'e.g. Adeyemi Stores',
  },
  {
    key: 'business_type',
    label: 'Business Type',
    type: 'select',
    options: [
      'Sole Proprietorship (Individual)',
      'Partnership',
      'Limited Liability Company (LLC)',
      'Public Limited Company (PLC)',
      'Cooperative Society',
      'Non-Governmental Organization (NGO)',
    ],
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 20,
  },
  {
    key: 'rc_bn_number',
    label: 'RC / BN Number (if registered)',
    description: 'CAC registration number. Leave blank if your business is not registered.',
    type: 'text',
    section: 'business',
    required: false,
    editable: true,
    needsVerification: true,
    sortOrder: 30,
    placeholder: 'e.g. RC1234567 or BN9876543',
  },
  {
    key: 'date_business_established',
    label: 'Date Business Established',
    type: 'date',
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 40,
  },
  {
    key: 'business_address',
    label: 'Business Address',
    type: 'textarea',
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 50,
    placeholder: 'Full business address including street, city, state',
  },
  {
    key: 'business_state',
    label: 'Business State',
    type: 'select',
    options: [
      'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
      'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
      'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
      'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
      'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
    ],
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 60,
  },
  {
    key: 'sector',
    label: 'Business Sector',
    type: 'select',
    options: [
      'Agriculture & Farming',
      'Retail / Trading',
      'Manufacturing',
      'Food & Beverage',
      'Fashion & Clothing',
      'Healthcare & Pharmacy',
      'Education & Training',
      'Transportation & Logistics',
      'Construction & Real Estate',
      'Technology & IT Services',
      'Hospitality & Tourism',
      'Financial Services',
      'Beauty & Personal Care',
      'Automotive',
      'Telecommunications',
      'Other',
    ],
    section: 'business',
    required: true,
    editable: true,
    sortOrder: 70,
  },
  {
    key: 'shop_photo',
    label: 'Shop / Business Photo',
    description: 'Upload a clear photo of your business premises (front view).',
    type: 'file',
    section: 'business',
    required: true,
    editable: true,
    needsVerification: true,
    sortOrder: 80,
  },
  {
    key: 'cac_certificate',
    label: 'CAC Certificate (if registered)',
    description: 'Upload your CAC certificate if your business is registered.',
    type: 'file',
    section: 'business',
    required: false,
    editable: true,
    needsVerification: true,
    sortOrder: 90,
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FINANCIAL INFORMATION
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    key: 'monthly_income',
    label: 'Monthly Personal Income (₦)',
    type: 'number',
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 10,
    placeholder: 'e.g. 150000',
  },
  {
    key: 'monthly_business_revenue',
    label: 'Monthly Business Revenue (₦)',
    type: 'number',
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 20,
    placeholder: 'e.g. 500000',
  },
  {
    key: 'monthly_business_expenses',
    label: 'Monthly Business Expenses (₦)',
    type: 'number',
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 30,
    placeholder: 'e.g. 300000',
  },
  {
    key: 'bank_name',
    label: 'Primary Bank Name',
    type: 'select',
    options: [
      'Access Bank', 'GTBank', 'Zenith Bank', 'UBA', 'First Bank',
      'Ecobank', 'Kuda Bank', 'Sterling Bank', 'Wema Bank', 'Fidelity Bank',
      'Union Bank', 'Stanbic IBTC', 'FCMB', 'Unity Bank', 'Polaris Bank',
      'Suntrust Bank', 'Keystone Bank', 'Titan Trust Bank', 'Opay', 'PalmPay',
      'Other',
    ],
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 40,
  },
  {
    key: 'bank_account_number',
    label: 'Bank Account Number',
    type: 'text',
    section: 'financial',
    required: true,
    editable: false,
    needsVerification: true,
    sortOrder: 50,
    placeholder: '10-digit NUBAN',
    validationPattern: '^\\d{10}$',
    validationMessage: 'Account number must be exactly 10 digits',
  },
  {
    key: 'bank_account_name',
    label: 'Bank Account Name',
    type: 'text',
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 60,
    placeholder: 'Must match the name on your bank account',
  },
  {
    key: 'existing_loans',
    label: 'Do you have any existing loans?',
    type: 'checkbox',
    section: 'financial',
    required: true,
    editable: true,
    sortOrder: 70,
  },
  {
    key: 'existing_loan_details',
    label: 'Existing Loan Details (if any)',
    description: 'List lender, outstanding balance, and monthly repayment.',
    type: 'textarea',
    section: 'financial',
    required: false,
    editable: true,
    sortOrder: 80,
    placeholder: 'e.g. GTBank — ₦500,000 outstanding — ₦45,000/month',
  },
  {
    key: 'bank_statement',
    label: 'Bank Statement (last 6 months)',
    description: 'Upload your bank statement for the last 6 months in PDF format.',
    type: 'file',
    section: 'financial',
    required: true,
    editable: true,
    needsVerification: true,
    sortOrder: 90,
  },
];

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  v25 — Seeding default KYC fields');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let created = 0;
  let skipped = 0;

  for (const f of SEED_FIELDS) {
    const existing = await db.kycField.findUnique({ where: { key: f.key } }).catch(() => null);
    if (existing) {
      skipped++;
      continue;
    }

    await db.kycField.create({
      data: {
        key: f.key,
        label: f.label,
        description: f.description || null,
        helpText: f.helpText || null,
        type: f.type,
        options: f.options ? JSON.stringify(f.options) : null,
        section: f.section,
        required: f.required,
        editable: f.editable,
        needsVerification: f.needsVerification || false,
        placeholder: f.placeholder || null,
        validationPattern: f.validationPattern || null,
        validationMessage: f.validationMessage || null,
        sortOrder: f.sortOrder,
        adminOnly: f.adminOnly || false,
        enabled: true,
      },
    });
    created++;
    console.log(`  ✓ Created: ${f.key} (${f.section})`);
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Done. Created: ${created}  Skipped (already existed): ${skipped}`);
  console.log(`  Total KYC fields in DB: ${created + skipped}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Print section summary
  const sections = await db.kycField.groupBy({
    by: ['section'],
    _count: true,
    orderBy: { section: 'asc' },
  });
  console.log('Section summary:');
  for (const s of sections) {
    console.log(`  ${s.section.padEnd(15)} → ${s._count} field(s)`);
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

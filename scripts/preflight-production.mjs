#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'package.json', 'prisma/schema.prisma', 'prisma/migrations/migration_lock.toml',
  'src/lib/auth.ts', 'src/lib/db.ts', 'next.config.ts', 'vercel.json',
  'src/app/api/health/route.ts',
];
const errors = [];
const warnings = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Missing required release file: ${file}`);
}
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') errors.push('JWT_SECRET must be configured in production.');
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) errors.push('JWT_SECRET must be at least 32 characters.');
if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') errors.push('DATABASE_URL must be configured in production.');
if (!process.env.DIRECT_URL && process.env.NODE_ENV === 'production') warnings.push('DIRECT_URL is required when running Prisma migrations; configure it before migrate deploy.');
if (!fs.existsSync(path.join(root, 'prisma/migrations/20260927_security_auth_version/migration.sql'))) {
  errors.push('Security/auth-version migration is missing.');
}
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const floatCount = (schema.match(/\bFloat\b/g) || []).length;
if (floatCount) warnings.push(`${floatCount} Prisma Float declarations remain; classify them before converting monetary fields to Decimal.`);
const auth = fs.readFileSync(path.join(root, 'src/lib/auth.ts'), 'utf8');
if (/return\s+\{\s*id:\s*['\"]?fallback/i.test(auth)) errors.push('Fail-open governance fallback detected in auth.ts.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!pkg.scripts?.build) errors.push('package.json has no production build script.');
if (pkg.scripts?.build && !pkg.scripts.build.includes('next build')) warnings.push('Build script does not explicitly run next build.');
if (errors.length) {
  console.error('\nPRODUCTION PREFLIGHT: FAILED\n');
  for (const e of errors) console.error(`ERROR: ${e}`);
  for (const w of warnings) console.error(`WARN:  ${w}`);
  process.exit(1);
}
console.log('\nPRODUCTION PREFLIGHT: PASS\n');
for (const w of warnings) console.log(`WARN: ${w}`);
console.log('Release tree, required security files, auth fail-closed checks, and build configuration are present.');

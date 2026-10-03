# Watershed Capital — Production Prisma Migration Guide

## Important

The application ZIP contains the current Prisma schema and the security-hardening migration, but the original repository did not contain the historical migration chain for the already-existing production schema.

**Do not run `prisma migrate deploy` against a fresh database and assume the single hardening migration creates the complete Watershed schema.**

### Existing Neon database

1. Take a verified database backup/snapshot.
2. Set `DATABASE_URL` to the pooled/runtime Neon URL and `DIRECT_URL` to the Neon direct connection URL.
3. Generate a migration script describing the difference between the existing database and the current Prisma schema:

```bash
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script > /tmp/watershed-baseline.sql
```

4. Review the generated SQL. Do not run destructive SQL blindly.
5. If the existing database already matches the schema, create a baseline migration directory containing the reviewed script and mark that baseline as applied with `prisma migrate resolve --applied <baseline_name>`.
6. Deploy the subsequent application migrations with:

```bash
npx prisma migrate deploy
```

### Fresh production database

Generate a baseline from an empty database state:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/watershed-baseline.sql
```

Review it, place it in the first baseline migration directory, then apply the baseline followed by the release migrations.

### Never use `db push` as the production migration mechanism

`prisma db push` is useful for development/prototyping but is not the release migration workflow for this financial system. Production schema changes must be reviewed and tracked as migrations.

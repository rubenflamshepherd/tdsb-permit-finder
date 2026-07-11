# Agent Notes

## PostgreSQL and Prisma

The deployed app uses PostgreSQL on GCP Cloud SQL. Runtime database access goes
through the Cloud SQL Node.js connector in `lib/prisma.ts`; it does not connect
directly to the instance IP. If `CLOUD_SQL_INSTANCE_CONNECTION_NAME` is unset,
Prisma falls back to `DATABASE_URL`, which is the normal path for local
development and tests.

Use a local PostgreSQL database with `npm run prisma:migrate` (`prisma migrate
dev`) to create and apply migrations. It requires an interactive terminal. In
non-TTY contexts, hand-write migration SQL under
`prisma/migrations/<timestamp>_<name>/migration.sql` following the existing
style, then apply it with `prisma migrate deploy`.

Remote Prisma CLI commands do not use the application's Node connector. Start
Cloud SQL Auth Proxy with Application Default Credentials or a service-account
key stored outside the repository:

```bash
cloud-sql-proxy "$CLOUD_SQL_INSTANCE_CONNECTION_NAME" --port 5433
```

In a second terminal, load the environment-specific configuration and use the
proxy-backed migrator URL:

```bash
set -a; source .env.production.local; set +a
DATABASE_URL="$CLOUD_SQL_MIGRATION_URL" npx prisma migrate deploy
```

`migrate deploy` is idempotent. Use it for staging and production cutovers and
after pulling a branch with committed migrations. Never run `migrate dev`
against staging or production.

The deployed environments require:

- `CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `CLOUD_SQL_DATABASE`
- `CLOUD_SQL_SCHEMA` (`tdsb_finder` for deployed environments)
- `CLOUD_SQL_USER`
- `CLOUD_SQL_PASSWORD`
- `CLOUD_SQL_POOL_MAX` (`2` for Vercel, `10` for sync jobs)
- Google Application Default Credentials, or `GCP_SERVICE_ACCOUNT_KEY_JSON`
  on Vercel

After changing `prisma/schema.prisma`, run:

```bash
npm run prisma:generate
npm run typecheck
npm test
```

After applying inventory-related schema changes, refresh cached TDSB data with:

```bash
npm run sync:inventory
```

See `docs/cloud-sql-migration.md` for provisioning, data-copy, validation,
cutover, and rollback steps.

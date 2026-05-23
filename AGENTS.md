# Agent Notes

## Prisma Migrations

This project uses Prisma with a Supabase Postgres database. The normal app
`DATABASE_URL` points at the Supabase **transaction pooler** on port `6543`
with `pgbouncer=true` — that pooler does not support DDL, so it can't be used
for migrations.

`schema.prisma` has `directUrl = env("SUPABASE_CONNECTION_STRING")` so prisma
picks up a migration-capable URL from env automatically. Set
`SUPABASE_CONNECTION_STRING` in `.env` to the Supabase **session pooler** URL
— same host as the transaction pooler but **port 5432** and no
`pgbouncer=true`. (The "direct connection" URL on `db.<ref>.supabase.co:5432`
also works but is IPv6-only on free tier, so the session pooler is the
reliable choice over IPv4.) The session-pooler URL is also in
`.env.staging.local` / `.env.production.local` for the respective databases.

Use `npm run prisma:migrate` (= `prisma migrate dev`) locally to create and
apply new migrations. It needs an interactive terminal — if you're scripting
or running in a non-TTY context, hand-write the migration SQL under
`prisma/migrations/<timestamp>_<name>/migration.sql` following the existing
style, then apply with `prisma migrate deploy`.

For applying migrations to staging/production (or any other non-interactive
context):

```bash
set -a; source .env.production.local; set +a
DATABASE_URL="$SUPABASE_CONNECTION_STRING" npx prisma migrate deploy
```

`migrate deploy` is idempotent — it applies any committed-but-unapplied
migrations and does nothing if everything is up to date. Use this in CI, on
prod cutovers, and after pulling a branch with new migrations.

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


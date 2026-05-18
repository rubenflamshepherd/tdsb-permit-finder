# Agent Notes

## Prisma Migrations

This project uses Prisma with a Supabase Postgres database. The normal app
`DATABASE_URL` points at the Supabase pooler on port `6543` with
`pgbouncer=true`.

Do not use the pooled URL for applying migrations. `prisma migrate dev` and
`prisma migrate deploy` can hang or fail against the pooler.

For remote migration application, use the direct Postgres port for that command
only:

```bash
DATABASE_URL="$(node -e 'const fs=require("fs"); const env=fs.readFileSync(".env","utf8"); const m=env.match(/^DATABASE_URL="?([^"\n]+)"?/m); if(!m) process.exit(1); const u=new URL(m[1]); u.port="5432"; u.searchParams.delete("pgbouncer"); process.stdout.write(u.toString())')" npx prisma migrate deploy
```

Use `npm run prisma:migrate` only when working against a local or otherwise
non-pooled development database.

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


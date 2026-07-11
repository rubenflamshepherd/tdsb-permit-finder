# Cloud SQL migration runbook

This runbook moves the application schema from Supabase PostgreSQL 17 to the
existing `scout-397801:us-central1:scout-db` Cloud SQL PostgreSQL 15 instance.
Only the `tdsb_finder` schema belongs to this application; Supabase-managed and
unrelated schemas must not be copied.

Because the target PostgreSQL major version is older than the source, do not
restore source DDL. Prisma creates the schema from the committed migrations on
PostgreSQL 15, and the migration transfers table data only. This keeps the
target DDL native to PostgreSQL 15 and gives the transfer a narrow, testable
compatibility surface.

## 1. Local prerequisites

The workstation needs Google Cloud CLI, Cloud SQL Auth Proxy, and PostgreSQL
client tools. Authenticate both gcloud and Application Default Credentials and
select the project:

```bash
gcloud config set project scout-397801
gcloud auth application-default set-quota-project scout-397801
```

Store the Supabase session-pooler URL in the ignored
`.env.production.local` file as `SOURCE_DATABASE_URL`. It must use port 5432.

## 2. Target layout

Create two fresh databases on `scout-db`:

- `tdsb_permit_finder_rehearsal`
- `tdsb_permit_finder_production`

Create these built-in PostgreSQL users with unique generated passwords:

- Rehearsal: `tdsb_rehearsal_app`, `tdsb_rehearsal_migrator`
- Production: `tdsb_prod_app`, `tdsb_prod_sync`, `tdsb_prod_migrator`

Create separate GCP connector service accounts for Vercel and GitHub Actions,
each with only `roles/cloudsql.client`. Their GCP identities authorize the
connector; the built-in PostgreSQL users authorize database operations.

Start the Cloud SQL Auth Proxy on an unused local port:

```bash
cloud-sql-proxy scout-397801:us-central1:scout-db --port 5433
```

Target migration URLs connect through that proxy and specify the existing app
schema:

```bash
REHEARSAL_TARGET_URL='postgresql://tdsb_rehearsal_migrator:ENCODED_PASSWORD@127.0.0.1:5433/tdsb_permit_finder_rehearsal?schema=tdsb_finder'
PRODUCTION_TARGET_URL='postgresql://tdsb_prod_migrator:ENCODED_PASSWORD@127.0.0.1:5433/tdsb_permit_finder_production?schema=tdsb_finder'
```

For each database, create the schema as its migrator before running Prisma:

```sql
CREATE SCHEMA tdsb_finder AUTHORIZATION CURRENT_USER;
```

Then build the target schema natively on PostgreSQL 15:

```bash
DATABASE_URL="$REHEARSAL_TARGET_URL" npx prisma migrate deploy
DATABASE_URL="$REHEARSAL_TARGET_URL" npx prisma migrate status
```

## 3. Capture and transfer app data

Record the source state using schema-qualified table names:

```sql
SELECT 'Facility' AS table_name, COUNT(*) FROM tdsb_finder."Facility"
UNION ALL SELECT 'SpaceType', COUNT(*) FROM tdsb_finder."SpaceType"
UNION ALL SELECT 'Space', COUNT(*) FROM tdsb_finder."Space"
UNION ALL SELECT 'Booking', COUNT(*) FROM tdsb_finder."Booking"
UNION ALL SELECT 'SpecialDate', COUNT(*) FROM tdsb_finder."SpecialDate"
UNION ALL SELECT 'SyncStatus', COUNT(*) FROM tdsb_finder."SyncStatus"
UNION ALL SELECT '_prisma_migrations', COUNT(*) FROM tdsb_finder."_prisma_migrations"
ORDER BY table_name;

SELECT MIN("startsAt"), MAX("startsAt"), MIN("lastSyncedAt"), MAX("lastSyncedAt")
FROM tdsb_finder."Booking";
```

Create a plain, data-only dump. Exclude `_prisma_migrations` because Prisma
already populated it while building the PostgreSQL 15 schema:

```bash
pg_dump \
  --dbname="$SOURCE_DATABASE_URL" \
  --data-only \
  --schema=tdsb_finder \
  --exclude-table=tdsb_finder._prisma_migrations \
  --no-owner \
  --no-acl \
  --file=/tmp/tdsb-data-pg17.sql
```

PostgreSQL 17 dumps emit a `transaction_timeout` setting that PostgreSQL 15
does not recognize. Remove only that session setting; do not rewrite table
data or DDL:

```bash
sed '/^SET transaction_timeout = 0;$/d' \
  /tmp/tdsb-data-pg17.sql > /tmp/tdsb-data-pg15.sql
```

Load with errors treated as fatal:

```bash
psql "$REHEARSAL_TARGET_URL" \
  -X \
  -v ON_ERROR_STOP=1 \
  --file=/tmp/tdsb-data-pg15.sql
```

This process is deliberately rehearsed before production. If any value or
COPY format proves incompatible, stop and adapt the transfer for that table;
never ignore restore errors.

## 4. Grants and validation

Run the following as the rehearsal migrator after loading data:

```sql
REVOKE CONNECT ON DATABASE tdsb_permit_finder_rehearsal FROM PUBLIC;
GRANT CONNECT ON DATABASE tdsb_permit_finder_rehearsal TO tdsb_rehearsal_app;
REVOKE CREATE ON SCHEMA tdsb_finder FROM PUBLIC;
GRANT USAGE ON SCHEMA tdsb_finder TO tdsb_rehearsal_app;
GRANT SELECT ON TABLE
  tdsb_finder."Facility",
  tdsb_finder."SpaceType",
  tdsb_finder."Space",
  tdsb_finder."Booking",
  tdsb_finder."SpecialDate",
  tdsb_finder."SyncStatus"
  TO tdsb_rehearsal_app;
ALTER DEFAULT PRIVILEGES FOR ROLE tdsb_rehearsal_migrator IN SCHEMA tdsb_finder
  GRANT SELECT ON TABLES TO tdsb_rehearsal_app;
```

Require exact source/target application-table counts, booking date bounds, sync
status values, and six successful Prisma migrations. Verify the app user can
read but cannot write or create objects. Then configure a protected Vercel
preview with:

- `CLOUD_SQL_INSTANCE_CONNECTION_NAME=scout-397801:us-central1:scout-db`
- `CLOUD_SQL_DATABASE=tdsb_permit_finder_rehearsal`
- `CLOUD_SQL_SCHEMA=tdsb_finder`
- `CLOUD_SQL_USER=tdsb_rehearsal_app`
- `CLOUD_SQL_PASSWORD`
- `CLOUD_SQL_POOL_MAX=2`
- `GCP_SERVICE_ACCOUNT_KEY_JSON`

Smoke-test the main search flow and all database-backed API routes.

## 5. Production cutover

1. Disable both scheduled GitHub Actions workflows and wait for active syncs.
2. Build the empty production schema with `tdsb_prod_migrator` and Prisma.
3. Take a fresh data-only dump from Supabase and perform the same one-line
   compatibility filtering used in rehearsal.
4. Load it into `tdsb_permit_finder_production` with `ON_ERROR_STOP=1`.
5. Apply the rehearsal grants with production names, granting the sync user
   `SELECT, INSERT, UPDATE, DELETE` on all six application tables and the app
   user `SELECT` only.
6. Repeat every count, date-range, migration, and privilege check.
7. Change Vercel production to the production database and app user, redeploy,
   and smoke-test.
8. Configure the GitHub `production` environment with the production database,
   `tdsb_prod_sync`, its password, and the GitHub connector key.
9. Manually dispatch inventory and booking syncs; re-enable schedules only
   after both pass.

Keep Supabase and the old deployment secrets unchanged for seven days. A
rollback restores the old Vercel and GitHub settings, redeploys, and refreshes
the current inventory and booking caches.

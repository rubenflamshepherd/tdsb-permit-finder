-- Backfill existing rows and enforce the Prisma-required scalar-list shape.
UPDATE "Booking"
SET "spaceIds" = '{}'::INTEGER[]
WHERE "spaceIds" IS NULL;

ALTER TABLE "Booking"
ALTER COLUMN "spaceIds" SET DEFAULT '{}'::INTEGER[],
ALTER COLUMN "spaceIds" SET NOT NULL;

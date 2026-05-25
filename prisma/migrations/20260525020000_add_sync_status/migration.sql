-- CreateTable
CREATE TABLE "SyncStatus" (
    "key" TEXT NOT NULL,
    "lastSuccessfulSyncAt" TIMESTAMP(3) NOT NULL,
    "summaryJson" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("key")
);

-- Backfill inventory status from existing per-row sync timestamps.
INSERT INTO "SyncStatus" ("key", "lastSuccessfulSyncAt", "summaryJson", "updatedAt")
SELECT 'inventory', MAX("lastSyncedAt"), NULL, CURRENT_TIMESTAMP
FROM (
    SELECT "lastSyncedAt" FROM "Facility"
    UNION ALL
    SELECT "lastSyncedAt" FROM "SpaceType"
    UNION ALL
    SELECT "lastSyncedAt" FROM "Space"
) "InventorySyncTimestamps"
HAVING COUNT(*) > 0;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Facility" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "suite" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "regionId" INTEGER,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "hoursJson" JSONB,
    "rawJson" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceType" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "requestByQty" BOOLEAN NOT NULL DEFAULT false,
    "rawJson" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" INTEGER NOT NULL,
    "facilityId" INTEGER NOT NULL,
    "spaceTypeId" INTEGER,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "isAvailableReg" BOOLEAN NOT NULL DEFAULT false,
    "hideFromPublic" BOOLEAN NOT NULL DEFAULT false,
    "hoursJson" JSONB,
    "rawJson" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "facilityId" INTEGER NOT NULL,
    "spaceId" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "statusId" INTEGER,
    "purpose" TEXT,
    "spacesLabel" TEXT,
    "rawJson" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialDate" (
    "id" TEXT NOT NULL,
    "facilityId" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "rawJson" JSONB NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Facility_name_idx" ON "Facility"("name");

-- CreateIndex
CREATE INDEX "Facility_latitude_longitude_idx" ON "Facility"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Space_facilityId_idx" ON "Space"("facilityId");

-- CreateIndex
CREATE INDEX "Space_spaceTypeId_idx" ON "Space"("spaceTypeId");

-- CreateIndex
CREATE INDEX "Space_hideFromPublic_isAvailable_idx" ON "Space"("hideFromPublic", "isAvailable");

-- CreateIndex
CREATE INDEX "Booking_facilityId_startsAt_endsAt_idx" ON "Booking"("facilityId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Booking_spaceId_startsAt_endsAt_idx" ON "Booking"("spaceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "SpecialDate_facilityId_startsOn_endsOn_idx" ON "SpecialDate"("facilityId", "startsOn", "endsOn");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_spaceTypeId_fkey" FOREIGN KEY ("spaceTypeId") REFERENCES "SpaceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialDate" ADD CONSTRAINT "SpecialDate_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_spaceId_fkey";

-- DropIndex
DROP INDEX "Booking_spaceId_startsAt_endsAt_idx";

-- AlterTable
ALTER TABLE "Booking" DROP COLUMN "spaceId",
ADD COLUMN     "spaceIds" INTEGER[];

-- CreateIndex
CREATE INDEX "Booking_spaceIds_idx" ON "Booking" USING GIN ("spaceIds");

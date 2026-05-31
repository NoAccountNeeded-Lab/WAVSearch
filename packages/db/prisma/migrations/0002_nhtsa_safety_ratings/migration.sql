-- DropIndex
DROP INDEX "recalls_nhtsaCampaignId_key";

-- CreateTable
CREATE TABLE "safety_ratings" (
    "id" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "nhtsaVehicleId" INTEGER NOT NULL,
    "description" TEXT,
    "overallRating" INTEGER,
    "frontCrashRating" INTEGER,
    "sideCrashRating" INTEGER,
    "rolloverRating" INTEGER,
    "rolloverRatingText" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "safety_ratings_nhtsaVehicleId_key" ON "safety_ratings"("nhtsaVehicleId");

-- CreateIndex
CREATE INDEX "safety_ratings_vehicleModelId_idx" ON "safety_ratings"("vehicleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_nhtsaCampaignId_vehicleModelId_key" ON "recalls"("nhtsaCampaignId", "vehicleModelId");

-- AddForeignKey
ALTER TABLE "safety_ratings" ADD CONSTRAINT "safety_ratings_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

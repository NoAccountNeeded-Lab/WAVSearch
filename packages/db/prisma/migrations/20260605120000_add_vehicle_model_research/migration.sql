-- CreateTable
CREATE TABLE "vehicle_model_research" (
    "id" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "researchVersion" INTEGER NOT NULL DEFAULT 1,
    "researchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_model_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_model_source" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_model_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_model_claim" (
    "id" TEXT NOT NULL,
    "researchId" TEXT NOT NULL,
    "sourceId" TEXT,
    "field" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_model_claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_model_research_vehicleModelId_researchVersion_key" ON "vehicle_model_research"("vehicleModelId", "researchVersion");

-- CreateIndex
CREATE INDEX "vehicle_model_research_vehicleModelId_idx" ON "vehicle_model_research"("vehicleModelId");

-- CreateIndex
CREATE INDEX "vehicle_model_source_researchId_idx" ON "vehicle_model_source"("researchId");

-- CreateIndex
CREATE INDEX "vehicle_model_claim_researchId_idx" ON "vehicle_model_claim"("researchId");

-- CreateIndex
CREATE INDEX "vehicle_model_claim_researchId_field_idx" ON "vehicle_model_claim"("researchId", "field");

-- AddForeignKey
ALTER TABLE "vehicle_model_research" ADD CONSTRAINT "vehicle_model_research_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_model_source" ADD CONSTRAINT "vehicle_model_source_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "vehicle_model_research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_model_claim" ADD CONSTRAINT "vehicle_model_claim_researchId_fkey" FOREIGN KEY ("researchId") REFERENCES "vehicle_model_research"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_model_claim" ADD CONSTRAINT "vehicle_model_claim_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "vehicle_model_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

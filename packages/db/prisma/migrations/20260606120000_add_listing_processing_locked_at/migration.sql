-- AlterTable
ALTER TABLE "listings" ADD COLUMN "processingLockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "listings_processingLockedAt_idx" ON "listings"("processingLockedAt");

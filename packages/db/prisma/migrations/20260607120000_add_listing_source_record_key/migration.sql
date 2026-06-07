-- AlterTable: add sourceRecordKey as nullable first so existing rows don't violate NOT NULL
ALTER TABLE "listings" ADD COLUMN "sourceRecordKey" TEXT;

-- Back-fill: use externalId when present, otherwise the sourceUrl (provenance key)
UPDATE "listings" SET "sourceRecordKey" = COALESCE("externalId", "sourceUrl");

-- Now enforce NOT NULL
ALTER TABLE "listings" ALTER COLUMN "sourceRecordKey" SET NOT NULL;

-- DropIndex: remove old unique constraint on (sourceId, externalId)
DROP INDEX "listings_sourceId_externalId_key";

-- CreateIndex: new unique constraint on (sourceId, sourceRecordKey)
CREATE UNIQUE INDEX "listings_sourceId_sourceRecordKey_key" ON "listings"("sourceId", "sourceRecordKey");

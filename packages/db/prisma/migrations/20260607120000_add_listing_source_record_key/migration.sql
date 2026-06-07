-- AlterTable: add sourceRecordKey as nullable first so existing rows don't violate NOT NULL
ALTER TABLE "listings" ADD COLUMN "sourceRecordKey" TEXT;

-- Back-fill: use externalId when present, otherwise the sourceUrl (provenance key)
UPDATE "listings" SET "sourceRecordKey" = COALESCE("externalId", "sourceUrl");

-- Now enforce NOT NULL
ALTER TABLE "listings" ALTER COLUMN "sourceRecordKey" SET NOT NULL;

-- Deduplicate rows that share the same (sourceId, sourceRecordKey) after back-fill.
-- The back-fill above can produce duplicates when externalId IS NULL and multiple rows
-- for the same source share the same sourceUrl (the exact shape from issue #220).
-- listing_price_history has ON DELETE RESTRICT on listingId, so price history rows must
-- be re-homed to the keeper before the duplicate listing rows can be deleted.

-- Step 1: Reassign price history from duplicate rows to the row we will keep (most recent
-- scrapedAt). This preserves price history across the merge.
WITH duplicates AS (
    SELECT id AS dup_id,
           FIRST_VALUE(id) OVER (
               PARTITION BY "sourceId", "sourceRecordKey"
               ORDER BY "scrapedAt" DESC NULLS LAST
           ) AS keeper_id
    FROM "listings"
)
UPDATE "listing_price_history"
SET "listingId" = d.keeper_id
FROM (SELECT dup_id, keeper_id FROM duplicates WHERE dup_id <> keeper_id) d
WHERE "listing_price_history"."listingId" = d.dup_id;

-- Step 2: Delete the now-unblocked duplicate listing rows.
DELETE FROM "listings"
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY "sourceId", "sourceRecordKey"
                   ORDER BY "scrapedAt" DESC NULLS LAST
               ) AS rn
        FROM "listings"
    ) ranked
    WHERE rn > 1
);

-- DropIndex: remove old unique constraint on (sourceId, externalId)
DROP INDEX "listings_sourceId_externalId_key";

-- CreateIndex: new unique constraint on (sourceId, sourceRecordKey)
CREATE UNIQUE INDEX "listings_sourceId_sourceRecordKey_key" ON "listings"("sourceId", "sourceRecordKey");

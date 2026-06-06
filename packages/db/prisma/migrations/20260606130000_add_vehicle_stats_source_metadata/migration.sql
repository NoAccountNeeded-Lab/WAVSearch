-- Add visible source metadata for vehicle stats.
-- Existing score fields remain nullable for backwards compatibility; values
-- should only be populated when backed by a public, linkable source.
ALTER TABLE "vehicle_stats"
ADD COLUMN "dataSourceName" TEXT,
ADD COLUMN "dataSourceUrl" TEXT,
ADD COLUMN "methodology" TEXT;

-- Clear pre-existing seeded values because they were not backed by public,
-- linkable source records. Future values must be populated with source metadata.
UPDATE "vehicle_stats"
SET
  "avgLifespanMiles" = NULL,
  "reliabilityScore" = NULL,
  "reliabilitySource" = NULL,
  "jdPowerScore" = NULL,
  "dataSourceName" = NULL,
  "dataSourceUrl" = NULL,
  "methodology" = 'No reliability or lifespan score is populated. WivWav does not calculate reliability scores or scrape commercial score providers; add values only with a public, linkable source.';

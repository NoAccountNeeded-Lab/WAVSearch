-- AlterTable
ALTER TABLE "listings" ADD COLUMN "vehicleModelMatchConfidence" TEXT;

-- Merge vehicle_model records that are identical after case-folding.
-- For each conflict group, keep MIN(id) as canonical, reroute all FKs, then delete the rest.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      MIN(id) AS keep_id,
      array_remove(array_agg(id ORDER BY id), MIN(id)) AS drop_ids
    FROM vehicle_models
    GROUP BY LOWER(make), LOWER(model), year, LOWER(COALESCE(trim, ''))
    HAVING COUNT(*) > 1
  LOOP
    UPDATE listings       SET "vehicleModelId" = rec.keep_id WHERE "vehicleModelId" = ANY(rec.drop_ids);
    UPDATE recalls        SET "vehicleModelId" = rec.keep_id WHERE "vehicleModelId" = ANY(rec.drop_ids);
    UPDATE complaints     SET "vehicleModelId" = rec.keep_id WHERE "vehicleModelId" = ANY(rec.drop_ids);
    UPDATE safety_ratings SET "vehicleModelId" = rec.keep_id WHERE "vehicleModelId" = ANY(rec.drop_ids);
    DELETE FROM vehicle_models WHERE id = ANY(rec.drop_ids);
  END LOOP;
END $$;

-- Normalize remaining vehicle_model records to lowercase.
UPDATE vehicle_models
SET
  make  = LOWER(make),
  model = LOWER(model),
  trim  = LOWER(trim)
WHERE make <> LOWER(make)
   OR model <> LOWER(model)
   OR (trim IS NOT NULL AND trim <> LOWER(trim));

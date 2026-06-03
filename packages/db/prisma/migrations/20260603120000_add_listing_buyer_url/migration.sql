ALTER TABLE "listings" ADD COLUMN "buyerUrl" TEXT;

UPDATE "listings" SET "buyerUrl" = "sourceUrl" WHERE "buyerUrl" IS NULL;

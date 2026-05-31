-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('active', 'paused', 'error', 'needs_remapping');

-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('rear_entry', 'side_entry', 'unknown');

-- CreateEnum
CREATE TYPE "RampType" AS ENUM ('in_floor', 'fold_out', 'fold_in', 'none', 'unknown');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('new', 'used', 'certified_pre_owned');

-- CreateEnum
CREATE TYPE "ListingSellerType" AS ENUM ('dealer', 'private');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'gone');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'active',
    "cronExpression" TEXT NOT NULL DEFAULT '0 */6 * * *',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "mappings" JSONB NOT NULL DEFAULT '[]',
    "fingerprintHash" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "listingCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "externalId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "trim" TEXT,
    "vin" TEXT,
    "condition" "ListingCondition" NOT NULL,
    "sellerType" "ListingSellerType" NOT NULL,
    "priceCents" INTEGER,
    "mileage" INTEGER,
    "color" TEXT,
    "fuelType" TEXT,
    "transmission" TEXT,
    "conversionType" "ConversionType" NOT NULL DEFAULT 'unknown',
    "conversionManufacturer" TEXT,
    "floorLoweringInches" DOUBLE PRECISION,
    "rampType" "RampType" NOT NULL DEFAULT 'unknown',
    "hasLift" BOOLEAN NOT NULL DEFAULT false,
    "handControls" BOOLEAN NOT NULL DEFAULT false,
    "transferSeat" BOOLEAN NOT NULL DEFAULT false,
    "wheelchairCapacity" INTEGER,
    "zip" TEXT,
    "city" TEXT,
    "state" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "vehicleModelId" TEXT,
    "dealerName" TEXT,
    "dealerPhone" TEXT,
    "dealerWebsite" TEXT,
    "images" TEXT[],
    "description" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "canonicalId" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "goneAt" TIMESTAMP(3),
    "listedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detailScrapedAt" TIMESTAMP(3),

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_price_history" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_pages" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "raw_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraper_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN,
    "listingsFound" INTEGER,
    "listingsNew" INTEGER,
    "listingsUpdated" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "scraper_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "trim" TEXT,
    "bodyType" TEXT,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" TEXT NOT NULL,
    "nhtsaCampaignId" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "remedy" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "nhtsaId" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "mileage" INTEGER,
    "crashInvolved" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "nmedaCertified" BOOLEAN NOT NULL DEFAULT false,
    "founded" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_products" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conversionType" "ConversionType" NOT NULL,
    "rampType" "RampType" NOT NULL,
    "floorLoweringInches" DOUBLE PRECISION,
    "msrpCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nmea_dealers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "qapCertified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nmea_dealers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_name_key" ON "sources"("name");

-- CreateIndex
CREATE INDEX "listings_sourceId_idx" ON "listings"("sourceId");

-- CreateIndex
CREATE INDEX "listings_sourceUrl_idx" ON "listings"("sourceUrl");

-- CreateIndex
CREATE INDEX "listings_vin_idx" ON "listings"("vin");

-- CreateIndex
CREATE INDEX "listings_isDuplicate_idx" ON "listings"("isDuplicate");

-- CreateIndex
CREATE INDEX "listings_state_idx" ON "listings"("state");

-- CreateIndex
CREATE INDEX "listings_make_model_idx" ON "listings"("make", "model");

-- CreateIndex
CREATE INDEX "listings_year_idx" ON "listings"("year");

-- CreateIndex
CREATE INDEX "listings_priceCents_idx" ON "listings"("priceCents");

-- CreateIndex
CREATE INDEX "listings_mileage_idx" ON "listings"("mileage");

-- CreateIndex
CREATE INDEX "listings_listedAt_idx" ON "listings"("listedAt");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_vehicleModelId_idx" ON "listings"("vehicleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "listings_sourceId_externalId_key" ON "listings"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "listing_price_history_listingId_recordedAt_idx" ON "listing_price_history"("listingId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "raw_pages_url_key" ON "raw_pages"("url");

-- CreateIndex
CREATE INDEX "raw_pages_sourceId_processedAt_idx" ON "raw_pages"("sourceId", "processedAt");

-- CreateIndex
CREATE INDEX "scraper_runs_sourceId_idx" ON "scraper_runs"("sourceId");

-- CreateIndex
CREATE INDEX "vehicle_models_make_model_idx" ON "vehicle_models"("make", "model");

-- CreateIndex
CREATE INDEX "vehicle_models_year_idx" ON "vehicle_models"("year");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_make_model_year_trim_key" ON "vehicle_models"("make", "model", "year", "trim");

-- CreateIndex
CREATE UNIQUE INDEX "recalls_nhtsaCampaignId_key" ON "recalls"("nhtsaCampaignId");

-- CreateIndex
CREATE INDEX "recalls_vehicleModelId_idx" ON "recalls"("vehicleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_nhtsaId_key" ON "complaints"("nhtsaId");

-- CreateIndex
CREATE INDEX "complaints_vehicleModelId_idx" ON "complaints"("vehicleModelId");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_brands_name_key" ON "conversion_brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_brands_slug_key" ON "conversion_brands"("slug");

-- CreateIndex
CREATE INDEX "conversion_products_brandId_idx" ON "conversion_products"("brandId");

-- CreateIndex
CREATE INDEX "nmea_dealers_state_idx" ON "nmea_dealers"("state");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_price_history" ADD CONSTRAINT "listing_price_history_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_products" ADD CONSTRAINT "conversion_products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "conversion_brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

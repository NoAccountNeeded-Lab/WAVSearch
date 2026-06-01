-- CreateTable
CREATE TABLE "vehicle_stats" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "avgLifespanMiles" INTEGER,
    "reliabilityScore" DOUBLE PRECISION,
    "reliabilitySource" TEXT,
    "jdPowerScore" DOUBLE PRECISION,
    "refreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_stats_make_model_idx" ON "vehicle_stats"("make", "model");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_stats_make_model_year_key" ON "vehicle_stats"("make", "model", "year");

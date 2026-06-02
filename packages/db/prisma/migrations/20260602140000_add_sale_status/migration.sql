-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('active', 'pending', 'sold');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "saleStatus" "SaleStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "listings" ADD COLUMN "soldAt" TIMESTAMP(3);

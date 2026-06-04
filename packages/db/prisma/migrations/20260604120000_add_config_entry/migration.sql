-- CreateEnum
CREATE TYPE "ConfigEntryType" AS ENUM ('string', 'number', 'boolean', 'json', 'secret');

-- CreateTable
CREATE TABLE "config_entry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "type" "ConfigEntryType" NOT NULL,
    "description" TEXT,
    "encryptedValue" TEXT,
    "hint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "config_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "config_entry_key_createdAt_idx" ON "config_entry"("key", "createdAt");

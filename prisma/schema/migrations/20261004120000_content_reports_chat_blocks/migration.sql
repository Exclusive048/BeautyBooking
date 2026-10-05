-- MOBILE-POLISH (App Store 1.2) — жалобы на контент и блокировка в переписке.
--
-- SQL сгенерирован `prisma migrate diff --from-schema-datamodel <схема до правки>
-- --to-schema-datamodel prisma/schema --script`, а не `npm run migrate:new`, по
-- той же причине, что у 20261003160000_mobile_push_devices: в рабочей копии нет
-- доступной dev-БД (а `migrate dev` на старой локальной базе потребовал бы
-- reset). Схема→схема diff не видит сырых объектов реестра
-- scripts/raw-sql-objects.mjs, поэтому `DROP INDEX` здесь нет и быть не должно.
--
-- Только аддитивно: три новых enum, два значения `AdminAuditAction`
-- (решение жалобы администратором), две новые таблицы. Существующие таблицы
-- не меняются.
--  · `ContentReport` — жалоба; `openKey` уникален, пока жалоба NEW (одна
--    открытая жалоба автора на цель), при решении обнуляется.
--  · `ChatBlock` — блок «человек → человек» в переписке, одна строка на пару
--    (`blockerUserId`, `blockedUserId`).

-- CreateEnum
CREATE TYPE "ContentReportTargetType" AS ENUM ('PROVIDER', 'REVIEW', 'PORTFOLIO_ITEM', 'CHAT', 'MODEL_OFFER');

-- CreateEnum
CREATE TYPE "ContentReportReason" AS ENUM ('SPAM', 'OFFENSIVE', 'FRAUD', 'INAPPROPRIATE_CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('NEW', 'RESOLVED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdminAuditAction" ADD VALUE 'CONTENT_REPORT_RESOLVED';
ALTER TYPE "AdminAuditAction" ADD VALUE 'CONTENT_REPORT_DISMISSED';

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "targetType" "ContentReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetProviderId" TEXT,
    "chatMessageId" TEXT,
    "reason" "ContentReportReason" NOT NULL,
    "comment" VARCHAR(1000),
    "status" "ContentReportStatus" NOT NULL DEFAULT 'NEW',
    "openKey" VARCHAR(200),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatBlock" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_openKey_key" ON "ContentReport"("openKey");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ContentReport_targetType_status_createdAt_idx" ON "ContentReport"("targetType", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ContentReport_targetType_targetId_idx" ON "ContentReport"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ContentReport_reporterUserId_createdAt_idx" ON "ContentReport"("reporterUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChatBlock_blockedUserId_idx" ON "ChatBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatBlock_blockerUserId_blockedUserId_key" ON "ChatBlock"("blockerUserId", "blockedUserId");

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


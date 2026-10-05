-- MOBILE-B2 — push-токены нативного приложения (FCM / APNs / RuStore).
--
-- SQL сгенерирован `prisma migrate diff --from-schema-datamodel <схема до правки>
-- --to-schema-datamodel prisma/schema --script`, а не `npm run migrate:new`, по
-- той же причине, что у 20261003150000_refresh_session_device_meta: локальная
-- dev-БД держит историю ДО MIGRATION-SQUASH-01, и `migrate dev` потребовал бы
-- reset (и применил бы миграции к БД) — без явного запроса владельца нельзя.
-- Схема→схема diff не видит сырых объектов реестра scripts/raw-sql-objects.mjs,
-- поэтому `DROP INDEX` здесь нет и быть не должно (гейт check:migration-drops).
--
-- Только CREATE: два новых enum и новая таблица, существующие таблицы не
-- меняются. Строка — одна установка приложения (`installationId` уникален);
-- `(provider, token)` уникален — один токен не может жить у двух установок.
-- `onDelete: Cascade` от UserProfile — профиль физически не удаляется
-- (анонимизация), строки чистит `deleteUserAccount`; каскад — страховка.

-- CreateEnum
CREATE TYPE "MobilePushProvider" AS ENUM ('FCM', 'APNS', 'RUSTORE');

-- CreateEnum
CREATE TYPE "MobilePushApnsEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateTable
CREATE TABLE "MobilePushDevice" (
    "id" TEXT NOT NULL,
    "installationId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionFamilyId" VARCHAR(64) NOT NULL,
    "provider" "MobilePushProvider" NOT NULL,
    "token" VARCHAR(1024) NOT NULL,
    "apnsEnvironment" "MobilePushApnsEnvironment",
    "platform" VARCHAR(16),
    "appVersion" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushDevice_installationId_key" ON "MobilePushDevice"("installationId");

-- CreateIndex
CREATE INDEX "MobilePushDevice_userId_sessionFamilyId_idx" ON "MobilePushDevice"("userId", "sessionFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "MobilePushDevice_provider_token_key" ON "MobilePushDevice"("provider", "token");

-- AddForeignKey
ALTER TABLE "MobilePushDevice" ADD CONSTRAINT "MobilePushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


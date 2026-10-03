-- MOBILE-AUTH-A — метаданные устройства у RefreshSession (мобильные сессии).
--
-- SQL сгенерирован `prisma migrate diff --from-schema-datamodel <схема до правки>
-- --to-schema-datamodel prisma/schema --script`, а не `npm run migrate:new`:
-- локальная dev-БД держит историю ДО MIGRATION-SQUASH-01 (`migrate status`:
-- «last common migration: null»), и `migrate dev` потребовал бы reset —
-- запрещён без явного запроса владельца. Схема→схема diff не видит сырых
-- объектов реестра scripts/raw-sql-objects.mjs, поэтому `DROP INDEX` здесь нет
-- и быть не должно (гейт check:migration-drops).
--
-- Только ADD: все новые колонки nullable, `clientType` — с константным
-- дефолтом (на PG 11+ без переписывания таблицы). Существующие строки
-- становятся WEB — до этой миграции других клиентов не было.

-- CreateEnum
CREATE TYPE "SessionClientType" AS ENUM ('WEB', 'MOBILE');

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN     "appVersion" VARCHAR(32),
ADD COLUMN     "clientType" "SessionClientType" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "deviceName" VARCHAR(100),
ADD COLUMN     "installationId" VARCHAR(64),
ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "platform" VARCHAR(16),
ADD COLUMN     "userAgent" VARCHAR(512);

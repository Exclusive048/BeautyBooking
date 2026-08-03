-- RKN-FIX-18 — отзыв согласия с сохранением истории.
--
-- Суть изменения: строки `UserConsent` больше НИКОГДА не оживляются.
-- Отзыв проставляет `revokedAt` (строка остаётся), повторное согласие
-- вставляет НОВУЮ строку. Прежний полный UNIQUE это запрещал и тем самым
-- вынуждал оживление, которое стирало доказательную историю (исходный
-- `agreedAt` и сам факт отзыва).
--
-- Замена: partial unique — «не более одной АКТИВНОЙ строки на
-- (userId, consentType, documentVersion)», отозванных сколько угодно.
-- Prisma partial unique не выражает, поэтому индекс живёт здесь, в сыром SQL,
-- и зарегистрирован в scripts/raw-sql-objects.mjs (вторая запись реестра).
--
-- NOTE (ручная правка — ТРЕТИЙ случай подряд): `prisma migrate dev` снова
-- дописал
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- Строка ЗДЕСЬ УДАЛЕНА. Это тот самый паттерн, ради которого в GATES-FIX-01
-- заведён гейт `npm run check:migration-drops`: без явного маркера
-- `-- ALLOW-DROP:` он теперь валит CI. Проверено после apply: HNSW на месте.

-- DropIndex
-- Намеренно: полный UNIQUE снимается, его заменяет partial unique ниже.
DROP INDEX "UserConsent_userId_consentType_documentVersion_key";

-- CreateIndex
CREATE INDEX "UserConsent_userId_consentType_documentVersion_idx" ON "UserConsent"("userId", "consentType", "documentVersion");

-- CreateIndex (raw SQL — Prisma не выражает partial unique)
-- Гарантия уровня БД: одна активная строка на цель+версию у пользователя.
-- Существующие данные ей удовлетворяют (проверено перед миграцией: 0 групп с
-- более чем одной активной строкой; отозванных строк на момент миграции нет).
CREATE UNIQUE INDEX "UserConsent_active_unique_idx"
    ON "UserConsent" ("userId", "consentType", "documentVersion")
    WHERE "revokedAt" IS NULL;

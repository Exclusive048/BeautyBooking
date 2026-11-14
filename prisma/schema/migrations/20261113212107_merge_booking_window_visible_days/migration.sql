-- BOOKING-WINDOW-MERGE (2026-11-14): «Сколько окошек вперёд» (`visibleSlotDays`)
-- слита с «Запись открыта вперёд» (`maxBookingDaysAhead`) — окошки видны ровно
-- на окно записи. Колонка `visibleSlotDays` остаётся (её больше никто не читает
-- и не пишет), удаление — VISIBLE-SLOT-DAYS-DROP.
--
-- `prisma migrate dev` дописал сюда `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx"`
-- — индекс pgvector живёт сырым SQL (реестр `scripts/raw-sql-objects.mjs`),
-- строка удалена при ревью, как и в прежних миграциях.

-- AlterTable
ALTER TABLE "Provider" ALTER COLUMN "maxBookingDaysAhead" SET DEFAULT 30;

-- Data: мастеру переносится меньшее из двух — клиент не увидит окошек дальше,
-- чем видел раньше. Студии `visibleSlotDays` не читали никогда — не трогаем.
UPDATE "Provider"
SET "maxBookingDaysAhead" = GREATEST(1, "visibleSlotDays")
WHERE "type" = 'MASTER'
  AND "visibleSlotDays" < "maxBookingDaysAhead";

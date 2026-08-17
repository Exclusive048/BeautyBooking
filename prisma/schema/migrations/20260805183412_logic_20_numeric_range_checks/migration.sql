-- LOGIC-20 — CHECK-констрейнты на числовые бизнес-диапазоны.
--
-- Диапазоны держались ИСКЛЮЧИТЕЛЬНО на Zod и ручных проверках в коде. Сегодня
-- все пути записи валидируют, поэтому эксплуатируемого дефекта нет; проблема в
-- том, что защита существует ровно там, где кто-то её написал: новый путь
-- записи, миграция данных или сид сохранят отрицательную цену или нулевую
-- длительность без единого возражения БД. Тот же класс, что инв. #35/#38 —
-- инвариант, живущий только в приложении.
--
-- Prisma не выражает CHECK в датамодели (нет `@db.Check` на 6.19.x). Проверено
-- эмпирически (пробная `migrate dev --create-only` на неизменной датамодели):
-- diff-движок check-констрейнты ИГНОРИРУЕТ — в отличие от hnsw-индекса, их DROP
-- в новые миграции не дописывается, то есть ловушка «снять строку руками» не
-- размножается. Именно поэтому имена всё равно внесены в реестр
-- scripts/raw-sql-objects.mjs: раз Prisma их не видит, её гейты сами по себе
-- ничего о них не скажут, и дроп такого констрейнта прошёл бы незамеченным —
-- ловит его `check:migration-drops`, который читает реестр.
--
-- ⚠️ Прод: ADD CONSTRAINT ... CHECK проверяет существующие строки и упадёт при
-- нарушениях. Инвентарные запросы — в DEPLOY-BACKLOG.md. На dev-базе нарушений
-- ноль (проверено перед созданием миграции).
--
-- Границы выбраны НЕ шире прикладных, чтобы констрейнт не смог отвергнуть то,
-- что приложение считает валидным:
--   • priceSnapshot >= 0            — цена в копейках; ноль легитимен (бесплатная услуга)
--   • durationSnapshotMin > 0       — услуга нулевой длительности не бронируема
--   • rating BETWEEN 1 AND 5        — шкала отзыва (reviews/service.ts)
--   • bufferBetweenBookingsMin 0..30 — ровно потолок normalizeBufferMinutes (booking-core.ts)

ALTER TABLE "BookingServiceItem"
  ADD CONSTRAINT "BookingServiceItem_priceSnapshot_nonnegative_check"
  CHECK ("priceSnapshot" >= 0);

ALTER TABLE "BookingServiceItem"
  ADD CONSTRAINT "BookingServiceItem_durationSnapshotMin_positive_check"
  CHECK ("durationSnapshotMin" > 0);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range_check"
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "Provider"
  ADD CONSTRAINT "Provider_bufferBetweenBookingsMin_range_check"
  CHECK ("bufferBetweenBookingsMin" BETWEEN 0 AND 30);

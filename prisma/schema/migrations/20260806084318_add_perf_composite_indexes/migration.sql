-- PERF-09. Prisma дописала сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` — она делает это в КАЖДУЮ новую
-- миграцию, потому что тип индекса `hnsw` из pgvector в датамодели не
-- выражается (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Строка снята вручную; применённый DROP молча
-- превратил бы ANN-поиск visual-search в seq-scan, без единой ошибки.
-- Шестой случай подряд: `migrate dev` успевает применить его к dev-БД до
-- ревью, поэтому индекс пересоздан отдельной командой (см. отчёт).
--
-- Пять композитных индексов ниже — позиции I-1, I-2, I-3, I-6, I-7 из
-- AUDIT-FRESH-04. Каждый закрывает разрыв «фильтр по индексу, сортировка
-- поверх всего набора» на экране, который пользователь открывает первым в
-- своей роли. Существующие однополевые индексы намеренно НЕ удалены: их
-- удаление — самостоятельный `DROP` со своей ценой ошибки, а не побочный
-- эффект добавления.
--
-- ⚠️ Прод: `CREATE INDEX` берёт SHARE-lock и блокирует запись в таблицу на
-- время сборки. `Booking`, `Provider` и `Review` — горячие. Инструкция и
-- вариант с `CONCURRENTLY` — в DEPLOY-BACKLOG.md.

-- CreateIndex
CREATE INDEX "Booking_masterProviderId_startAtUtc_idx" ON "Booking"("masterProviderId", "startAtUtc");

-- CreateIndex
CREATE INDEX "Booking_clientUserId_startAtUtc_idx" ON "Booking"("clientUserId", "startAtUtc" DESC);

-- CreateIndex
CREATE INDEX "Booking_studioId_startAtUtc_idx" ON "Booking"("studioId", "startAtUtc" DESC);

-- CreateIndex
CREATE INDEX "Provider_cityId_isPublished_ratingAvg_reviews_createdAt_idx" ON "Provider"("cityId", "isPublished", "ratingAvg" DESC, "reviews" DESC, "createdAt" DESC);

-- I-7 — ЧАСТИЧНЫЙ индекс, поэтому сырым SQL (Prisma частичные индексы не
-- выражает; имя внесено в scripts/raw-sql-objects.mjs).
--
-- Форма, предложенная аудитом — `(targetType, targetId, deletedAt, createdAt)`
-- обычным `@@index` — сортировку НЕ убирает. Проверено EXPLAIN'ом на dev-БД
-- (`enable_seqscan=off, enable_sort=off`, конкурирующий индекс временно снят):
-- план остаётся `Index Scan … -> Sort (Sort Key: "createdAt" DESC)`. Причина в
-- том, что Postgres принимает `deletedAt IS NULL` как условие индекса, но не
-- считает его равенством, сохраняющим порядок по следующей колонке ключа. С
-- частичным индексом `Sort` из плана исчезает совсем.
--
-- Предикат дословно повторяет ACTIVE_REVIEW_FILTER (src/lib/reviews/soft-delete.ts,
-- инвариант #17): разойтись им нельзя — при расхождении индекс просто перестанет
-- подхватываться, молча.
CREATE INDEX "Review_active_target_createdAt_idx"
    ON "Review"("targetType", "targetId", "createdAt" DESC)
    WHERE "deletedAt" IS NULL;

-- FIX-B16 — durable суточный счётчик платных AI-вызовов.
--
-- Потолок расходов не может жить в Redis: там он обнуляется рестартом процесса
-- и умножается на число процессов при memory-fallback, то есть верхней границы
-- расходов не задаёт вовсе. PK — составной (meter, dayKey), поэтому инкремент
-- выражается одним атомарным UPSERT'ом без отдельного уникального индекса.
--
-- ⚠️ Сгенерированный `prisma migrate dev` файл содержал ВОСЬМОЕ по счёту
-- предложение `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx"` — снято
-- вручную при ревью. Индекс не выражается в датамодели (pgvector HNSW, реестр
-- `scripts/raw-sql-objects.mjs`), и его применение молча превратило бы
-- ANN-поиск visual-search в seq-scan.

-- CreateTable
CREATE TABLE "AiSpendCounter" (
    "meter" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSpendCounter_pkey" PRIMARY KEY ("meter","dayKey")
);

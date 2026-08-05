-- LOGIC-19. Prisma дописала сюда `DROP INDEX
-- "media_asset_embeddings_embedding_hnsw_idx"` — она делает это в КАЖДУЮ новую
-- миграцию, потому что тип индекса `hnsw` из pgvector в датамодели не
-- выражается (реестр — scripts/raw-sql-objects.mjs, гейт —
-- check:migration-drops). Строка снята вручную; применённый DROP молча
-- превратил бы ANN-поиск visual-search в seq-scan, без единой ошибки.
-- Пятый случай подряд: `migrate dev` успевает применить его к dev-БД до
-- ревью, поэтому индекс здесь же и пересоздаётся (см. отчёт).

-- AddForeignKey
ALTER TABLE "TimeBlock" ADD CONSTRAINT "TimeBlock_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

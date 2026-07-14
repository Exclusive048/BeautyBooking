-- VISUAL-SEARCH-YANDEX-MIGRATION-01 (Variant A — full Yandex; SPIKE-02 verdict).
--
-- Reduce the visual-search embedding dimension 1536 -> 256. Yandex
-- `text-search-doc` / `text-search-query` emit 256 dims natively (confirmed on
-- fact by the spike). Any vectors already present were produced by the OpenAI
-- 1536-dim embedder and are structurally invalid after this change, so they are
-- deleted here; the backfill (scripts/backfill-visual-embeddings.ts) re-embeds
-- every portfolio asset with the new provider before the feature is enabled.
--
-- Harmless today — the table holds 0 rows in all known environments — but the
-- DELETE also makes the ALTER safe on a non-empty column and enforces the
-- invariant "no stale-dimension vectors survive a dimension change".
DELETE FROM "media_asset_embeddings";

ALTER TABLE "media_asset_embeddings"
    ALTER COLUMN "embedding" TYPE public.vector(256);

-- F2: approximate-nearest-neighbour index on the new-dimension column. Cosine
-- ops class matches the `<=>` operator the searcher uses. The table is empty at
-- migration time so the build is free. Requires pgvector >= 0.5.0 (hnsw); the
-- project image is pgvector/pgvector:pg16, which satisfies this.
CREATE INDEX "media_asset_embeddings_embedding_hnsw_idx"
    ON "media_asset_embeddings"
    USING hnsw ("embedding" public.vector_cosine_ops);

-- SOCIAL-TG-MAX: ссылки на канал мастера/студии в Telegram и MAX (как socialVk / socialInstagram).
-- Только ADD COLUMN (nullable, без значения по умолчанию) — строки не переписываются.
-- Prisma дописывал сюда DROP INDEX "media_asset_embeddings_embedding_hnsw_idx" —
-- снят вручную: сырой объект реестра scripts/raw-sql-objects.mjs.

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "socialMax" TEXT,
ADD COLUMN     "socialTelegram" TEXT;

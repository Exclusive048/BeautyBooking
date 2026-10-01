-- WELCOME-DIALOG-01: отметка «приветствие этапа тестирования закрыто».
-- `DROP INDEX "media_asset_embeddings_embedding_hnsw_idx"`, который дописал
-- `migrate dev`, снят руками: индекс живёт сырым SQL (реестр
-- scripts/raw-sql-objects.mjs), Prisma его не выражает.

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "welcomeSeenAt" TIMESTAMP(3);

-- Данные: окно — для НОВЫХ регистраций. Уже существующим аккаунтам ставится
-- текущий момент, иначе приветствие «после регистрации» получили бы все разом.
UPDATE "UserProfile" SET "welcomeSeenAt" = CURRENT_TIMESTAMP WHERE "welcomeSeenAt" IS NULL;

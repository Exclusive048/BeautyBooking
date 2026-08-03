/*
  Warnings:

  - You are about to drop the column `accessToken` on the `VkLink` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `VkLink` table. All the data in the column will be lost.
  - You are about to drop the column `accessToken` on the `YandexLink` table. All the data in the column will be lost.
  - You are about to drop the column `refreshToken` on the `YandexLink` table. All the data in the column will be lost.

  Intentional: RKN-FIX-12 stops persisting third-party OAuth tokens. The audit
  found them write-only (the OAuth callback fetches the profile with the FRESH
  token from the code exchange, never from the DB), so no read path is broken
  and no data needs migrating anywhere — the values are simply gone. Re-linking
  is unaffected; the identity columns (vkUserId / yandexUserId) and deviceId
  stay.
*/
-- NOTE (manual edit, RKN-FIX-12): `prisma migrate dev` also emitted
--   DROP INDEX "media_asset_embeddings_embedding_hnsw_idx";
-- which has been REMOVED here. That index is created in raw SQL by
-- 20260713120000_reduce_embedding_dimensions_yandex on an
-- `Unsupported("vector(256)")` column; Prisma cannot represent it in the
-- datamodel, so every `migrate dev` re-proposes dropping it. Applying it would
-- silently degrade visual-search ANN lookups to a sequential scan. Unrelated to
-- this change — see the VECTOR-INDEX-DRIFT backlog item.

-- AlterTable
ALTER TABLE "VkLink" DROP COLUMN "accessToken",
DROP COLUMN "refreshToken";

-- AlterTable
ALTER TABLE "YandexLink" DROP COLUMN "accessToken",
DROP COLUMN "refreshToken";

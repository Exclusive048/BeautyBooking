-- STUDIO-PORTFOLIO-FEED (2026-09-24): фото из портфолио студии попадают в ленту
-- и истории от имени студии (строка PortfolioItem с masterId = Provider студии),
-- а подпись «мастер · услуга» берёт исполнителя отсюда. Аддитивно: новая
-- nullable-колонка, индекс и FK с SET NULL — существующие строки не трогаются.
-- Строки для уже загруженных фото студий досоздаёт `npm run deploy:post`
-- (`syncStudioPortfolioItems`, идемпотентно), а не эта миграция: правило
-- «какое фото студии идёт в ленту» живёт в одном месте — в коде.

-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "performerId" TEXT;

-- CreateIndex
CREATE INDEX "PortfolioItem_performerId_idx" ON "PortfolioItem"("performerId");

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

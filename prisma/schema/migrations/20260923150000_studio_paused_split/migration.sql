-- STUDIO-PAUSE-SPLIT-01 (2026-09-23) — пауза мастера в студии отдельно от его
-- личной видимости.
--
-- До этого администратор студии ставил мастера на паузу записью
-- `Provider.isPublished = false` — того же флага, что управляет личной страницей
-- мастера и его карточкой в каталоге. Мастер студии, продающий свои услуги с
-- личной страницы (STUDIO-MASTER-OWN-BOOKINGS-01), от паузы в студии пропадал
-- целиком: страница отвечала 404, запись по ней закрывалась.
--
-- Теперь «активен в студии» = `ownerUserId IS NOT NULL AND NOT studioPaused`,
-- а `isPublished` — только желание мастера быть видимым.

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "studioPaused" BOOLEAN NOT NULL DEFAULT false;

-- Существующая пауза в студии переезжает в новый флаг. Личная видимость таким
-- мастерам включается — это решение владельца VISIBILITY-DEFAULT-01 («всем
-- существующим включить видимость»), которое для мастеров студий откладывалось
-- ровно потому, что их `isPublished` означал паузу. Приглашённые, но не
-- принявшие (`ownerUserId IS NULL`), не трогаются: их заготовка скрыта и
-- активной не считается и так.
UPDATE "Provider"
SET "studioPaused" = true,
    "isPublished" = true
WHERE "type" = 'MASTER'
  AND "studioId" IS NOT NULL
  AND "ownerUserId" IS NOT NULL
  AND "isPublished" = false;

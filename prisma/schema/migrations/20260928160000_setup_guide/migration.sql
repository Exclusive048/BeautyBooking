-- SETUP-GUIDE-01 (2026-09-28): «Первые шаги» кабинета мастера и студии.
-- Аддитивно: две колонки с NULL.

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "setupGuideHiddenAt" TIMESTAMP(3),
ADD COLUMN     "setupRulesConfirmedAt" TIMESTAMP(3);

-- Данные: кабинеты, заведённые до «Первых шагов», уже работают со своими
-- правилами записи — шаг «Правила записи» у них считается пройденным, чтобы
-- проводник не звал их проверять то, чем они пользуются. Новые кабинеты
-- рождаются с NULL и проходят шаг.
UPDATE "Provider" SET "setupRulesConfirmedAt" = CURRENT_TIMESTAMP;

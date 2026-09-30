-- SCHEDULE-PATTERNS-01 (этап 3, 2026-09-28): календарь на 3 месяца и палитра
-- рабочих дней. Аддитивно: колонка с `NULL` и новое значение enum'а.

-- Напоминание «настроенное расписание скоро кончится» (автопродление выключено).
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SCHEDULE_ENDING';

-- Имя рабочего дня в палитре; `NULL` — палитра подписывает день часами.
-- AlterTable
ALTER TABLE "ScheduleTemplate" ADD COLUMN     "label" VARCHAR(40);

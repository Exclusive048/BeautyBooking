-- SCHEDULE-STUDIO-PROFILE-CALENDAR (2026-09-28): «расписание мастера в студии
-- скоро закончится» — владельцу студии. Отдельный студийный тип, чтобы
-- напоминание жило в центре уведомлений студии, а не в кабинете мастера
-- владельца (там читается `SCHEDULE_ENDING`). Аддитивно.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_SCHEDULE_ENDING';

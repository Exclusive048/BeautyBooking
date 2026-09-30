-- 29.09 доработки · 04 (решение владельца 2026-09-29): уведомление мастеру
-- «студия исключила вас из команды». Аддитивно: одно новое значение enum.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_MEMBER_REMOVED';

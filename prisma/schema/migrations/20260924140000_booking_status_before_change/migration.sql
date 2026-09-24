-- RESCHEDULE-DECLINE-RESTORE-STATUS (2026-09-24, решение владельца): статус записи
-- до входа в согласование переноса. Отказ от переноса возвращает его, а не
-- безусловный CONFIRMED. Аддитивно: nullable-колонка, существующие строки не
-- трогаются (null = прежнее поведение).

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "statusBeforeChange" "BookingStatus";

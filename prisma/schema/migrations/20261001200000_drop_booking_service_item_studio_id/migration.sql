-- BOOKING-SERVICE-ITEM-STUDIO-ID (2026-10-01): колонку не читал ни один запрос,
-- а писалась она непоследовательно (на dev 8 из 174 строк расходились со
-- `studioId` своей брони). Скоуп студии у записи — `Booking.studioId` (инв. #45),
-- позиция записи к студии не привязывается. Данные колонки — денормализованная
-- копия, восстановимая из брони; снимок БД перед миграцией делает деплой.

-- DropForeignKey
ALTER TABLE "BookingServiceItem" DROP CONSTRAINT "BookingServiceItem_studioId_fkey";

-- DropIndex
DROP INDEX "BookingServiceItem_studioId_idx";

-- AlterTable
ALTER TABLE "BookingServiceItem" DROP COLUMN "studioId";

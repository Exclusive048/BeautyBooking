import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

/**
 * Гонка двух записей на одно время, проигранная на коммите, — это отказ
 * «время занято» (409), а не 500: Serializable-транзакция (инв. #31) отдаёт
 * `P2034`, уникальный индекс — `P2002`. Единственная копия: раньше функция
 * жила тремя дословными копиями (`createBooking`, `createClientBooking`,
 * `package-booking`), а ручная запись мастера и подтверждение модель-оффера
 * не маппили гонку вовсе и отвечали 500 (BOOKING-FLOW-AUDIT-RESIDUALS).
 */
export function mapPrismaBookingConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new AppError(
        "Это время уже занято. Пожалуйста, выберите другое окошко.",
        409,
        "BOOKING_CONFLICT",
      );
    }
  }
  return null;
}

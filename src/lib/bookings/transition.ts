import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingDbClient } from "@/lib/bookings/booking-transaction";

/**
 * FIX-C6: `BookingDbClient` — надтип обычного клиента, поэтому прежние
 * вызывающие (`prisma`, сырой `Prisma.TransactionClient` на пути отмены пакета)
 * проходят как раньше, а транзакции booking-домена (`BookingTx`) — тоже.
 * Сузить его до `BookingTx` нельзя: отмена пакета идёт под обычной изоляцией
 * осознанно (там нет проверки конфликта, которую надо серилизовать).
 */
type DbClient = BookingDbClient | typeof prisma;

/**
 * LOGIC-02 — оптимистическая блокировка перехода статуса брони.
 *
 * Все пять переходов были устроены одинаково: сначала read статуса, потом
 * БЕЗУСЛОВНЫЙ `update` по одному `id`. Между этими двумя шагами статус мог
 * измениться кем угодно, и запись затирала чужой переход.
 *
 * Гонки в миллисекунды для этого не нужно. Достаточно, чтобы вкладка мастера
 * была отрендерена до отмены: клиент жмёт «Отменить», мастер — «Подтвердить»,
 * и отменённая бронь возвращается в `CONFIRMED`. Хуже того, строка остаётся
 * внутренне противоречивой: `confirm` не чистит `cancelledAtUtc`/`cancelledBy`,
 * то есть аналитика посчитает её и отменённой, и подтверждённой.
 *
 * ⚠️ Serializable сам по себе это НЕ закрывает: транзакция `confirmBooking`
 * читает другие брони и TimeBlock'и, но не строку самой брони (её прочитали
 * снаружи и раньше), поэтому read-write-зависимости со строкой нет и SSI не
 * находит цикла.
 *
 * Guard — **наблюдённый** статус, а не заново выведенный список допустимых:
 * «строка должна быть в том состоянии, которое я провалидировал». Список
 * пришлось бы держать в синхроне с валидацией на каждом из пяти путей, и он бы
 * разошёлся; наблюдённый статус разойтись не может по построению.
 */
export const BOOKING_STATUS_CHANGED_MESSAGE =
  "Запись уже изменилась. Обновите страницу.";

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export async function applyBookingTransition<S extends Prisma.BookingSelect>(
  db: DbClient,
  input: {
    id: string;
    /** Статус, прочитанный и провалидированный вызывающим до этого вызова. */
    expectedStatus: BookingStatus;
    /**
     * Дополнительные поля, значения которых вызывающий прочитал снаружи и от
     * которых зависит ЗАПИСЫВАЕМОЕ им значение. Нужны там, где переход не
     * меняет статус или переносит наружные данные внутрь: подтверждение
     * переноса берёт время из `proposedStartAt`, а встречное предложение с
     * другой стороны меняет это поле, НЕ меняя статус (`CHANGE_REQUESTED` →
     * `CHANGE_REQUESTED`) — одного статуса для такого случая мало.
     */
    expectAlso?: Pick<
      Prisma.BookingWhereInput,
      "proposedStartAt" | "proposedEndAt" | "actionRequiredBy"
    >;
    data: Prisma.BookingUpdateInput;
    select: S;
  },
): Promise<Prisma.BookingGetPayload<{ select: S }>> {
  try {
    return (await db.booking.update({
      // Фильтр по не-уникальному полю рядом с уникальным: Prisma отдаёт P2025,
      // если строка есть, но условию не удовлетворяет, — ровно нужная семантика
      // «кто-то успел раньше».
      where: { id: input.id, status: input.expectedStatus, ...(input.expectAlso ?? {}) },
      data: input.data,
      select: input.select,
    })) as Prisma.BookingGetPayload<{ select: S }>;
  } catch (error) {
    if (isRecordNotFound(error)) {
      throw new AppError(BOOKING_STATUS_CHANGED_MESSAGE, 409, "BOOKING_STATUS_CHANGED");
    }
    throw error;
  }
}

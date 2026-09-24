import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { blockingBookingWhere } from "@/lib/deletion/active-bookings";

/**
 * STUDIO-LEAVE-GUARD (2026-09-24, решение владельца) — мастер не уходит из
 * студии и студия не исключает мастера, пока у него есть живые записи СТУДИИ.
 *
 * Раньше отвязка проходила молча: записи оставались на мастере, которого в
 * студии больше нет, — журнал студии их показывал, а перенести было не на кого
 * и нечем (мастер вне команды не выбирается), клиент приходил к человеку,
 * который здесь уже не работает. Теперь такие записи сначала надо перенести на
 * другого мастера или отменить.
 *
 * «Живая» — тот же предикат, что блокирует удаление кабинетов
 * (`blockingBookingWhere`, DELETION-03): одно правило на «запись ещё впереди».
 * «Студийная» — видимая журналу студии: `studioId` этой студии либо её
 * провайдер (как `countBlockingStudioBookings`). Личные записи мастера с его
 * собственной страницы (`studioId = null`, STUDIO-MASTER-OWN-BOOKINGS-01) уход
 * не блокируют — они уходят вместе с мастером.
 *
 * Путей отвязки четыре, и все зовут этот модуль: уход мастера и исключение
 * администратором (`transferMasterOutOfStudio`), `detachMasterFromStudio`
 * (`DELETE /api/studios/[id]/masters`) и `POST /api/studios/[id]/leave`.
 * Сторож полноты — `leave-guard.test.ts`.
 */

type BookingCounter = { booking: { count: (args: { where: Prisma.BookingWhereInput }) => Promise<number> } };

export type StudioLeaveActor = "MASTER" | "STUDIO";

export function studioMasterBlockingBookingsWhere(
  studioProviderId: string,
  masterProviderIds: string[],
  now: Date = new Date(),
): Prisma.BookingWhereInput {
  return {
    AND: [
      blockingBookingWhere(now),
      { masterProviderId: { in: masterProviderIds } },
      { OR: [{ studio: { providerId: studioProviderId } }, { providerId: studioProviderId }] },
    ],
  };
}

/**
 * Отказ, если у мастера есть живые записи студии; `null` — уходить можно.
 * Возвращает, а не бросает: вызывающие отвечают в трёх разных формах
 * (исключение в транзакции, `Result`, прямой `fail`).
 */
export async function findStudioLeaveBlock(
  db: BookingCounter,
  input: { studioProviderId: string; masterProviderIds: string[]; actor: StudioLeaveActor; now?: Date },
): Promise<AppError | null> {
  if (input.masterProviderIds.length === 0) return null;
  const count = await db.booking.count({
    where: studioMasterBlockingBookingsWhere(input.studioProviderId, input.masterProviderIds, input.now),
  });
  if (count === 0) return null;
  const message =
    input.actor === "MASTER"
      ? `У вас есть будущие записи в студии (${count}). Попросите администратора студии перенести их на другого мастера или отменить — после этого можно будет выйти из студии.`
      : `У мастера есть будущие записи в студии (${count}). Перенесите их на другого мастера или отмените — после этого мастера можно будет удалить из студии.`;
  return new AppError(message, 409, "MASTER_HAS_STUDIO_BOOKINGS", { count });
}

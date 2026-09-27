import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

/**
 * STUDIO-HIDDEN-MASTER-SERVICES — решение владельца 2026-09-23: СКРЫТАЯ студия
 * (`isPublished = false`) записей не принимает. Её мастера принимают только
 * личные записи — на СВОИ услуги из своего кабинета мастера; студийные услуги
 * через них не продаются ни на одной поверхности. «По-другому никак».
 *
 * До этого решения скрытая студия пропадала из каталога и её страница отвечала
 * 404, но её мастер без своих услуг оставался в каталоге с карточкой из
 * студийных услуг, личная страница продавала их, а ядро записи бронь проводило.
 *
 * Правило одно на три слоя:
 *  - запросы (список провайдеров, поиск) — `STUDIO_ACCEPTS_BOOKINGS_WHERE`;
 *  - витрина в памяти (страница мастера: ссылка «через студию») —
 *    `studioAcceptsBookings`;
 *  - запись — `studioAcceptsBookings` в ядре записи (`resolveBookingCore`) и
 *    `assertStudioAcceptsBookings` в ручной записи студии.
 *
 * STUDIO-MASTER-PROFILES (решение владельца 2026-09-27): студийные услуги через
 * мастера не продаются больше НИКОГДА (услуги профилей не смешиваются), поэтому
 * студийных веток каталога, карточки и поиска по времени нет вовсе, а ядро
 * записи отклоняет студийную услугу на профиле мастера независимо от видимости
 * студии.
 *
 * Существующие записи не затрагиваются: перенос, подтверждение и отмена идут
 * как прежде — отказ стоит только на создании новой записи.
 */
export const STUDIO_ACCEPTS_BOOKINGS_WHERE = { isPublished: true } satisfies Prisma.ProviderWhereInput;

export function studioAcceptsBookings(studio: { isPublished: boolean } | null | undefined): boolean {
  return Boolean(studio?.isPublished);
}

export const STUDIO_NOT_ACCEPTING_MESSAGE = "Студия сейчас не принимает записи.";

/**
 * Отказ в новой записи на услугу скрытой студии. `message` — для кабинета
 * студии, где отказ действенный («включите видимость»); клиенту — общий текст.
 */
export async function assertStudioAcceptsBookings(
  studioProviderId: string,
  message: string = STUDIO_NOT_ACCEPTING_MESSAGE,
): Promise<void> {
  const studio = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { isPublished: true },
  });
  if (!studioAcceptsBookings(studio)) {
    throw new AppError(message, 409, "STUDIO_NOT_ACCEPTING_BOOKINGS");
  }
}

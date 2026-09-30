import type { Prisma } from "@prisma/client";

/**
 * Скоуп записей студии — одно написание (29.09 доработки · 08,
 * BOOKING-SCOPE-OR-COLLAPSE, инв. #45).
 *
 * Показывает = разрешает = `Booking.studioId`. Раньше списки студии брали
 * `OR: [{ studioId }, { providerId: studio.providerId }]`, а право на действие —
 * только `{ id, studioId }` (`studio/tenancy.ts`): строка с пустым `studioId` у
 * записи с поверхности студии была видна, но неуправляема (SMOKE-01 · F1).
 * С FIX-C1 `studioId` выводит единственный writer `createBookingRow` из
 * поверхности, данные выровнены миграцией `…_booking_studio_id_backfill`, а
 * дрейф колонки мимо writer'а ловит `deploy:post` (`reportBookingStudioScopeDrift`).
 *
 * Параметр — `string`, не optional: `{ studioId: undefined }` дал бы Prisma
 * пустое условие, то есть все записи платформы (класс FIX-7).
 */
export function studioBookingsWhere(studioId: string): Prisma.BookingWhereInput {
  return { studioId };
}

/**
 * То же правило для вызывающих, у которых на руках `Provider.id` студии, а не
 * `Studio.id` (уход мастера из студии): связь `studio` — это и есть `studioId`.
 */
export function studioBookingsWhereByProvider(studioProviderId: string): Prisma.BookingWhereInput {
  return { studio: { providerId: studioProviderId } };
}

/** Запись поверхности студии — то же правило в памяти. */
export function isStudioSurfaceBooking(booking: { studioId: string | null }, studioId: string): boolean {
  return booking.studioId === studioId;
}

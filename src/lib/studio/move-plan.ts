import { AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/access";
import { requireProviderOwner } from "@/lib/auth/ownership";
import { prisma } from "@/lib/prisma";
import { resolveMoveDurationMin, type MoveStrategyLite } from "@/lib/studio/move-duration";

/**
 * Длина окна студийного переноса — ЕДИНСТВЕННЫЙ расчёт на две стороны: сам
 * перенос (`moveStudioBooking`) и окошки, которые пикер предлагает для него
 * (`/api/masters/[id]/availability?moveBookingId=`).
 *
 * MOVE-PICKER-DURATION (2026-09-23): пикер спрашивал окошки по ОДНОЙ услуге
 * записи и её длительности у мастера сейчас, а перенос проверял сумму по всем
 * услугам: у того же мастера — снимки записи, у другого — его длительности
 * (`MasterService.durationOverrideMin`, STUDIO-MOVE-DURATION-01). Запись с
 * несколькими услугами, переносимая к другому мастеру, получала окошки, которые
 * сервер затем отклонял. Теперь обе стороны зовут эту функцию.
 */
export type StudioMoveServiceItem = { serviceId: string | null; durationSnapshotMin: number };

export async function planStudioMoveDuration(input: {
  serviceItems: ReadonlyArray<StudioMoveServiceItem>;
  currentMasterId: string | null;
  targetMasterId: string;
  strategy: MoveStrategyLite;
}) {
  // STUDIO-MOVE-DURATION-01: у другого мастера та же услуга может длиться иначе —
  // при смене мастера длительность берётся у нового мастера.
  const masterChanged = input.targetMasterId !== input.currentMasterId;
  const durationStrategy: MoveStrategyLite = masterChanged ? "CHANGE_SERVICE" : input.strategy;

  const bookingServiceIds = Array.from(
    new Set(input.serviceItems.map((item) => item.serviceId).filter((sid): sid is string => Boolean(sid))),
  );
  const targetOverrides =
    bookingServiceIds.length > 0
      ? await prisma.masterService.findMany({
          where: { masterProviderId: input.targetMasterId, serviceId: { in: bookingServiceIds } },
          select: {
            serviceId: true,
            isEnabled: true,
            priceOverride: true,
            durationOverrideMin: true,
            service: { select: { price: true, durationMin: true } },
          },
        })
      : [];
  const overrideByServiceId = new Map(targetOverrides.map((override) => [override.serviceId, override]));

  const durationMin = resolveMoveDurationMin(input.serviceItems, durationStrategy, overrideByServiceId);
  return {
    masterChanged,
    durationStrategy,
    bookingServiceIds,
    overrideByServiceId,
    /** Длина окна, которое перенос проверит и запишет (`60`, если вывести не из чего). */
    windowMin: durationMin > 0 ? durationMin : 60,
  };
}

/**
 * `?moveBookingId=` на выдаче окошек: окошки для переноса ЭТОЙ записи к
 * запрошенному мастеру — по длине, которую проверит перенос, и (у того же
 * мастера) без окна самой записи.
 *
 * Право — то же, что у переноса: запись студийная (`Booking.studioId`, инв. #45),
 * мастер — из этой студии, вызывающий — её владелец или админ
 * (`requireProviderOwner` на провайдере студии, бросает 403 сам). Чужая запись
 * или мастер другой студии — 404: параметр иначе выдавал бы длину и окно
 * чужой записи.
 */
export async function resolveStudioMoveSlots(
  req: Request,
  targetMasterId: string,
  bookingIdRaw: string | null,
): Promise<{ excludeBookingId: string | undefined; durationMin: number } | undefined> {
  const bookingId = bookingIdRaw?.trim();
  if (!bookingId) return undefined;

  const user = await getSessionUser(req);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      studioId: true,
      masterProviderId: true,
      serviceItems: { select: { serviceId: true, durationSnapshotMin: true } },
    },
  });
  const studio = booking?.studioId
    ? await prisma.studio.findUnique({ where: { id: booking.studioId }, select: { providerId: true } })
    : null;
  const target = studio
    ? await prisma.provider.findUnique({ where: { id: targetMasterId }, select: { studioId: true } })
    : null;
  if (!booking || !studio || target?.studioId !== studio.providerId) {
    throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");
  }
  await requireProviderOwner(user, studio.providerId);

  // Диалог переноса шлёт `KEEP_SERVICE` всегда (`move-booking-dialog.tsx`), смену
  // стратегии при смене мастера делает сам план.
  const plan = await planStudioMoveDuration({
    serviceItems: booking.serviceItems,
    currentMasterId: booking.masterProviderId,
    targetMasterId,
    strategy: "KEEP_SERVICE",
  });
  return {
    excludeBookingId: plan.masterChanged ? undefined : booking.id,
    durationMin: plan.windowMin,
  };
}

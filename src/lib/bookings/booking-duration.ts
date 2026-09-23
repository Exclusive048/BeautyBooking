/**
 * LOGIC-03 — длина записи при переносе: сумма снимков услуг
 * (`BookingServiceItem.durationSnapshotMin`), а без них — длина текущего окна.
 *
 * Перенос длину услуги не меняет, а текущее окно могло уже разойтись со
 * снимком. Правило одно на запись переноса (`rescheduleBooking`) и на выдачу
 * окошек для него (MOVE-PICKER-DURATION: `resolveRescheduleExclusion`), иначе
 * пикер предлагал окошко по ТЕКУЩЕЙ длительности услуги, а сервер проверял
 * перенос по снимку — и отклонял предложенное время либо прятал допустимое.
 *
 * `0` — длину вывести не из чего; решает вызывающий.
 */
export function resolveBookingDurationMin(booking: {
  serviceItems: ReadonlyArray<{ durationSnapshotMin: number | null }>;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
}): number {
  const snapshotDurationMin = booking.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.durationSnapshotMin ?? 0),
    0,
  );
  if (snapshotDurationMin > 0) return snapshotDurationMin;
  if (!booking.startAtUtc || !booking.endAtUtc) return 0;
  return Math.max(0, Math.round((booking.endAtUtc.getTime() - booking.startAtUtc.getTime()) / 60_000));
}

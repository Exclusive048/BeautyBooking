import { prisma } from "@/lib/prisma";
import type { MasterWorkWindow } from "@/lib/bookings/policy-enforcement";
import { parseDateKeyToUtcStart } from "@/lib/schedule/editor-shared";
import { timeToMinutes } from "@/lib/schedule/time";
import { SCHEDULE_OVERRIDE_PICK_ORDER } from "@/lib/schedule/override-order";

/**
 * LOGIC-03 — резолвер рабочего окна мастера, вынесенный из
 * `studio/bookings.service.ts`, где он был приватным.
 *
 * Причина выноса: guard рабочих часов стоял ТОЛЬКО на студийном move, а путь
 * переноса (`bookings/usecases.ts`) не проверял рабочие часы вообще — перенос
 * на воскресенье 03:00 проходил. Второй копии резолвера быть не должно: он
 * знает нетривиальный факт про хранение `ScheduleOverride.date` (см. ниже), и
 * разошедшиеся копии дали бы разные ответы на одном и том же расписании.
 */
const DEFAULT_WORK_START_MIN = 10 * 60; // 10:00
const DEFAULT_WORK_END_MIN = 19 * 60; // 19:00
/** Sunday off, Mon-Sat working. JS Date.getUTCDay() / getDay(): 0 = Sun. */
const DEFAULT_ACTIVE_DAYS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * STUDIO-RESCHEDULE-VALIDATION-A — resolves the target master's work
 * window for a given weekday by reading the `WeeklyScheduleConfig` +
 * `ScheduleOverride` for the requested date. Returns a normalized
 * `MasterWorkWindow` consumed by the pure
 * `assertWithinMasterWorkHours` helper.
 *
 * Override semantics:
 *   - if a `ScheduleOverride` row exists for `dateKey`, use it
 *     (handles holidays / one-off day-offs / different hours that
 *     day);
 *   - else fall back to the `WeeklyScheduleDay` for `weekday`;
 *   - else fall back to the project-wide defaults above.
 *
 * Per-day overrides take precedence over the weekly config — matches
 * what the schedule engine does at slot-build time.
 *
 * FIX-R2-04-B: `weekday` (0=Sun..6=Sat) and `dateKey` (YYYY-MM-DD) are
 * now SALON-LOCAL (derived by `resolveSalonLocalParts` against the
 * master's tz), not UTC-derived from the instant. For a non-UTC studio
 * a real-UTC instant near local midnight resolves to a different
 * UTC day/date than its salon-local day/date — reading them in UTC
 * looked up the wrong weekly day / override row. The `date: dateKey`
 * query still matches the UTC-midnight-stored override (overrides are
 * persisted at `Date.UTC(y,m,d,0,0,0)` of the local dateKey), exactly
 * as the engine buckets them via `toLocalDateKey(row.date, tz)`.
 */
export async function resolveMasterWorkWindow(
  masterProviderId: string,
  weekday: number,
  dateKey: string,
): Promise<MasterWorkWindow> {
  // FIX-R2-04-B: `ScheduleOverride.date` is a DateTime stored at
  // UTC-midnight of the salon-local date key (editor `saveException`
  // writes `parseDateKeyToUtcStart(dateKey)`; the engine matches via
  // `toLocalDateKey(row.date, tz)`). A bare "YYYY-MM-DD" string is
  // rejected by Prisma 6 ("Expected ISO-8601 DateTime") — the prior
  // `date: dateKey` (string) form threw `PrismaClientValidationError`
  // whenever this resolver ran. Convert the salon-local dateKey to the
  // exact stored instant so the override point-lookup actually matches.
  const overrideDate = parseDateKeyToUtcStart(dateKey);
  const [override, weeklyDay] = await Promise.all([
    prisma.scheduleOverride.findFirst({
      where: { providerId: masterProviderId, date: overrideDate },
      // LOGIC-11: без порядка guard брал произвольную из дублей, а движок —
      // свою; общий канон сводит их на одну строку.
      orderBy: SCHEDULE_OVERRIDE_PICK_ORDER,
      include: { template: { select: { startLocal: true, endLocal: true } } },
    }),
    prisma.weeklyScheduleDay.findFirst({
      where: { config: { providerId: masterProviderId }, weekday },
      include: { template: { select: { startLocal: true, endLocal: true } } },
    }),
  ]);

  if (override) {
    if (override.isDayOff) {
      return { isActive: false, startMinutes: null, endMinutes: null };
    }
    const startStr = override.startLocal ?? override.template?.startLocal ?? null;
    const endStr = override.endLocal ?? override.template?.endLocal ?? null;
    if (startStr && endStr) {
      return {
        isActive: true,
        startMinutes: timeToMinutes(startStr),
        endMinutes: timeToMinutes(endStr),
      };
    }
  }

  if (weeklyDay) {
    if (!weeklyDay.isActive) {
      return { isActive: false, startMinutes: null, endMinutes: null };
    }
    const startStr = weeklyDay.template?.startLocal ?? null;
    const endStr = weeklyDay.template?.endLocal ?? null;
    if (startStr && endStr) {
      return {
        isActive: true,
        startMinutes: timeToMinutes(startStr),
        endMinutes: timeToMinutes(endStr),
      };
    }
  }

  // No config — fall back to project-wide default (Mon-Sat 10-19).
  return {
    isActive: DEFAULT_ACTIVE_DAYS.has(weekday),
    startMinutes: DEFAULT_ACTIVE_DAYS.has(weekday) ? DEFAULT_WORK_START_MIN : null,
    endMinutes: DEFAULT_ACTIVE_DAYS.has(weekday) ? DEFAULT_WORK_END_MIN : null,
  };
}

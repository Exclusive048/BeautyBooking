import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { dateFromLocalDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";

type EffectiveSchedule = {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotSet: Set<string>;
};

async function resolveDuration(masterId: string, serviceId: string) {
  return resolveServiceDuration(masterId, serviceId);
}

function normalizeFixedSlotTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute % 5 !== 0) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeFixedSlotTimes(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeFixedSlotTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function dayIndexFromDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const p = params instanceof Promise ? await params : params;
    const url = new URL(req.url);
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const fromKey = url.searchParams.get("from") ?? "";
    const toKey = url.searchParams.get("to") ?? "";
    const limitRaw = url.searchParams.get("limit");

    if (!serviceId) return fail("Service id is required", 400, "SERVICE_REQUIRED");
    if (!isDateKey(fromKey)) return fail("Invalid from", 400, "DATE_INVALID");
    if (toKey && !isDateKey(toKey)) return fail("Invalid to", 400, "DATE_INVALID");

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    if (limitRaw && !Number.isFinite(limit)) {
      return fail("Invalid limit", 400, "LIMIT_INVALID");
    }

    const duration = await resolveDuration(p.id, serviceId);
    if (!duration.ok) return fail(duration.message, duration.status, duration.code);

    const result = await listAvailabilitySlotsPaginated(p.id, serviceId, duration.data, {
      fromKey,
      toKeyExclusive: toKey || undefined,
      limit,
    });
    if (!result.ok) return fail(result.message, result.status, result.code);

    const provider = await prisma.provider.findUnique({
      where: { id: p.id },
      select: { id: true, timezone: true },
    });
    if (!provider) return fail("Master not found", 404, "MASTER_NOT_FOUND");

    const rangeFromUtc = dateFromLocalDateKey(result.data.meta.fromDate, provider.timezone, 0, 0);
    const rangeToExclusiveUtc = dateFromLocalDateKey(result.data.meta.toDateExclusive, provider.timezone, 0, 0);

    const [weeklyConfig, overrides] = await Promise.all([
      prisma.weeklyScheduleConfig.findUnique({
        where: { providerId: provider.id },
        select: {
          days: {
            select: {
              weekday: true,
              isActive: true,
              scheduleMode: true,
              fixedSlotTimes: true,
              templateId: true,
            },
          },
        },
      }),
      prisma.scheduleOverride.findMany({
        where: { providerId: provider.id, date: { gte: rangeFromUtc, lt: rangeToExclusiveUtc } },
        select: {
          date: true,
          isDayOff: true,
          isWorkday: true,
          scheduleMode: true,
          fixedSlotTimes: true,
        },
        orderBy: { date: "asc" },
      }),
    ]);

    const weekByDay = new Map<number, EffectiveSchedule>();
    for (const day of weeklyConfig?.days ?? []) {
      weekByDay.set(day.weekday, {
        isWorkday: Boolean(day.isActive && day.templateId),
        scheduleMode: day.scheduleMode ?? "FLEXIBLE",
        fixedSlotSet: new Set(normalizeFixedSlotTimes(day.fixedSlotTimes ?? [])),
      });
    }

    const exceptionsByDate = new Map<string, EffectiveSchedule>();
    for (const row of overrides) {
      const dateKey = toLocalDateKey(row.date, provider.timezone);
      const fixedTimes = normalizeFixedSlotTimes(row.fixedSlotTimes ?? []);
      exceptionsByDate.set(dateKey, {
        isWorkday: row.isWorkday ?? !row.isDayOff,
        scheduleMode: row.scheduleMode ?? (fixedTimes.length > 0 ? "FIXED" : "FLEXIBLE"),
        fixedSlotSet: new Set(fixedTimes),
      });
    }

    const effectiveCache = new Map<string, EffectiveSchedule>();
    const getEffective = (dateKey: string): EffectiveSchedule => {
      const cached = effectiveCache.get(dateKey);
      if (cached) return cached;

      const fromException = exceptionsByDate.get(dateKey);
      if (fromException) {
        effectiveCache.set(dateKey, fromException);
        return fromException;
      }

      const weekday = dayIndexFromDateKey(dateKey) + 1;
      const fromWeek = weekByDay.get(weekday);
      if (fromWeek) {
        effectiveCache.set(dateKey, fromWeek);
        return fromWeek;
      }

      const fallback: EffectiveSchedule = {
        isWorkday: true,
        scheduleMode: "FLEXIBLE",
        fixedSlotSet: new Set<string>(),
      };
      effectiveCache.set(dateKey, fallback);
      return fallback;
    };

    const filtered = result.data.slots.filter((slot) => {
      const startsAt = slot.startAtUtc instanceof Date ? slot.startAtUtc : new Date(slot.startAtUtc);
      if (Number.isNaN(startsAt.getTime())) return false;

      const dateKey = toLocalDateKey(startsAt, provider.timezone);
      const effective = getEffective(dateKey);

      if (!effective.isWorkday) return false;
      if (effective.scheduleMode !== "FIXED") return true;
      if (effective.fixedSlotSet.size === 0) return false;

      const { hour, minute } = getLocalTimeParts(startsAt, provider.timezone);
      const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return effective.fixedSlotSet.has(localTime);
    });

    return ok({ slots: filtered, meta: result.data.meta });
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/masters/[id]/availability failed", {
        requestId,
        route: "GET /api/masters/{id}/availability",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

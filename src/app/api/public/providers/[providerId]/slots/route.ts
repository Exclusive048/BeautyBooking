import { ok, fail } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { dateFromLocalDateKey, isDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function mapSlotsError(code?: string): string {
  switch (code) {
    case "SERVICE_REQUIRED":
      return "Не указана услуга.";
    case "DURATION_INVALID":
      return "Некорректная длительность услуги.";
    case "DATE_INVALID":
      return "Некорректная дата.";
    case "RANGE_INVALID":
      return "Некорректный диапазон.";
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return "Мастер не найден.";
    case "SERVICE_NOT_FOUND":
      return "Услуга не найдена.";
    case "SERVICE_INVALID":
      return "Услуга недоступна для мастера.";
    case "SERVICE_DISABLED":
      return "Услуга недоступна.";
    default:
      return "Не удалось загрузить слоты.";
  }
}

function dayIndexFromDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

type EffectiveSchedule = {
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  fixedSlotSet: Set<string>;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
  const p = params instanceof Promise ? await params : params;
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const fromKey = url.searchParams.get("from") ?? "";
  const toKey = url.searchParams.get("to") ?? "";
  const limitRaw = url.searchParams.get("limit");

  if (!serviceId) return fail("Не указана услуга.", 400, "SERVICE_REQUIRED");
  if (!isDateKey(fromKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");
  if (toKey && !isDateKey(toKey)) return fail("Некорректная дата.", 400, "DATE_INVALID");

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  if (limitRaw && !Number.isFinite(limit)) {
    return fail("Некорректный лимит.", 400, "LIMIT_INVALID");
  }

  const provider = await resolveProviderBySlugOrId({
    key: p.providerId,
    select: { id: true, type: true, timezone: true, scheduleMode: true, fixedSlotTimes: true },
    requirePublished: true,
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const duration = await resolveServiceDuration(provider.id, serviceId);
  if (!duration.ok) {
    return fail(mapSlotsError(duration.code), duration.status, duration.code);
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, price: true },
  });
  if (!service) return fail("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");

  const result = await listAvailabilitySlotsPaginated(provider.id, serviceId, duration.data, {
    fromKey,
    toKeyExclusive: toKey || undefined,
    limit,
  });
  if (!result.ok) {
    return fail(mapSlotsError(result.code), result.status, result.code);
  }

  const rangeFromUtc = dateFromLocalDateKey(result.data.meta.fromDate, provider.timezone, 0, 0);
  const rangeToExclusiveUtc = dateFromLocalDateKey(result.data.meta.toDateExclusive, provider.timezone, 0, 0);

  const [rule, weeklyConfig, overrides] = await Promise.all([
    prisma.discountRule.findUnique({
      where: { providerId: provider.id },
      select: {
        isEnabled: true,
        triggerHours: true,
        discountType: true,
        discountValue: true,
        applyMode: true,
        minPriceFrom: true,
        serviceIds: true,
      },
    }),
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

  const fallbackFixedSet = new Set(normalizeFixedSlotTimes(provider.fixedSlotTimes ?? []));
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
      scheduleMode: provider.scheduleMode === "FIXED" ? "FIXED" : "FLEXIBLE",
      fixedSlotSet: fallbackFixedSet,
    };
    effectiveCache.set(dateKey, fallback);
    return fallback;
  };

  const baseSlots = result.data.slots.filter((slot) => {
    const startsAt = toDate(slot.startAtUtc);
    if (!startsAt) return false;
    const dateKey = toLocalDateKey(startsAt, provider.timezone);
    const effective = getEffective(dateKey);

    if (!effective.isWorkday) return false;
    if (effective.scheduleMode !== "FIXED") return true;
    if (effective.fixedSlotSet.size === 0) return false;

    const { hour, minute } = getLocalTimeParts(startsAt, provider.timezone);
    const localTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return effective.fixedSlotSet.has(localTime);
  });

  type SlotLike = (typeof baseSlots)[number] & {
    hotSlotId?: string | null;
    isHot?: boolean;
    discountType?: "PERCENT" | "FIXED";
    discountValue?: number;
    originalPrice?: number | null;
    discountedPrice?: number | null;
    discountPercent?: number | null;
  };

  const now = new Date();
  const decoratedSlots: SlotLike[] = baseSlots.map((slot) => {
    const startAtUtc = toDate(slot.startAtUtc);
    if (!startAtUtc) {
      return {
        ...slot,
        hotSlotId: null,
        isHot: false,
        discountType: undefined,
        discountValue: undefined,
        originalPrice: null,
        discountedPrice: null,
        discountPercent: null,
      };
    }

    const hot = resolveDynamicHotSlotPricing({
      rule,
      slotStartAtUtc: startAtUtc,
      serviceId,
      servicePrice: service.price,
      providerTimeZone: provider.timezone,
      now,
    });

    return {
      ...slot,
      hotSlotId: null,
      isHot: hot.isHot,
      discountType: hot.discountType,
      discountValue: hot.discountValue,
      originalPrice: hot.originalPrice,
      discountedPrice: hot.discountedPrice,
      discountPercent: hot.discountPercent,
    };
  });

  const serializedSlots = decoratedSlots.map((slot) => ({
    ...slot,
    startAtUtc: toIso(slot.startAtUtc),
    endAtUtc: toIso(slot.endAtUtc),
  }));

  return ok({ timezone: provider.timezone, slots: serializedSlots, meta: result.data.meta });
}

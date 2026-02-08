import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Result } from "@/lib/domain/result";
import type {
  AvailabilitySlot,
  DayOfWeek,
  ScheduleBlock,
  ScheduleBreakInterval,
  ScheduleOverride,
  WeeklyScheduleItem,
} from "@/lib/domain/schedule";
import { timeToMinutes } from "@/lib/schedule/time";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import {
  buildSlotsCacheKey,
  getCachedSlots,
  invalidateSlotsForMaster,
  setCachedSlotsForDate,
} from "@/lib/schedule/slotsCache";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import {
  addDaysToDateKey,
  compareDateKeys,
  dateFromLocalDateKey,
  diffDateKeys,
  isDateKey,
} from "@/lib/schedule/dateKey";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";

type RangeInput = {
  from: Date;
  to: Date;
  stepMin?: number;
};

export const MAX_BOOKING_WINDOW_DAYS = 60;
export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 14;

function clampPageSize(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE;
  const safe = Math.floor(value as number);
  if (safe < 1) return 1;
  if (safe > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return safe;
}

type ScheduleRuleDay = {
  isWorkday: boolean;
  startLocal?: string | null;
  endLocal?: string | null;
  breaks?: ScheduleBreakInterval[];
};

type WeeklyScheduleRuleDay = ScheduleRuleDay & {
  dayOfWeek: DayOfWeek;
};

export type SaveScheduleRuleInput = {
  kind: "WEEKLY" | "CYCLE";
  timezone?: string;
  anchorDate?: Date | null;
  payload:
    | {
        weekly: WeeklyScheduleRuleDay[];
      }
    | {
        cycle: {
          days: ScheduleRuleDay[];
        };
      };
  bufferBetweenBookingsMin?: number;
};

function validateBufferMinutes(value: number): Result<number> {
  if (!Number.isInteger(value)) {
    return { ok: false, status: 400, message: "Invalid buffer", code: "BUFFER_INVALID" };
  }
  if (value < 0 || value > 30) {
    return { ok: false, status: 400, message: "Buffer out of range", code: "BUFFER_INVALID" };
  }
  if (value % 5 !== 0) {
    return { ok: false, status: 400, message: "Invalid buffer", code: "BUFFER_INVALID" };
  }
  return { ok: true, data: value };
}

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

function normalizeDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function validateWeeklyItem(item: WeeklyScheduleItem): Result<WeeklyScheduleItem> {
  if (item.dayOfWeek < 0 || item.dayOfWeek > 6) {
    return { ok: false, status: 400, message: "Invalid day of week", code: "DAY_INVALID" };
  }

  const start = timeToMinutes(item.startLocal);
  const end = timeToMinutes(item.endLocal);
  if (start === null || end === null || start >= end) {
    return { ok: false, status: 400, message: "Invalid time range", code: "TIME_RANGE_INVALID" };
  }

  const breaksResult = validateBreaks(item.breaks, start, end);
  if (!breaksResult.ok) return breaksResult;

  return { ok: true, data: { ...item, breaks: breaksResult.data } };
}

function validateBreaks(
  breaks: ScheduleBreakInterval[] | undefined,
  dayStart: number,
  dayEnd: number
): Result<ScheduleBreakInterval[] | undefined> {
  if (!breaks) return { ok: true, data: undefined };
  if (breaks.length > 3) {
    return { ok: false, status: 400, message: "Too many breaks", code: "BREAKS_LIMIT" };
  }

  const normalized = breaks.map((b) => {
    const start = timeToMinutes(b.startLocal);
    const end = timeToMinutes(b.endLocal);
    return { start, end, raw: b };
  });

  for (const b of normalized) {
    if (b.start === null || b.end === null || b.start >= b.end) {
      return { ok: false, status: 400, message: "Invalid break time", code: "BREAK_INVALID" };
    }
    if (b.start <= dayStart || b.end >= dayEnd) {
      return { ok: false, status: 400, message: "Break out of range", code: "BREAK_RANGE" };
    }
  }

  const sorted = normalized
    .slice()
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.start === null || prev.end === null || curr.start === null || curr.end === null) {
      continue;
    }
    if (curr.start < prev.end) {
      return { ok: false, status: 400, message: "Breaks overlap", code: "BREAK_OVERLAP" };
    }
  }

  return { ok: true, data: breaks };
}

function validateOverride(input: ScheduleOverride): Result<ScheduleOverride> {
  const date = normalizeDate(input.date);
  if (input.isDayOff) {
    return {
      ok: true,
      data: {
        ...input,
        date,
        startLocal: null,
        endLocal: null,
        breaks: undefined,
      },
    };
  }

  const start = input.startLocal ? timeToMinutes(input.startLocal) : null;
  const end = input.endLocal ? timeToMinutes(input.endLocal) : null;
  if (start === null || end === null || start >= end) {
    return { ok: false, status: 400, message: "Invalid time range", code: "TIME_RANGE_INVALID" };
  }

  const breaksResult = validateBreaks(input.breaks, start, end);
  if (!breaksResult.ok) return breaksResult;

  return { ok: true, data: { ...input, date, breaks: breaksResult.data } };
}

function validateBlock(input: ScheduleBlock): Result<ScheduleBlock> {
  const date = normalizeDate(input.date);
  const start = timeToMinutes(input.startLocal);
  const end = timeToMinutes(input.endLocal);
  if (start === null || end === null || start >= end) {
    return { ok: false, status: 400, message: "Invalid time range", code: "TIME_RANGE_INVALID" };
  }
  return { ok: true, data: { ...input, date } };
}

function normalizeTimezone(input: string | undefined, fallback: string): string {
  const value = input?.trim();
  if (!value) return fallback;
  return value;
}

function validateRuleDayTemplate(input: ScheduleRuleDay): Result<{
  isWorkday: boolean;
  startLocal: string | null;
  endLocal: string | null;
  breaks: ScheduleBreakInterval[];
}> {
  if (!input.isWorkday) {
    return {
      ok: true,
      data: {
        isWorkday: false,
        startLocal: null,
        endLocal: null,
        breaks: [],
      },
    };
  }

  const startLocal = input.startLocal ?? null;
  const endLocal = input.endLocal ?? null;
  const start = startLocal ? timeToMinutes(startLocal) : null;
  const end = endLocal ? timeToMinutes(endLocal) : null;
  if (start === null || end === null || start >= end) {
    return { ok: false, status: 400, message: "Invalid time range", code: "TIME_RANGE_INVALID" };
  }

  const breaksResult = validateBreaks(input.breaks ?? [], start, end);
  if (!breaksResult.ok) return breaksResult;

  return {
    ok: true,
    data: {
      isWorkday: true,
      startLocal,
      endLocal,
      breaks: breaksResult.data ?? [],
    },
  };
}

function validateAndNormalizeRulePayload(input: SaveScheduleRuleInput["payload"]): Result<Prisma.JsonObject> {
  if ("weekly" in input) {
    const normalized: Prisma.JsonObject[] = [];
    const seenDays = new Set<number>();
    for (const day of input.weekly) {
      if (seenDays.has(day.dayOfWeek)) {
        return { ok: false, status: 400, message: "Duplicate day in weekly rule", code: "VALIDATION_ERROR" };
      }
      seenDays.add(day.dayOfWeek);
      const validated = validateRuleDayTemplate(day);
      if (!validated.ok) return validated;
      normalized.push({
        dayOfWeek: day.dayOfWeek,
        isWorkday: validated.data.isWorkday,
        startLocal: validated.data.startLocal,
        endLocal: validated.data.endLocal,
        breaks: validated.data.breaks as unknown as Prisma.JsonArray,
      });
    }
    return { ok: true, data: { weekly: normalized } };
  }

  if (input.cycle.days.length === 0) {
    return { ok: false, status: 400, message: "Cycle days required", code: "VALIDATION_ERROR" };
  }

  const days: Prisma.JsonObject[] = [];
  for (const day of input.cycle.days) {
    const validated = validateRuleDayTemplate(day);
    if (!validated.ok) return validated;
    days.push({
      isWorkday: validated.data.isWorkday,
      startLocal: validated.data.startLocal,
      endLocal: validated.data.endLocal,
      breaks: validated.data.breaks as unknown as Prisma.JsonArray,
    });
  }

  return {
    ok: true,
    data: {
      cycle: {
        days: days as unknown as Prisma.JsonArray,
      },
    },
  };
}

export async function setWeeklySchedule(
  providerId: string,
  items: WeeklyScheduleItem[]
): Promise<Result<{ count: number }>> {
  const normalized: WeeklyScheduleItem[] = [];
  for (const item of items) {
    const validated = validateWeeklyItem(item);
    if (!validated.ok) return validated;
    normalized.push(validated.data);
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.scheduleRule.updateMany({
      where: { providerId, isActive: true },
      data: { isActive: false },
    }),
    prisma.weeklySchedule.deleteMany({ where: { providerId } }),
    prisma.weeklySchedule.createMany({
      data: normalized.map((item) => ({
        providerId,
        dayOfWeek: item.dayOfWeek,
        startLocal: item.startLocal,
        endLocal: item.endLocal,
      })),
    }),
  ];

  const hasBreaksPayload = normalized.some((item) => item.breaks !== undefined);
  if (hasBreaksPayload) {
    for (const item of normalized) {
      if (item.breaks === undefined) continue;
      ops.push(
        prisma.scheduleBreak.deleteMany({
          where: { providerId, kind: "WEEKLY", dayOfWeek: item.dayOfWeek },
        })
      );
      if (item.breaks.length > 0) {
        ops.push(
          prisma.scheduleBreak.createMany({
            data: item.breaks.map((b) => ({
              providerId,
              kind: "WEEKLY",
              dayOfWeek: item.dayOfWeek,
              startLocal: b.startLocal,
              endLocal: b.endLocal,
            })),
          })
        );
      }
    }
  }

  await prisma.$transaction(ops);
  await invalidateSlotsForMaster(providerId);

  return { ok: true, data: { count: normalized.length } };
}

export async function setScheduleOverride(
  providerId: string,
  input: ScheduleOverride
): Promise<Result<ScheduleOverride>> {
  const validated = validateOverride(input);
  if (!validated.ok) return validated;

  const date = validated.data.date;
  const breaks = validated.data.breaks ?? undefined;
  const existing = await prisma.scheduleOverride.findFirst({
    where: { providerId, date },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    existing
      ? prisma.scheduleOverride.update({
          where: { id: existing.id },
          data: {
            isDayOff: validated.data.isDayOff,
            startLocal: validated.data.isDayOff ? null : validated.data.startLocal ?? null,
            endLocal: validated.data.isDayOff ? null : validated.data.endLocal ?? null,
            reason: validated.data.reason ?? null,
          },
        })
      : prisma.scheduleOverride.create({
          data: {
            providerId,
            date,
            isDayOff: validated.data.isDayOff,
            startLocal: validated.data.isDayOff ? null : validated.data.startLocal ?? null,
            endLocal: validated.data.isDayOff ? null : validated.data.endLocal ?? null,
            reason: validated.data.reason ?? null,
          },
        }),
  ];

  ops.push(
    prisma.scheduleBreak.deleteMany({
      where: { providerId, kind: "OVERRIDE", date },
    })
  );
  if (!validated.data.isDayOff && breaks && breaks.length > 0) {
    ops.push(
      prisma.scheduleBreak.createMany({
        data: breaks.map((b: ScheduleBreakInterval) => ({
          providerId,
          kind: "OVERRIDE",
          date,
          startLocal: b.startLocal,
          endLocal: b.endLocal,
        })),
      })
    );
  }

  type ScheduleOverrideRecord = Prisma.ScheduleOverrideGetPayload<Record<string, never>>;
  const [saved] = (await prisma.$transaction(ops)) as [ScheduleOverrideRecord];
  await invalidateSlotsForMaster(providerId);

  return {
    ok: true,
    data: {
      date: saved.date,
      isDayOff: saved.isDayOff,
      startLocal: saved.startLocal,
      endLocal: saved.endLocal,
      reason: saved.reason ?? null,
      breaks: breaks ?? undefined,
    },
  };
}

export async function removeScheduleOverride(
  providerId: string,
  date: Date
): Promise<Result<{ date: Date }>> {
  const normalized = normalizeDate(date);
  await prisma.$transaction([
    prisma.scheduleBreak.deleteMany({ where: { providerId, kind: "OVERRIDE", date: normalized } }),
    prisma.scheduleOverride.deleteMany({ where: { providerId, date: normalized } }),
  ]);
  await invalidateSlotsForMaster(providerId);
  return { ok: true, data: { date: normalized } };
}

export async function addScheduleBlock(
  providerId: string,
  input: ScheduleBlock
): Promise<Result<{ id: string }>> {
  const validated = validateBlock(input);
  if (!validated.ok) return validated;

  const created = await prisma.scheduleBlock.create({
    data: {
      providerId,
      date: validated.data.date,
      startLocal: validated.data.startLocal,
      endLocal: validated.data.endLocal,
      reason: validated.data.reason ?? null,
    },
  });
  await invalidateSlotsForMaster(providerId);

  return { ok: true, data: { id: created.id } };
}

export async function removeScheduleBlock(
  providerId: string,
  blockId: string
): Promise<Result<{ id: string }>> {
  const existing = await prisma.scheduleBlock.findFirst({
    where: { id: blockId, providerId },
    select: { id: true },
  });
  if (!existing) return { ok: false, status: 404, message: "Block not found", code: "BLOCK_NOT_FOUND" };

  await prisma.scheduleBlock.delete({ where: { id: existing.id } });
  await invalidateSlotsForMaster(providerId);
  return { ok: true, data: { id: existing.id } };
}

export async function saveScheduleRule(
  providerId: string,
  input: SaveScheduleRuleInput
): Promise<Result<{ id: string }>> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true },
  });
  if (!provider) {
    return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };
  }

  if (input.kind === "CYCLE" && !input.anchorDate) {
    return { ok: false, status: 400, message: "Anchor date is required", code: "DATE_INVALID" };
  }

  const payloadResult = validateAndNormalizeRulePayload(input.payload);
  if (!payloadResult.ok) return payloadResult;

  let normalizedBuffer: number | null = null;
  if (typeof input.bufferBetweenBookingsMin === "number") {
    const validatedBuffer = validateBufferMinutes(input.bufferBetweenBookingsMin);
    if (!validatedBuffer.ok) return validatedBuffer;
    normalizedBuffer = validatedBuffer.data;
  }

  const timezone = normalizeTimezone(input.timezone, provider.timezone);
  const anchorDate = input.anchorDate ? normalizeDate(input.anchorDate) : null;

  const created = await prisma.$transaction(async (tx) => {
    await tx.scheduleRule.updateMany({
      where: { providerId, isActive: true },
      data: { isActive: false },
    });

    const createdRule = await tx.scheduleRule.create({
      data: {
        providerId,
        kind: input.kind,
        timezone,
        anchorDate: input.kind === "CYCLE" ? anchorDate : null,
        payloadJson: payloadResult.data,
        isActive: true,
      },
      select: { id: true },
    });

    if (normalizedBuffer !== null) {
      await tx.provider.update({
        where: { id: providerId },
        data: { bufferBetweenBookingsMin: normalizedBuffer },
      });
    }

    return createdRule;
  });

  await invalidateSlotsForMaster(providerId);
  return { ok: true, data: { id: created.id } };
}

export type AvailabilitySlotsPageMeta = {
  fromDate: string;
  toDateExclusive: string;
  totalDays: number;
  hasMore: boolean;
  pageSize: number;
  stale?: boolean;
};

export type AvailabilitySlotsPageResult = {
  slots: AvailabilitySlot[];
  meta: AvailabilitySlotsPageMeta;
};

export async function listAvailabilitySlotsPaginated(
  providerId: string,
  serviceId: string,
  durationMin: number,
  input: { fromKey: string; toKeyExclusive?: string; limit?: number }
): Promise<Result<AvailabilitySlotsPageResult>> {
  const startedAt = Date.now();

  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % 5 !== 0) {
    return { ok: false, status: 400, message: "Invalid duration", code: "DURATION_INVALID" };
  }

  if (!serviceId) {
    return { ok: false, status: 400, message: "Service id is required", code: "SERVICE_REQUIRED" };
  }

  const requestedStartKey = input.fromKey;
  if (!isDateKey(requestedStartKey)) {
    return { ok: false, status: 400, message: "Invalid from", code: "DATE_INVALID" };
  }

  if (input.toKeyExclusive && !isDateKey(input.toKeyExclusive)) {
    return { ok: false, status: 400, message: "Invalid to", code: "DATE_INVALID" };
  }

  const maxEndKeyExclusive = addDaysToDateKey(requestedStartKey, MAX_BOOKING_WINDOW_DAYS);
  const requestedEndKeyExclusive = input.toKeyExclusive ?? maxEndKeyExclusive;

  if (compareDateKeys(requestedEndKeyExclusive, requestedStartKey) < 0) {
    return { ok: false, status: 400, message: "Invalid range", code: "RANGE_INVALID" };
  }

  if (compareDateKeys(requestedEndKeyExclusive, maxEndKeyExclusive) > 0) {
    return { ok: false, status: 400, message: "Range too large", code: "RANGE_INVALID" };
  }

  const pageSize = clampPageSize(input.limit);
  const limitedEndKeyExclusive = addDaysToDateKey(requestedStartKey, pageSize);
  const actualEndKeyExclusive =
    compareDateKeys(limitedEndKeyExclusive, requestedEndKeyExclusive) < 0
      ? limitedEndKeyExclusive
      : requestedEndKeyExclusive;

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true, bufferBetweenBookingsMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const timezone = provider.timezone;
  const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);

  const ctx = await createScheduleContext({
    providerId,
    timezoneHint: timezone,
    range: { fromKey: requestedStartKey, toKeyExclusive: actualEndKeyExclusive },
  });

  const rangeFromUtc = dateFromLocalDateKey(requestedStartKey, timezone, 0, 0);
  const rangeToExclusiveUtc = dateFromLocalDateKey(actualEndKeyExclusive, timezone, 0, 0);

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { masterProviderId: providerId },
        { masterProviderId: null, providerId },
      ],
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      ...buildBookingOverlapWhere(rangeFromUtc, rangeToExclusiveUtc),
    },
    select: { startAtUtc: true, endAtUtc: true },
    orderBy: { startAtUtc: "asc" },
  });

  const bookingRanges = bookings
    .map((booking) =>
      booking.startAtUtc && booking.endAtUtc
        ? { startAtUtc: booking.startAtUtc, endAtUtc: booking.endAtUtc }
        : null
    )
    .filter((item): item is { startAtUtc: Date; endAtUtc: Date } => item !== null);

  const bookingsByDateKey = new Map<string, Array<{ startAtUtc: Date; endAtUtc: Date }>>();

  for (const booking of bookingRanges) {
    const startBookingKey = toLocalDateKey(booking.startAtUtc, timezone);
    const endBookingKeyExclusive = toLocalDateKeyExclusive(booking.endAtUtc, timezone);
    const clampedStart =
      compareDateKeys(startBookingKey, requestedStartKey) < 0 ? requestedStartKey : startBookingKey;
    const clampedEndExclusive =
      compareDateKeys(endBookingKeyExclusive, actualEndKeyExclusive) > 0
        ? actualEndKeyExclusive
        : endBookingKeyExclusive;

    if (compareDateKeys(clampedStart, clampedEndExclusive) >= 0) continue;

    let cursor = clampedStart;
    while (compareDateKeys(cursor, clampedEndExclusive) < 0) {
      const list = bookingsByDateKey.get(cursor) ?? [];
      list.push(booking);
      bookingsByDateKey.set(cursor, list);
      cursor = addDaysToDateKey(cursor, 1);
    }
  }

  const slots: AvailabilitySlot[] = [];
  let cursorKey = requestedStartKey;
  const now = new Date();

  while (compareDateKeys(cursorKey, actualEndKeyExclusive) < 0) {
    const cacheKey = buildSlotsCacheKey({
      masterId: providerId,
      dateKey: cursorKey,
      serviceId,
      serviceDuration: durationMin,
      bufferMin,
      timeZone: timezone,
      scheduleVersion: ctx.scheduleWindow.scheduleVersion,
      publishedUntilLocal: ctx.scheduleWindow.publishedUntilLocal,
    });
    const cached = await getCachedSlots(cacheKey);
    let daySlots: AvailabilitySlot[];

    if (cached) {
      daySlots = cached;
    } else {
      const dayPlan = await ScheduleEngine.getDayPlanFromContext(ctx, cursorKey);
      daySlots = buildSlotsForDay({
        dayPlan,
        dateKey: cursorKey,
        timeZone: timezone,
        serviceDurationMin: durationMin,
        bufferMin,
        bookings: bookingsByDateKey.get(cursorKey) ?? [],
        now,
      });
      await setCachedSlotsForDate({
        key: cacheKey,
        masterId: providerId,
        dateKey: cursorKey,
        slots: daySlots,
      });
    }

    slots.push(...daySlots);
    cursorKey = addDaysToDateKey(cursorKey, 1);
  }

  const totalDays = Math.max(0, diffDateKeys(requestedStartKey, actualEndKeyExclusive));
  const hasMore = compareDateKeys(actualEndKeyExclusive, requestedEndKeyExclusive) < 0;
  const meta: AvailabilitySlotsPageMeta = {
    fromDate: requestedStartKey,
    toDateExclusive: actualEndKeyExclusive,
    totalDays,
    hasMore,
    pageSize,
  };

  if (process.env.NODE_ENV !== "production") {
    const durationMs = Date.now() - startedAt;
    console.info(
      `[availability] provider=${providerId} days=${totalDays} bookings=${bookingRanges.length} slots=${slots.length} ms=${durationMs}`
    );
  }

  return { ok: true, data: { slots, meta } };
}

export async function listAvailabilitySlots(
  providerId: string,
  serviceId: string,
  durationMin: number,
  range: RangeInput
): Promise<Result<AvailabilitySlot[]>> {
  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % 5 !== 0) {
    return { ok: false, status: 400, message: "Invalid duration", code: "DURATION_INVALID" };
  }

  if (!serviceId) {
    return { ok: false, status: 400, message: "Service id is required", code: "SERVICE_REQUIRED" };
  }

  const from = range.from;
  const to = range.to;
  if (from > to) {
    return { ok: false, status: 400, message: "Invalid range", code: "RANGE_INVALID" };
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true, bufferBetweenBookingsMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const timezone = provider.timezone;
  const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
  const startKey = toLocalDateKey(from, timezone);
  const endKeyExclusive = toLocalDateKey(to, timezone);
  const ctx = await createScheduleContext({
    providerId,
    timezoneHint: timezone,
    range: { fromKey: startKey, toKeyExclusive: endKeyExclusive },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { masterProviderId: providerId },
        { masterProviderId: null, providerId },
      ],
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      ...buildBookingOverlapWhere(from, to),
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
  });
  const bookingRanges = bookings
    .map((booking) =>
      booking.startAtUtc && booking.endAtUtc
        ? { startAtUtc: booking.startAtUtc, endAtUtc: booking.endAtUtc }
        : null
    )
    .filter((item): item is { startAtUtc: Date; endAtUtc: Date } => item !== null);

  const bookingsByDateKey = new Map<string, Array<{ startAtUtc: Date; endAtUtc: Date }>>();
  for (const booking of bookingRanges) {
    const startBookingKey = toLocalDateKey(booking.startAtUtc, timezone);
    const endBookingKeyExclusive = toLocalDateKeyExclusive(booking.endAtUtc, timezone);
    let cursor = startBookingKey;
    while (compareDateKeys(cursor, endBookingKeyExclusive) < 0) {
      const list = bookingsByDateKey.get(cursor) ?? [];
      list.push(booking);
      bookingsByDateKey.set(cursor, list);
      cursor = addDaysToDateKey(cursor, 1);
    }
  }

  const slots: AvailabilitySlot[] = [];
  let cursorKey = startKey;
  const now = new Date();
  while (compareDateKeys(cursorKey, endKeyExclusive) < 0) {
    const cacheKey = buildSlotsCacheKey({
      masterId: providerId,
      dateKey: cursorKey,
      serviceId,
      serviceDuration: durationMin,
      bufferMin,
      timeZone: timezone,
      scheduleVersion: ctx.scheduleWindow.scheduleVersion,
      publishedUntilLocal: ctx.scheduleWindow.publishedUntilLocal,
    });
    const cached = await getCachedSlots(cacheKey);
    let daySlots: AvailabilitySlot[];
    if (cached) {
      daySlots = cached;
    } else {
      const dayPlan = await ScheduleEngine.getDayPlanFromContext(ctx, cursorKey);
      daySlots = buildSlotsForDay({
        dayPlan,
        dateKey: cursorKey,
        timeZone: timezone,
        serviceDurationMin: durationMin,
        bufferMin,
        bookings: bookingsByDateKey.get(cursorKey) ?? [],
        now,
      });
      await setCachedSlotsForDate({
        key: cacheKey,
        masterId: providerId,
        dateKey: cursorKey,
        slots: daySlots,
      });
    }

    for (const slot of daySlots) {
      const slotKey = toLocalDateKey(slot.startAtUtc, timezone);
      if (compareDateKeys(slotKey, startKey) < 0 || compareDateKeys(slotKey, endKeyExclusive) >= 0) {
        continue;
      }
      slots.push(slot);
    }

    cursorKey = addDaysToDateKey(cursorKey, 1);
  }

  return { ok: true, data: slots };
}

export async function getProviderBuffer(
  providerId: string
): Promise<Result<{ bufferBetweenBookingsMin: number }>> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { bufferBetweenBookingsMin: true },
  });
  if (!provider) {
    return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };
  }
  return { ok: true, data: { bufferBetweenBookingsMin: provider.bufferBetweenBookingsMin } };
}

export async function setProviderBuffer(
  providerId: string,
  bufferBetweenBookingsMin: number
): Promise<Result<{ bufferBetweenBookingsMin: number }>> {
  const validated = validateBufferMinutes(bufferBetweenBookingsMin);
  if (!validated.ok) return validated;

  try {
    const updated = await prisma.provider.update({
      where: { id: providerId },
      data: { bufferBetweenBookingsMin: validated.data },
      select: { bufferBetweenBookingsMin: true },
    });
    return { ok: true, data: { bufferBetweenBookingsMin: updated.bufferBetweenBookingsMin } };
  } catch {
    return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };
  }
}

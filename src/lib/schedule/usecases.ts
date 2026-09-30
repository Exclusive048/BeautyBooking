import { prisma } from "@/lib/prisma";
import { buildOccupancyBookingWhere, resolveOccupancyProviderIds } from "@/lib/schedule/occupancy";
import type { Prisma } from "@prisma/client";
import { isProduction } from "@/lib/env";
import type { Result } from "@/lib/domain/result";
import type {
  AvailabilitySlot,
  ScheduleBreakInterval,
  ScheduleOverride,
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
import { normalizeSlotStepMin } from "@/lib/schedule/editor-shared";
import {
  addDaysToDateKey,
  compareDateKeys,
  dateFromLocalDateKey,
  diffDateKeys,
  isDateKey,
} from "@/lib/schedule/dateKey";
import { createScheduleContext, getScheduleWindow } from "@/lib/schedule/engine-context";
import { withSingleFlight } from "@/lib/cache/single-flight";
import { buildBookingOverlapWhere } from "@/lib/schedule/overlap";
import { bucketRangesByDateKey, loadTimeBlockRanges } from "@/lib/schedule/time-blocks";

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

function validateBufferMinutes(value: number): Result<number> {
  if (!Number.isInteger(value)) {
    return { ok: false, status: 400, message: "Проверьте паузу между записями.", code: "BUFFER_INVALID" };
  }
  if (value < 0 || value > 30) {
    return { ok: false, status: 400, message: "Пауза между записями должна быть от 0 до 30 минут.", code: "BUFFER_INVALID" };
  }
  if (value % 5 !== 0) {
    return { ok: false, status: 400, message: "Проверьте паузу между записями.", code: "BUFFER_INVALID" };
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

function validateBreaks(
  breaks: ScheduleBreakInterval[] | undefined,
  dayStart: number,
  dayEnd: number
): Result<ScheduleBreakInterval[] | undefined> {
  if (!breaks) return { ok: true, data: undefined };
  if (breaks.length > 3) {
    return { ok: false, status: 400, message: "Слишком много перерывов.", code: "BREAKS_LIMIT" };
  }

  const normalized = breaks.map((b) => {
    const start = timeToMinutes(b.startLocal);
    const end = timeToMinutes(b.endLocal);
    return { start, end, raw: b };
  });

  for (const b of normalized) {
    if (b.start === null || b.end === null || b.start >= b.end) {
      return { ok: false, status: 400, message: "Некорректное время перерыва.", code: "BREAK_INVALID" };
    }
    if (b.start <= dayStart || b.end >= dayEnd) {
      return { ok: false, status: 400, message: "Перерыв выходит за рабочие часы.", code: "BREAK_RANGE" };
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
      return { ok: false, status: 400, message: "Перерывы пересекаются.", code: "BREAK_OVERLAP" };
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
    return { ok: false, status: 400, message: "Некорректный диапазон времени.", code: "TIME_RANGE_INVALID" };
  }

  const breaksResult = validateBreaks(input.breaks, start, end);
  if (!breaksResult.ok) return breaksResult;

  return { ok: true, data: { ...input, date, breaks: breaksResult.data } };
}

export async function setScheduleOverride(
  providerId: string,
  input: ScheduleOverride
): Promise<Result<ScheduleOverride>> {
  const validated = validateOverride(input);
  if (!validated.ok) return validated;

  const date = validated.data.date;
  const breaks = validated.data.breaks ?? undefined;
  const fields = {
    kind: validated.data.isDayOff ? ("OFF" as const) : ("TIME_RANGE" as const),
    isDayOff: validated.data.isDayOff,
    startLocal: validated.data.isDayOff ? null : validated.data.startLocal ?? null,
    endLocal: validated.data.isDayOff ? null : validated.data.endLocal ?? null,
    templateId: null,
    isActive: null,
    reason: validated.data.reason ?? null,
  };

  const ops: Prisma.PrismaPromise<unknown>[] = [
    // SCHEDULE-PATTERNS-01: строка на дату одна (`@@unique([providerId, date])`).
    prisma.scheduleOverride.upsert({
      where: { providerId_date: { providerId, date } },
      update: fields,
      create: { providerId, date, ...fields },
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
  input: {
    fromKey: string;
    toKeyExclusive?: string;
    limit?: number;
    /**
     * RESCHEDULE-SELF-SLOT (2026-09-15): бронь, которую переносят. Её окно
     * (и буфер вокруг) не считается занятым — иначе клиент, записанный на
     * 10:00 с 90-минутной услугой, не мог перенестись на 10:30 при пустом
     * дне: пикер не предлагал слот, хотя запись переноса (`ensureNoConflictsExcluding`)
     * приняла бы его. Ключ слот-кэша брони не знает, поэтому при исключении
     * кэш обходится целиком — ни чтения, ни записи, ни single-flight: это
     * один запрос на одно окно переноса, а не публичная выдача.
     */
    excludeBookingId?: string;
  }
): Promise<Result<AvailabilitySlotsPageResult>> {
  const startedAt = Date.now();
  const excludeBookingId = input.excludeBookingId ?? null;
  const bypassCache = excludeBookingId !== null;

  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % 5 !== 0) {
    return { ok: false, status: 400, message: "Некорректная длительность.", code: "DURATION_INVALID" };
  }

  if (!serviceId) {
    return { ok: false, status: 400, message: "Укажите услугу.", code: "SERVICE_REQUIRED" };
  }

  const requestedStartKey = input.fromKey;
  if (!isDateKey(requestedStartKey)) {
    return { ok: false, status: 400, message: "Некорректная дата начала.", code: "DATE_INVALID" };
  }

  if (input.toKeyExclusive && !isDateKey(input.toKeyExclusive)) {
    return { ok: false, status: 400, message: "Некорректная дата окончания.", code: "DATE_INVALID" };
  }

  const maxEndKeyExclusive = addDaysToDateKey(requestedStartKey, MAX_BOOKING_WINDOW_DAYS);
  const requestedEndKeyExclusive = input.toKeyExclusive ?? maxEndKeyExclusive;

  if (compareDateKeys(requestedEndKeyExclusive, requestedStartKey) < 0) {
    return { ok: false, status: 400, message: "Некорректный диапазон.", code: "RANGE_INVALID" };
  }

  if (compareDateKeys(requestedEndKeyExclusive, maxEndKeyExclusive) > 0) {
    return { ok: false, status: 400, message: "Слишком большой диапазон дат.", code: "RANGE_INVALID" };
  }

  const pageSize = clampPageSize(input.limit);
  const limitedEndKeyExclusive = addDaysToDateKey(requestedStartKey, pageSize);
  const actualEndKeyExclusive =
    compareDateKeys(limitedEndKeyExclusive, requestedEndKeyExclusive) < 0
      ? limitedEndKeyExclusive
      : requestedEndKeyExclusive;

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true, bufferBetweenBookingsMin: true, slotStepMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Профиль не найден.", code: "PROVIDER_NOT_FOUND" };

  const timezone = provider.timezone;
  const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
  const slotStepMin = normalizeSlotStepMin(provider.slotStepMin);

  // PERF-04: окно расписания (версия + горизонт публикации) разрешается ДО
  // контекста, потому что из него строится ключ слот-кэша. Раньше окно
  // приносил `createScheduleContext`, и вместе с ним безусловно приезжали
  // недельная конфигурация, шаблоны, override'ы и перерывы — данные, нужные
  // ТОЛЬКО на промахе. Сама версия теперь идёт через Redis
  // (`schedule-version-cache.ts`), а не через пятиоператорную транзакцию.
  const scheduleWindow = await getScheduleWindow(providerId, timezone);

  const days: Array<{ dateKey: string; cacheKey: string }> = [];
  for (
    let cursorKey = requestedStartKey;
    compareDateKeys(cursorKey, actualEndKeyExclusive) < 0;
    cursorKey = addDaysToDateKey(cursorKey, 1)
  ) {
    days.push({
      dateKey: cursorKey,
      cacheKey: buildSlotsCacheKey({
        masterId: providerId,
        dateKey: cursorKey,
        serviceId,
        serviceDuration: durationMin,
        bufferMin,
        slotStepMin,
        timeZone: timezone,
        scheduleVersion: scheduleWindow.scheduleVersion,
        publishedUntilLocal: scheduleWindow.publishedUntilLocal,
      }),
    });
  }

  const slotsByDateKey = new Map<string, AvailabilitySlot[]>();
  const cachedDays = bypassCache
    ? days.map(() => null)
    : await Promise.all(days.map((day) => getCachedSlots(day.cacheKey)));
  days.forEach((day, index) => {
    const cached = cachedDays[index];
    if (cached) slotsByDateKey.set(day.dateKey, cached);
  });

  const missingDays = days.filter((day) => !slotsByDateKey.has(day.dateKey));
  const now = new Date();
  let loadedBookingCount = 0;
  // Считается ВНУТРИ compute: под single-flight (PERF-10) непокрытые дни может
  // отдать победитель замка, и тогда этот запрос не пересчитал ничего.
  let recomputedDayCount = 0;

  if (missingDays.length > 0) {
    // PERF-10: пересчёт непокрытых дней идёт под single-flight-замком. Без него
    // истечение TTL горячего мастера означает, что одну и ту же работу делают ВСЕ
    // параллельные запросы. Проигравший ждёт ограниченно и, не дождавшись, считает
    // сам — дубль дешевле отказа.
    const computeMissingDays = async (): Promise<Map<string, AvailabilitySlot[]>> => {
      recomputedDayCount = missingDays.length;
      const computed = new Map<string, AvailabilitySlot[]>();
      // Диапазон сужен до непокрытых кэшем дней: остальные дни не пересчитываются,
      // значит их override'ы, брони и блокировки читать незачем. Полное попадание
      // в кэш вообще не доходит до этой ветки — ни одного из запросов ниже.
      const computeFromKey = missingDays[0].dateKey;
      const computeToKeyExclusive = addDaysToDateKey(missingDays[missingDays.length - 1].dateKey, 1);

      const ctx = await createScheduleContext({
        providerId,
        timezoneHint: timezone,
        range: { fromKey: computeFromKey, toKeyExclusive: computeToKeyExclusive },
        // Провайдер уже прочитан выше, окно уже разрешено — и окно обязано быть
        // тем же самым: ключ чтения и ключ записи должны совпадать.
        prefetched: { provider, scheduleWindow },
      });

      const rangeFromUtc = dateFromLocalDateKey(computeFromKey, timezone, 0, 0);
      const rangeToExclusiveUtc = dateFromLocalDateKey(computeToKeyExclusive, timezone, 0, 0);

      // STUDIO-MASTER-PROFILES: занятость — по всем профилям человека.
      const occupancyIds = await resolveOccupancyProviderIds(prisma, providerId);
      const bookings = await prisma.booking.findMany({
        where: {
          ...buildOccupancyBookingWhere(occupancyIds),
          status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
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
      loadedBookingCount = bookingRanges.length;

      const bookingsByDateKey = new Map<string, Array<{ startAtUtc: Date; endAtUtc: Date }>>();

      for (const booking of bookingRanges) {
        const startBookingKey = toLocalDateKey(booking.startAtUtc, timezone);
        const endBookingKeyExclusive = toLocalDateKeyExclusive(booking.endAtUtc, timezone);
        const clampedStart =
          compareDateKeys(startBookingKey, computeFromKey) < 0 ? computeFromKey : startBookingKey;
        const clampedEndExclusive =
          compareDateKeys(endBookingKeyExclusive, computeToKeyExclusive) > 0
            ? computeToKeyExclusive
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

      // FIX-TIMEBLOCK-ENFORCEMENT-01: studio/master TimeBlocks removed from the
      // engine output, same UTC-range treatment as bookings (bucketed to salon-local
      // days, clamped to the requested window). Block CRUD already calls
      // `invalidateSlotsForMaster`, so the per-day slot cache regenerates fresh.
      const blockRanges = await loadTimeBlockRanges(providerId, rangeFromUtc, rangeToExclusiveUtc);
      const blocksByDateKey = bucketRangesByDateKey(
        blockRanges,
        timezone,
        computeFromKey,
        computeToKeyExclusive,
      );

      for (const day of missingDays) {
        const dayPlan = await ScheduleEngine.getDayPlanFromContext(ctx, day.dateKey);
        const daySlots = buildSlotsForDay({
          dayPlan,
          dateKey: day.dateKey,
          timeZone: timezone,
          serviceDurationMin: durationMin,
          bufferMin,
          bookings: bookingsByDateKey.get(day.dateKey) ?? [],
          blocks: blocksByDateKey.get(day.dateKey) ?? [],
          now,
          slotStepMin,
        });
        computed.set(day.dateKey, daySlots);
        // RESCHEDULE-SELF-SLOT: выдача без одной брони — не то, что лежит в
        // общем кэше; писать её туда значило бы отдать следующему клиенту
        // занятое окно как свободное.
        if (bypassCache) continue;
        await setCachedSlotsForDate({
          key: day.cacheKey,
          masterId: providerId,
          dateKey: day.dateKey,
          slots: daySlots,
        });
      }

      return computed;
    };

    const computedDays = bypassCache
      ? await computeMissingDays()
      : await withSingleFlight<Map<string, AvailabilitySlot[]>>({
          // Замок именует ровно ту работу, которую защищает: провайдер, услуга,
          // параметры сетки, версия расписания и непокрытый отрезок. Запросы с
          // разными отрезками друг друга не блокируют.
          lockKey: `sf:slots:${providerId}:${serviceId}:${durationMin}:${bufferMin}:${slotStepMin}:${timezone}:${scheduleWindow.scheduleVersion}:${missingDays[0].dateKey}:${missingDays[missingDays.length - 1].dateKey}`,
          read: async () => {
            const values = await Promise.all(missingDays.map((day) => getCachedSlots(day.cacheKey)));
            // Частично заполненный набор — ещё не результат: победитель пишет дни по
            // одному, и взять половину значило бы отдать неполный ответ.
            if (values.some((value) => !value)) return null;
            const filled = new Map<string, AvailabilitySlot[]>();
            missingDays.forEach((day, index) => filled.set(day.dateKey, values[index] as AvailabilitySlot[]));
            return filled;
          },
          compute: computeMissingDays,
        });

    for (const [dateKey, daySlots] of computedDays) {
      slotsByDateKey.set(dateKey, daySlots);
    }
  }

  const slots: AvailabilitySlot[] = days.flatMap((day) => slotsByDateKey.get(day.dateKey) ?? []);

  const totalDays = Math.max(0, diffDateKeys(requestedStartKey, actualEndKeyExclusive));
  const hasMore = compareDateKeys(actualEndKeyExclusive, requestedEndKeyExclusive) < 0;
  const meta: AvailabilitySlotsPageMeta = {
    fromDate: requestedStartKey,
    toDateExclusive: actualEndKeyExclusive,
    totalDays,
    hasMore,
    pageSize,
  };

  if (!isProduction) {
    const durationMs = Date.now() - startedAt;
    console.info(
      `[availability] provider=${providerId} days=${totalDays} missing=${missingDays.length} recomputed=${recomputedDayCount} bookings=${loadedBookingCount} slots=${slots.length} ms=${durationMs}`
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
    return { ok: false, status: 400, message: "Некорректная длительность.", code: "DURATION_INVALID" };
  }

  if (!serviceId) {
    return { ok: false, status: 400, message: "Укажите услугу.", code: "SERVICE_REQUIRED" };
  }

  const from = range.from;
  const to = range.to;
  if (from > to) {
    return { ok: false, status: 400, message: "Некорректный диапазон.", code: "RANGE_INVALID" };
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true, bufferBetweenBookingsMin: true, slotStepMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Профиль не найден.", code: "PROVIDER_NOT_FOUND" };

  const timezone = provider.timezone;
  const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
  const slotStepMin = normalizeSlotStepMin(provider.slotStepMin);
  const startKey = toLocalDateKey(from, timezone);
  const endKeyExclusive = toLocalDateKey(to, timezone);
  const ctx = await createScheduleContext({
    providerId,
    timezoneHint: timezone,
    range: { fromKey: startKey, toKeyExclusive: endKeyExclusive },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      // STUDIO-MASTER-PROFILES: занятость — по всем профилям человека.
      ...buildOccupancyBookingWhere(await resolveOccupancyProviderIds(prisma, providerId)),
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

  // FIX-TIMEBLOCK-ENFORCEMENT-01: TimeBlocks removed from availability (same
  // UTC-range treatment as bookings). No clamp — only days the slot loop visits
  // are consumed, exactly like the booking buckets above.
  const blockRanges = await loadTimeBlockRanges(providerId, from, to);
  const blocksByDateKey = bucketRangesByDateKey(blockRanges, timezone);

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
      slotStepMin,
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
        blocks: blocksByDateKey.get(cursorKey) ?? [],
        now,
        slotStepMin,
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
    return { ok: false, status: 404, message: "Профиль не найден.", code: "PROVIDER_NOT_FOUND" };
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
    return { ok: false, status: 404, message: "Профиль не найден.", code: "PROVIDER_NOT_FOUND" };
  }
}

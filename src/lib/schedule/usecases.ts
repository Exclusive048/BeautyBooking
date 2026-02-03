import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { Result } from "@/lib/domain/result";
import type {
  AvailabilitySlot,
  ScheduleBlock,
  ScheduleBreakInterval,
  ScheduleOverride,
  WeeklyScheduleItem,
} from "@/lib/domain/schedule";
import { addMinutes, dateFromKey, minutesToTime, timeToMinutes, toDateKey } from "@/lib/schedule/time";
import { getDayOfWeek, toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import { getCachedSlots, invalidateSlotsForMaster, setCachedSlots } from "@/lib/schedule/slotsCache";

type RangeInput = {
  from: Date;
  to: Date;
  stepMin?: number;
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

export async function listAvailabilitySlots(
  providerId: string,
  durationMin: number,
  range: RangeInput
): Promise<Result<AvailabilitySlot[]>> {
  if (!Number.isInteger(durationMin) || durationMin <= 0 || durationMin % 5 !== 0) {
    return { ok: false, status: 400, message: "Invalid duration", code: "DURATION_INVALID" };
  }

  const cached = await getCachedSlots(providerId, range.from, durationMin);
  if (cached) {
    return { ok: true, data: cached };
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true, bufferBetweenBookingsMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const stepMin = range.stepMin ?? 15;
  if (!Number.isInteger(stepMin) || stepMin <= 0) {
    return { ok: false, status: 400, message: "Invalid step", code: "STEP_INVALID" };
  }

  const from = normalizeDate(range.from);
  const to = normalizeDate(range.to);
  if (from > to) {
    return { ok: false, status: 400, message: "Invalid range", code: "RANGE_INVALID" };
  }

  const [weekly, overrides, blocks, bookings, weeklyBreaks, overrideBreaks] = await Promise.all([
    prisma.weeklySchedule.findMany({
      where: { providerId },
      orderBy: [{ dayOfWeek: "asc" }, { startLocal: "asc" }],
    }),
    prisma.scheduleOverride.findMany({
      where: { providerId, date: { gte: from, lte: to } },
    }),
    prisma.scheduleBlock.findMany({
      where: { providerId, date: { gte: from, lte: to } },
    }),
    prisma.booking.findMany({
      where: {
        providerId,
        status: { not: "CANCELLED" },
        startAtUtc: { not: null, lte: addMinutes(to, 24 * 60) },
        endAtUtc: { not: null, gte: from },
      },
      select: { id: true, startAtUtc: true, endAtUtc: true },
    }),
    prisma.scheduleBreak.findMany({
      where: { providerId, kind: "WEEKLY" },
      select: { dayOfWeek: true, startLocal: true, endLocal: true },
    }),
    prisma.scheduleBreak.findMany({
      where: { providerId, kind: "OVERRIDE", date: { gte: from, lte: to } },
      select: { date: true, startLocal: true, endLocal: true },
    }),
  ]);

  const overridesByDate = new Map<string, typeof overrides>();
  for (const item of overrides) {
    const key = toDateKey(item.date);
    const list = overridesByDate.get(key) ?? [];
    list.push(item);
    overridesByDate.set(key, list);
  }

  const blocksByDate = new Map<string, typeof blocks>();
  for (const block of blocks) {
    const key = toDateKey(block.date);
    const list = blocksByDate.get(key) ?? [];
    list.push(block);
    blocksByDate.set(key, list);
  }

  const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
  const weeklyBreaksByDay = new Map<number, typeof weeklyBreaks>();
  for (const b of weeklyBreaks) {
    const list = weeklyBreaksByDay.get(b.dayOfWeek ?? 0) ?? [];
    list.push(b);
    weeklyBreaksByDay.set(b.dayOfWeek ?? 0, list);
  }

  const overrideBreaksByDate = new Map<string, typeof overrideBreaks>();
  for (const b of overrideBreaks) {
    if (!b.date) continue;
    const key = toDateKey(b.date);
    const list = overrideBreaksByDate.get(key) ?? [];
    list.push(b);
    overrideBreaksByDate.set(key, list);
  }

  const slots: AvailabilitySlot[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor = addMinutes(cursor, 24 * 60)) {
    const dateKey = toDateKey(cursor);
    const localKey = toLocalDateKey(cursor, provider.timezone);
    const dateForLocal = dateFromKey(localKey) ?? cursor;
    const dayOfWeek = getDayOfWeek(dateForLocal, provider.timezone);

    const override = overridesByDate.get(dateKey)?.[0] ?? null;
    if (override?.isDayOff) continue;

    const dailyWindows = override
      ? [{ startLocal: override.startLocal ?? "", endLocal: override.endLocal ?? "" }]
      : weekly
          .filter((w) => w.dayOfWeek === dayOfWeek)
          .map((w) => ({ startLocal: w.startLocal, endLocal: w.endLocal }));

    if (!dailyWindows.length) continue;

    const dayBlocks = blocksByDate.get(dateKey) ?? [];
    const blockIntervals = dayBlocks
      .map((b) => {
        const start = timeToMinutes(b.startLocal);
        const end = timeToMinutes(b.endLocal);
        if (start === null || end === null) return null;
        return { start, end };
      })
      .filter((b): b is { start: number; end: number } => b !== null);

    const weeklyDayBreaks = override ? [] : weeklyBreaksByDay.get(dayOfWeek) ?? [];
    for (const br of weeklyDayBreaks) {
      const start = timeToMinutes(br.startLocal);
      const end = timeToMinutes(br.endLocal);
      if (start === null || end === null) continue;
      blockIntervals.push({ start, end });
    }

    if (override && !override.isDayOff) {
      const overrideDayBreaks = overrideBreaksByDate.get(dateKey) ?? [];
      for (const br of overrideDayBreaks) {
        const start = timeToMinutes(br.startLocal);
        const end = timeToMinutes(br.endLocal);
        if (start === null || end === null) continue;
        blockIntervals.push({ start, end });
      }
    }

    for (const window of dailyWindows) {
      const windowStart = timeToMinutes(window.startLocal);
      const windowEnd = timeToMinutes(window.endLocal);
      if (windowStart === null || windowEnd === null) continue;

      for (let t = windowStart; t + durationMin <= windowEnd; t += stepMin) {
        const startUtc = toUtcFromLocalDateTime(
          dateForLocal,
          Math.floor(t / 60),
          t % 60,
          provider.timezone
        );
        const endUtc = addMinutes(startUtc, durationMin);

        if (startUtc < range.from || endUtc > range.to) continue;

        const blocked = blockIntervals.some((b) => t < b.end && t + durationMin > b.start);
        if (blocked) continue;

        const hasConflict = bookings.some((b) => {
          if (!b.startAtUtc || !b.endAtUtc) return false;
          const bufferedStart = bufferMin ? addMinutes(b.startAtUtc, -bufferMin) : b.startAtUtc;
          const bufferedEnd = bufferMin ? addMinutes(b.endAtUtc, bufferMin) : b.endAtUtc;
          return startUtc < bufferedEnd && endUtc > bufferedStart;
        });
        if (hasConflict) continue;

        slots.push({
          startAtUtc: startUtc,
          endAtUtc: endUtc,
          label: `${localKey} ${minutesToTime(t)}`,
        });
      }
    }
  }

  await setCachedSlots(providerId, range.from, durationMin, slots);
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

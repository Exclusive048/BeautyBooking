import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import type {
  AvailabilitySlot,
  ScheduleBlock,
  ScheduleOverride,
  WeeklyScheduleItem,
} from "@/lib/domain/schedule";
import { addMinutes, dateFromKey, minutesToTime, timeToMinutes, toDateKey } from "@/lib/schedule/time";
import { getDayOfWeek, toLocalDateKey, toUtcFromLocalDateTime } from "@/lib/schedule/timezone";

type RangeInput = {
  from: Date;
  to: Date;
  stepMin?: number;
};

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

  return { ok: true, data: item };
}

function validateOverride(input: ScheduleOverride): Result<ScheduleOverride> {
  const date = normalizeDate(input.date);
  if (input.isDayOff) return { ok: true, data: { ...input, date } };

  const start = input.startLocal ? timeToMinutes(input.startLocal) : null;
  const end = input.endLocal ? timeToMinutes(input.endLocal) : null;
  if (start === null || end === null || start >= end) {
    return { ok: false, status: 400, message: "Invalid time range", code: "TIME_RANGE_INVALID" };
  }

  return { ok: true, data: { ...input, date } };
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

  await prisma.$transaction([
    prisma.weeklySchedule.deleteMany({ where: { providerId } }),
    prisma.weeklySchedule.createMany({
      data: normalized.map((item) => ({
        providerId,
        dayOfWeek: item.dayOfWeek,
        startLocal: item.startLocal,
        endLocal: item.endLocal,
      })),
    }),
  ]);

  return { ok: true, data: { count: normalized.length } };
}

export async function setScheduleOverride(
  providerId: string,
  input: ScheduleOverride
): Promise<Result<ScheduleOverride>> {
  const validated = validateOverride(input);
  if (!validated.ok) return validated;

  const date = validated.data.date;
  const existing = await prisma.scheduleOverride.findFirst({
    where: { providerId, date },
  });

  const saved = existing
    ? await prisma.scheduleOverride.update({
        where: { id: existing.id },
        data: {
          isDayOff: validated.data.isDayOff,
          startLocal: validated.data.isDayOff ? null : validated.data.startLocal ?? null,
          endLocal: validated.data.isDayOff ? null : validated.data.endLocal ?? null,
        },
      })
    : await prisma.scheduleOverride.create({
        data: {
          providerId,
          date,
          isDayOff: validated.data.isDayOff,
          startLocal: validated.data.isDayOff ? null : validated.data.startLocal ?? null,
          endLocal: validated.data.isDayOff ? null : validated.data.endLocal ?? null,
        },
      });

  return {
    ok: true,
    data: {
      date: saved.date,
      isDayOff: saved.isDayOff,
      startLocal: saved.startLocal,
      endLocal: saved.endLocal,
    },
  };
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

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, timezone: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const stepMin = range.stepMin ?? 10;
  if (!Number.isInteger(stepMin) || stepMin <= 0) {
    return { ok: false, status: 400, message: "Invalid step", code: "STEP_INVALID" };
  }

  const from = normalizeDate(range.from);
  const to = normalizeDate(range.to);
  if (from > to) {
    return { ok: false, status: 400, message: "Invalid range", code: "RANGE_INVALID" };
  }

  const [weekly, overrides, blocks, bookings] = await Promise.all([
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

  const slots: AvailabilitySlot[] = [];
  for (let cursor = new Date(from); cursor <= to; cursor = addMinutes(cursor, 24 * 60)) {
    const dateKey = toDateKey(cursor);
    const localKey = toLocalDateKey(cursor, provider.timezone);
    const dateForLocal = dateFromKey(localKey) ?? cursor;

    const override = overridesByDate.get(dateKey)?.[0] ?? null;
    if (override?.isDayOff) continue;

    const dailyWindows = override
      ? [{ startLocal: override.startLocal ?? "", endLocal: override.endLocal ?? "" }]
      : weekly
          .filter((w) => w.dayOfWeek === getDayOfWeek(dateForLocal, provider.timezone))
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
          return startUtc < b.endAtUtc && endUtc > b.startAtUtc;
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

  return { ok: true, data: slots };
}

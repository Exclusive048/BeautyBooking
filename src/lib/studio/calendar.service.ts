import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type CalendarView = "day" | "week" | "month";

export type StudioCalendarMaster = {
  id: string;
  name: string;
  isActive: boolean;
  avatarUrl: string | null;
};

export type StudioCalendarBooking = {
  id: string;
  masterId: string | null;
  serviceId: string;
  serviceTitle: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  clientName: string;
  clientPhone: string;
};

export type StudioCalendarBlock = {
  id: string;
  masterId: string;
  startAt: string;
  endAt: string;
  type: "BREAK" | "BLOCK";
  note: string | null;
};

export type StudioCalendarData = {
  masters: StudioCalendarMaster[];
  bookings: StudioCalendarBooking[];
  blocks: StudioCalendarBlock[];
};

function toDateRange(date: string, view: CalendarView): { from: Date; to: Date } {
  const base = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    throw new AppError("Invalid date", 400, "DATE_INVALID");
  }

  const from = new Date(base);
  const to = new Date(base);

  if (view === "day") {
    to.setUTCDate(to.getUTCDate() + 1);
    return { from, to };
  }

  if (view === "week") {
    const day = from.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    from.setUTCDate(from.getUTCDate() + diffToMonday);
    to.setTime(from.getTime());
    to.setUTCDate(to.getUTCDate() + 7);
    return { from, to };
  }

  from.setUTCDate(1);
  to.setUTCMonth(to.getUTCMonth() + 1, 1);
  return { from, to };
}

export async function getStudioCalendar(input: {
  studioId: string;
  date: string;
  view: CalendarView;
  masterIds?: string[];
}): Promise<StudioCalendarData> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  const { from, to } = toDateRange(input.date, input.view);
  const masterFilter = input.masterIds && input.masterIds.length > 0 ? input.masterIds : undefined;

  const masters = await prisma.provider.findMany({
    where: {
      type: "MASTER",
      studioId: studio.providerId,
      ...(masterFilter ? { id: { in: masterFilter } } : {}),
    },
    select: { id: true, name: true, isPublished: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studioId: input.studioId }, { providerId: studio.providerId }],
      startAtUtc: { gte: from, lt: to },
      ...(masterFilter ? { masterProviderId: { in: masterFilter } } : {}),
    },
    select: {
      id: true,
      masterProviderId: true,
      serviceId: true,
      service: {
        select: {
          title: true,
          name: true,
        },
      },
      startAtUtc: true,
      endAtUtc: true,
      status: true,
      clientName: true,
      clientPhone: true,
    },
    orderBy: { startAtUtc: "asc" },
  });

  const blocks = await prisma.timeBlock.findMany({
    where: {
      studioId: input.studioId,
      startAt: { lt: to },
      endAt: { gt: from },
      ...(masterFilter ? { masterId: { in: masterFilter } } : {}),
    },
    select: {
      id: true,
      masterId: true,
      startAt: true,
      endAt: true,
      type: true,
      note: true,
    },
    orderBy: { startAt: "asc" },
  });

  return {
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      isActive: master.isPublished,
      avatarUrl: master.avatarUrl ?? null,
    })),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      masterId: booking.masterProviderId ?? null,
      serviceId: booking.serviceId,
      serviceTitle: booking.service.title?.trim() || booking.service.name,
      startAt: booking.startAtUtc ? booking.startAtUtc.toISOString() : null,
      endAt: booking.endAtUtc ? booking.endAtUtc.toISOString() : null,
      status: booking.status,
      clientName: booking.clientName,
      clientPhone: booking.clientPhone,
    })),
    blocks: blocks.map((block) => ({
      id: block.id,
      masterId: block.masterId,
      startAt: block.startAt.toISOString(),
      endAt: block.endAt.toISOString(),
      type: block.type,
      note: block.note,
    })),
  };
}

export async function createStudioBlock(input: {
  studioId: string;
  masterId: string;
  startAt: Date;
  endAt: Date;
  type: "BREAK" | "BLOCK";
  note?: string;
}): Promise<StudioCalendarBlock> {
  if (input.endAt <= input.startAt) {
    throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
  }

  const created = await prisma.timeBlock.create({
    data: {
      studioId: input.studioId,
      masterId: input.masterId,
      startAt: input.startAt,
      endAt: input.endAt,
      type: input.type,
      note: input.note?.trim() || null,
    },
  });

  return {
    id: created.id,
    masterId: created.masterId,
    startAt: created.startAt.toISOString(),
    endAt: created.endAt.toISOString(),
    type: created.type,
    note: created.note,
  };
}

export async function updateStudioBlock(input: {
  studioId: string;
  blockId: string;
  startAt?: Date;
  endAt?: Date;
  type?: "BREAK" | "BLOCK";
  note?: string | null;
}): Promise<StudioCalendarBlock> {
  const block = await prisma.timeBlock.findUnique({
    where: { id: input.blockId },
    select: { id: true, studioId: true, startAt: true, endAt: true },
  });
  if (!block) {
    throw new AppError("Block not found", 404, "BLOCK_NOT_FOUND");
  }
  if (block.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const nextStartAt = input.startAt ?? block.startAt;
  const nextEndAt = input.endAt ?? block.endAt;
  if (nextEndAt <= nextStartAt) {
    throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
  }

  const updated = await prisma.timeBlock.update({
    where: { id: block.id },
    data: {
      ...(input.startAt ? { startAt: input.startAt } : {}),
      ...(input.endAt ? { endAt: input.endAt } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
    },
  });

  return {
    id: updated.id,
    masterId: updated.masterId,
    startAt: updated.startAt.toISOString(),
    endAt: updated.endAt.toISOString(),
    type: updated.type,
    note: updated.note,
  };
}

export async function deleteStudioBlock(input: {
  studioId: string;
  blockId: string;
}): Promise<{ id: string }> {
  const block = await prisma.timeBlock.findUnique({
    where: { id: input.blockId },
    select: { id: true, studioId: true },
  });
  if (!block) {
    throw new AppError("Block not found", 404, "BLOCK_NOT_FOUND");
  }
  if (block.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  await prisma.timeBlock.delete({ where: { id: block.id } });
  return { id: block.id };
}

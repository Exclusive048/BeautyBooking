import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

type MasterContext = {
  masterId: string;
  isSolo: boolean;
  studioProfileId: string | null;
};

async function getMasterContext(masterId: string): Promise<MasterContext> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: { id: true, studioId: true, type: true },
  });
  if (!master || master.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  if (!master.studioId) {
    return { masterId: master.id, isSolo: true, studioProfileId: null };
  }

  const studio = await prisma.studio.findUnique({
    where: { providerId: master.studioId },
    select: { id: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  return { masterId: master.id, isSolo: false, studioProfileId: studio.id };
}

function monthBounds(month: string): { from: Date; to: Date } {
  const from = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(from.getTime())) {
    throw new AppError("Invalid month", 400, "DATE_INVALID");
  }
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return { from, to };
}

export type MasterScheduleDayLoad = {
  date: string;
  count: number;
};

export type MasterScheduleData = {
  month: string;
  isSolo: boolean;
  dayLoads: MasterScheduleDayLoad[];
  exceptions: Array<{
    id: string;
    date: string;
    type: "OFF" | "SHIFT";
    startTime: string | null;
    endTime: string | null;
  }>;
  blocks: Array<{
    id: string;
    startAt: string;
    endAt: string;
    type: "BREAK" | "BLOCK";
    note: string | null;
  }>;
  requests: Array<{
    id: string;
    type: "OFF" | "SHIFT" | "BLOCK";
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
  }>;
};

export async function getMasterSchedule(input: {
  masterId: string;
  month: string;
}): Promise<MasterScheduleData> {
  const context = await getMasterContext(input.masterId);
  const { from, to } = monthBounds(input.month);

  const [bookings, exceptions, blocks, requests] = await Promise.all([
    prisma.booking.findMany({
      where: {
        masterProviderId: input.masterId,
        startAtUtc: { gte: from, lt: to },
      },
      select: { startAtUtc: true },
      orderBy: { startAtUtc: "asc" },
    }),
    prisma.workException.findMany({
      where: {
        masterId: input.masterId,
        date: { gte: from, lt: to },
      },
      select: { id: true, date: true, type: true, startTime: true, endTime: true },
      orderBy: { date: "asc" },
    }),
    prisma.timeBlock.findMany({
      where: {
        masterId: input.masterId,
        startAt: { gte: from, lt: to },
      },
      select: { id: true, startAt: true, endAt: true, type: true, note: true },
      orderBy: { startAt: "asc" },
    }),
    context.isSolo || !context.studioProfileId
      ? Promise.resolve([])
      : prisma.scheduleChangeRequest.findMany({
          where: {
            studioId: context.studioProfileId,
            masterId: input.masterId,
            createdAt: { gte: from, lt: to },
          },
          select: { id: true, type: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
  ]);

  const dayLoadMap = new Map<string, number>();
  bookings.forEach((item) => {
    if (!item.startAtUtc) return;
    const key = item.startAtUtc.toISOString().slice(0, 10);
    dayLoadMap.set(key, (dayLoadMap.get(key) ?? 0) + 1);
  });

  const dayLoads = Array.from(dayLoadMap.entries()).map(([date, count]) => ({ date, count }));

  return {
    month: input.month,
    isSolo: context.isSolo,
    dayLoads,
    exceptions: exceptions.map((item) => ({
      id: item.id,
      date: item.date.toISOString().slice(0, 10),
      type: item.type,
      startTime: item.startTime,
      endTime: item.endTime,
    })),
    blocks: blocks.map((item) => ({
      id: item.id,
      startAt: item.startAt.toISOString(),
      endAt: item.endAt.toISOString(),
      type: item.type,
      note: item.note,
    })),
    requests: requests.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function createMasterException(input: {
  masterId: string;
  date: string;
  type: "OFF" | "SHIFT";
  startTime?: string;
  endTime?: string;
}): Promise<{ applied: boolean; requestId?: string; exceptionId?: string }> {
  const context = await getMasterContext(input.masterId);

  if (input.type === "SHIFT" && (!input.startTime || !input.endTime)) {
    throw new AppError("Shift requires start and end time", 400, "VALIDATION_ERROR");
  }

  if (context.isSolo) {
    const created = await prisma.workException.create({
      data: {
        studioId: null,
        masterId: input.masterId,
        date: new Date(`${input.date}T00:00:00.000Z`),
        type: input.type,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      },
      select: { id: true },
    });
    return { applied: true, exceptionId: created.id };
  }

  const created = await prisma.scheduleChangeRequest.create({
    data: {
      studioId: context.studioProfileId!,
      masterId: input.masterId,
      type: input.type,
      payloadJson: JSON.stringify({
        date: input.date,
        type: input.type,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      }),
    },
    select: { id: true },
  });
  return { applied: false, requestId: created.id };
}

export async function deleteMasterException(input: {
  masterId: string;
  exceptionId: string;
}): Promise<{ id: string }> {
  const context = await getMasterContext(input.masterId);
  if (!context.isSolo) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const exception = await prisma.workException.findUnique({
    where: { id: input.exceptionId },
    select: { id: true, masterId: true, studioId: true },
  });
  if (!exception || exception.masterId !== input.masterId || exception.studioId !== null) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }
  await prisma.workException.delete({ where: { id: exception.id } });
  return { id: exception.id };
}

export async function createMasterBlock(input: {
  masterId: string;
  startAt: Date;
  endAt: Date;
  type: "BREAK" | "BLOCK";
  note?: string;
}): Promise<{ applied: boolean; blockId?: string; requestId?: string }> {
  if (input.endAt <= input.startAt) {
    throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
  }
  const context = await getMasterContext(input.masterId);

  if (context.isSolo) {
    const created = await prisma.timeBlock.create({
      data: {
        studioId: null,
        masterId: input.masterId,
        startAt: input.startAt,
        endAt: input.endAt,
        type: input.type,
        note: input.note?.trim() || null,
      },
      select: { id: true },
    });
    return { applied: true, blockId: created.id };
  }

  const created = await prisma.scheduleChangeRequest.create({
    data: {
      studioId: context.studioProfileId!,
      masterId: input.masterId,
      type: "BLOCK",
      payloadJson: JSON.stringify({
        startAt: input.startAt.toISOString(),
        endAt: input.endAt.toISOString(),
        type: input.type,
        note: input.note?.trim() || null,
      }),
    },
    select: { id: true },
  });
  return { applied: false, requestId: created.id };
}

export async function updateMasterBlock(input: {
  masterId: string;
  blockId: string;
  startAt: Date;
  endAt: Date;
  type: "BREAK" | "BLOCK";
  note?: string;
}): Promise<{ id: string }> {
  const context = await getMasterContext(input.masterId);
  if (!context.isSolo) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  if (input.endAt <= input.startAt) {
    throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
  }
  const block = await prisma.timeBlock.findUnique({
    where: { id: input.blockId },
    select: { id: true, masterId: true, studioId: true },
  });
  if (!block || block.masterId !== input.masterId || block.studioId !== null) {
    throw new AppError("Not found", 404, "BLOCK_NOT_FOUND");
  }
  await prisma.timeBlock.update({
    where: { id: input.blockId },
    data: {
      startAt: input.startAt,
      endAt: input.endAt,
      type: input.type,
      note: input.note?.trim() || null,
    },
  });
  return { id: input.blockId };
}

export async function deleteMasterBlock(input: {
  masterId: string;
  blockId: string;
}): Promise<{ id: string }> {
  const context = await getMasterContext(input.masterId);
  if (!context.isSolo) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  const block = await prisma.timeBlock.findUnique({
    where: { id: input.blockId },
    select: { id: true, masterId: true, studioId: true },
  });
  if (!block || block.masterId !== input.masterId || block.studioId !== null) {
    throw new AppError("Not found", 404, "BLOCK_NOT_FOUND");
  }
  await prisma.timeBlock.delete({ where: { id: input.blockId } });
  return { id: input.blockId };
}

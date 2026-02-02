import { WorkExceptionType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

type StudioContext = {
  id: string;
  providerId: string;
};

async function getStudioContext(studioId: string): Promise<StudioContext> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  return studio;
}

async function ensureStudioMaster(studioId: string, masterId: string): Promise<void> {
  const studio = await getStudioContext(studioId);
  const master = await prisma.provider.findFirst({
    where: {
      id: masterId,
      type: "MASTER",
      studioId: studio.providerId,
    },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }
}

export type MasterScheduleData = {
  templates: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
  }>;
  dayRules: Array<{
    id: string;
    weekday: number;
    templateId: string;
    isWorking: boolean;
  }>;
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
};

export async function getStudioMasterSchedule(input: {
  studioId: string;
  masterId: string;
}): Promise<MasterScheduleData> {
  await ensureStudioMaster(input.studioId, input.masterId);

  const [templates, dayRules, exceptions, blocks] = await Promise.all([
    prisma.workShiftTemplate.findMany({
      where: {
        studioId: input.studioId,
        OR: [{ masterId: input.masterId }, { masterId: null }],
      },
      orderBy: [{ masterId: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.workDayRule.findMany({
      where: { studioId: input.studioId, masterId: input.masterId },
      orderBy: { weekday: "asc" },
      select: {
        id: true,
        weekday: true,
        templateId: true,
        isWorking: true,
      },
    }),
    prisma.workException.findMany({
      where: { studioId: input.studioId, masterId: input.masterId },
      orderBy: { date: "desc" },
      take: 30,
      select: {
        id: true,
        date: true,
        type: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.timeBlock.findMany({
      where: { studioId: input.studioId, masterId: input.masterId },
      orderBy: { startAt: "desc" },
      take: 30,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        type: true,
        note: true,
      },
    }),
  ]);

  return {
    templates,
    dayRules,
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
  };
}

export async function createStudioWorkTemplate(input: {
  studioId: string;
  masterId: string;
  title: string;
  startTime: string;
  endTime: string;
}): Promise<{ id: string }> {
  await ensureStudioMaster(input.studioId, input.masterId);
  const created = await prisma.workShiftTemplate.create({
    data: {
      studioId: input.studioId,
      masterId: input.masterId,
      title: input.title.trim(),
      startTime: input.startTime,
      endTime: input.endTime,
    },
    select: { id: true },
  });
  return { id: created.id };
}

export async function upsertStudioDayRules(input: {
  studioId: string;
  masterId: string;
  items: Array<{
    weekday: number;
    templateId: string;
    isWorking: boolean;
  }>;
}): Promise<{ updated: number }> {
  await ensureStudioMaster(input.studioId, input.masterId);

  const templates = await prisma.workShiftTemplate.findMany({
    where: {
      id: { in: input.items.map((item) => item.templateId) },
      studioId: input.studioId,
      OR: [{ masterId: input.masterId }, { masterId: null }],
    },
    select: { id: true },
  });
  if (templates.length !== input.items.length) {
    throw new AppError("Template not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction(
    input.items.map((item) =>
      prisma.workDayRule.upsert({
        where: {
          studioId_masterId_weekday: {
            studioId: input.studioId,
            masterId: input.masterId,
            weekday: item.weekday,
          },
        },
        create: {
          studioId: input.studioId,
          masterId: input.masterId,
          weekday: item.weekday,
          templateId: item.templateId,
          isWorking: item.isWorking,
        },
        update: {
          templateId: item.templateId,
          isWorking: item.isWorking,
        },
      })
    )
  );

  return { updated: input.items.length };
}

export async function createStudioWorkException(input: {
  studioId: string;
  masterId: string;
  date: string;
  type: "OFF" | "SHIFT";
  startTime?: string;
  endTime?: string;
}): Promise<{ id: string }> {
  await ensureStudioMaster(input.studioId, input.masterId);

  if (input.type === WorkExceptionType.SHIFT && (!input.startTime || !input.endTime)) {
    throw new AppError("Shift exception requires start and end", 400, "VALIDATION_ERROR");
  }

  const created = await prisma.workException.create({
    data: {
      studioId: input.studioId,
      masterId: input.masterId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      type: input.type,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
    },
    select: { id: true },
  });
  return { id: created.id };
}

export async function deleteStudioWorkException(input: {
  studioId: string;
  masterId: string;
  exceptionId: string;
}): Promise<{ id: string }> {
  await ensureStudioMaster(input.studioId, input.masterId);

  const exception = await prisma.workException.findUnique({
    where: { id: input.exceptionId },
    select: { id: true, studioId: true, masterId: true },
  });
  if (!exception || exception.studioId !== input.studioId || exception.masterId !== input.masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  await prisma.workException.delete({ where: { id: exception.id } });
  return { id: exception.id };
}

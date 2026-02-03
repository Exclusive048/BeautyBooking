import { WorkExceptionType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";

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

type TemplateBreak = {
  startTime: string;
  endTime: string;
};

type TemplateBreakStored = {
  startLocal: string;
  endLocal: string;
};

function mapStudioWeekdayToSystemWeekday(studioWeekday: number): number {
  return studioWeekday === 6 ? 0 : studioWeekday + 1;
}

function toMinutes(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeTemplateBreaks(input: TemplateBreak[], workStart: string, workEnd: string): TemplateBreakStored[] {
  if (input.length > 3) {
    throw new AppError("Too many breaks", 400, "BREAKS_LIMIT");
  }

  const workStartMin = toMinutes(workStart);
  const workEndMin = toMinutes(workEnd);
  if (workStartMin === null || workEndMin === null || workStartMin >= workEndMin) {
    throw new AppError("Invalid time range", 400, "TIME_RANGE_INVALID");
  }

  const normalized = input.map((item) => {
    const startMin = toMinutes(item.startTime);
    const endMin = toMinutes(item.endTime);
    if (startMin === null || endMin === null || startMin >= endMin) {
      throw new AppError("Invalid break time", 400, "BREAK_INVALID");
    }
    if (startMin <= workStartMin || endMin >= workEndMin) {
      throw new AppError("Break out of range", 400, "BREAK_RANGE");
    }

    return {
      startTime: item.startTime,
      endTime: item.endTime,
      startMin,
      endMin,
    };
  });

  const sorted = normalized.slice().sort((a, b) => a.startMin - b.startMin);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startMin < sorted[index - 1].endMin) {
      throw new AppError("Breaks overlap", 400, "BREAK_OVERLAP");
    }
  }

  return sorted.map((item) => ({
    startLocal: item.startTime,
    endLocal: item.endTime,
  }));
}

function readTemplateBreaks(raw: string | null): TemplateBreakStored[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const startLocal = "startLocal" in item ? item.startLocal : null;
        const endLocal = "endLocal" in item ? item.endLocal : null;
        if (typeof startLocal !== "string" || typeof endLocal !== "string") return null;
        return { startLocal, endLocal };
      })
      .filter((item): item is TemplateBreakStored => item !== null);
  } catch {
    return [];
  }
}

async function ensureStudioMaster(studioId: string, masterId: string): Promise<{ providerId: string }> {
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
  return { providerId: master.id };
}

async function syncMasterScheduleForSlots(input: {
  studioId: string;
  masterId: string;
  providerId: string;
}): Promise<void> {
  const [dayRules, templates] = await Promise.all([
    prisma.workDayRule.findMany({
      where: { studioId: input.studioId, masterId: input.masterId },
      select: { weekday: true, templateId: true, isWorking: true },
    }),
    prisma.workShiftTemplate.findMany({
      where: {
        studioId: input.studioId,
        OR: [{ masterId: input.masterId }, { masterId: null }],
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        breakRulesJson: true,
      },
    }),
  ]);

  const templateById = new Map(
    templates.map((template) => [
      template.id,
      {
        startTime: template.startTime,
        endTime: template.endTime,
        breaks: readTemplateBreaks(template.breakRulesJson),
      },
    ])
  );

  const weeklyItems = dayRules
    .filter((item) => item.isWorking)
    .map((item) => {
      const template = templateById.get(item.templateId);
      if (!template) return null;
      return {
        dayOfWeek: mapStudioWeekdayToSystemWeekday(item.weekday),
        startLocal: template.startTime,
        endLocal: template.endTime,
        breaks: template.breaks,
      };
    })
    .filter(
      (
        item
      ): item is {
        dayOfWeek: number;
        startLocal: string;
        endLocal: string;
        breaks: TemplateBreakStored[];
      } => item !== null
    );

  const weeklyScheduleData = weeklyItems.map((item) => ({
    providerId: input.providerId,
    dayOfWeek: item.dayOfWeek,
    startLocal: item.startLocal,
    endLocal: item.endLocal,
  }));

  const weeklyBreaksData = weeklyItems.flatMap((item) =>
    item.breaks.map((breakItem) => ({
      providerId: input.providerId,
      kind: "WEEKLY" as const,
      dayOfWeek: item.dayOfWeek,
      startLocal: breakItem.startLocal,
      endLocal: breakItem.endLocal,
    }))
  );

  await prisma.$transaction([
    prisma.weeklySchedule.deleteMany({ where: { providerId: input.providerId } }),
    prisma.scheduleBreak.deleteMany({ where: { providerId: input.providerId, kind: "WEEKLY" } }),
    prisma.weeklySchedule.createMany({ data: weeklyScheduleData }),
    ...(weeklyBreaksData.length > 0 ? [prisma.scheduleBreak.createMany({ data: weeklyBreaksData })] : []),
  ]);

  await invalidateSlotsForMaster(input.providerId);
}

export type MasterScheduleData = {
  templates: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    breaks: TemplateBreak[];
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
        breakRulesJson: true,
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
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      startTime: template.startTime,
      endTime: template.endTime,
      breaks: readTemplateBreaks(template.breakRulesJson).map((item) => ({
        startTime: item.startLocal,
        endTime: item.endLocal,
      })),
    })),
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
  breaks: TemplateBreak[];
}): Promise<{ id: string }> {
  await ensureStudioMaster(input.studioId, input.masterId);
  const breaks = normalizeTemplateBreaks(input.breaks, input.startTime, input.endTime);
  const created = await prisma.workShiftTemplate.create({
    data: {
      studioId: input.studioId,
      masterId: input.masterId,
      title: input.title.trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      breakRulesJson: JSON.stringify(breaks),
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
  const master = await ensureStudioMaster(input.studioId, input.masterId);

  const templates = await prisma.workShiftTemplate.findMany({
    where: {
      id: { in: input.items.map((item) => item.templateId) },
      studioId: input.studioId,
      OR: [{ masterId: input.masterId }, { masterId: null }],
    },
    select: { id: true },
  });
  const uniqueTemplateCount = new Set(input.items.map((item) => item.templateId)).size;
  if (templates.length !== uniqueTemplateCount) {
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
  await syncMasterScheduleForSlots({
    studioId: input.studioId,
    masterId: input.masterId,
    providerId: master.providerId,
  });

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
  const master = await ensureStudioMaster(input.studioId, input.masterId);

  if (input.type === WorkExceptionType.SHIFT && (!input.startTime || !input.endTime)) {
    throw new AppError("Shift exception requires start and end", 400, "VALIDATION_ERROR");
  }

  const date = new Date(`${input.date}T00:00:00.000Z`);

  const created = await prisma.workException.create({
    data: {
      studioId: input.studioId,
      masterId: input.masterId,
      date,
      type: input.type,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
    },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.scheduleOverride.deleteMany({
      where: { providerId: master.providerId, date },
    }),
    prisma.scheduleBreak.deleteMany({
      where: { providerId: master.providerId, kind: "OVERRIDE", date },
    }),
    prisma.scheduleOverride.create({
      data: {
        providerId: master.providerId,
        date,
        isDayOff: input.type === "OFF",
        startLocal: input.type === "SHIFT" ? input.startTime ?? null : null,
        endLocal: input.type === "SHIFT" ? input.endTime ?? null : null,
      },
    }),
  ]);
  await invalidateSlotsForMaster(master.providerId);

  return { id: created.id };
}

export async function deleteStudioWorkException(input: {
  studioId: string;
  masterId: string;
  exceptionId: string;
}): Promise<{ id: string }> {
  const master = await ensureStudioMaster(input.studioId, input.masterId);

  const exception = await prisma.workException.findUnique({
    where: { id: input.exceptionId },
    select: { id: true, studioId: true, masterId: true, date: true },
  });
  if (!exception || exception.studioId !== input.studioId || exception.masterId !== input.masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.workException.delete({ where: { id: exception.id } }),
    prisma.scheduleOverride.deleteMany({
      where: { providerId: master.providerId, date: exception.date },
    }),
    prisma.scheduleBreak.deleteMany({
      where: { providerId: master.providerId, kind: "OVERRIDE", date: exception.date },
    }),
  ]);
  await invalidateSlotsForMaster(master.providerId);

  return { id: exception.id };
}

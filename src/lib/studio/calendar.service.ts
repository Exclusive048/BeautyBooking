import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { invalidateSlotsForMaster } from "@/lib/schedule/slotsCache";
import { assertBelongsToStudio } from "@/lib/studio/tenancy";

export type StudioCalendarBlock = {
  id: string;
  masterId: string;
  startAt: string;
  endAt: string;
  type: "BREAK" | "BLOCK";
  note: string | null;
};

export async function createStudioBlock(input: {
  studioId: string;
  masterId: string;
  startAt: Date;
  endAt: Date;
  type: "BREAK" | "BLOCK";
  note?: string;
}): Promise<StudioCalendarBlock> {
  if (input.endAt <= input.startAt) {
    throw new AppError("Некорректный диапазон времени.", 400, "TIME_RANGE_INVALID");
  }

  // SECURITY-EXPOSURE-AUDIT-01 #1 (R1a): the masterId was trusted — any studio
  // could block any provider's calendar. Scope it to this studio.
  await assertBelongsToStudio("master", input.masterId, input.studioId);

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

  // STUDIO-GAPS-FIX-A: invalidate the master's slot cache so the public
  // booking widget reflects the new block. Pre-existing endpoints did
  // not do this; breaks/blocks created via the legacy editor relied on
  // the master cabinet's own invalidation pass. Surgical fix kept here
  // to avoid leaving stale slot availability after the new admin UI.
  await invalidateSlotsForMaster(input.masterId);

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
    throw new AppError("Блокировка не найдена.", 404, "BLOCK_NOT_FOUND");
  }
  if (block.studioId !== input.studioId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  const nextStartAt = input.startAt ?? block.startAt;
  const nextEndAt = input.endAt ?? block.endAt;
  if (nextEndAt <= nextStartAt) {
    throw new AppError("Некорректный диапазон времени.", 400, "TIME_RANGE_INVALID");
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

  await invalidateSlotsForMaster(updated.masterId);

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
    select: { id: true, studioId: true, masterId: true },
  });
  if (!block) {
    throw new AppError("Блокировка не найдена.", 404, "BLOCK_NOT_FOUND");
  }
  if (block.studioId !== input.studioId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }
  await prisma.timeBlock.delete({ where: { id: block.id } });
  await invalidateSlotsForMaster(block.masterId);
  return { id: block.id };
}

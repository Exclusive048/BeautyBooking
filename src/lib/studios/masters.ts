import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import { ProviderType } from "@prisma/client";

type StudioMasterRecord = {
  id: string;
  name: string;
  studioId: string | null;
};

async function ensureStudio(studioId: string): Promise<Result<{ id: string }>> {
  const studio = await prisma.provider.findUnique({
    where: { id: studioId },
    select: { id: true, type: true },
  });
  if (!studio || studio.type !== ProviderType.STUDIO) {
    return { ok: false, status: 404, message: "Студия не найдена.", code: "STUDIO_NOT_FOUND" };
  }
  return { ok: true, data: { id: studio.id } };
}

export async function listStudioMasters(studioId: string): Promise<Result<StudioMasterRecord[]>> {
  const studio = await ensureStudio(studioId);
  if (!studio.ok) return studio;

  const masters = await prisma.provider.findMany({
    where: { studioId, type: ProviderType.MASTER },
    select: { id: true, name: true, studioId: true },
    orderBy: { createdAt: "asc" },
  });

  return { ok: true, data: masters };
}

export async function attachMasterToStudio(
  studioId: string,
  masterProviderId: string
): Promise<Result<StudioMasterRecord>> {
  const studio = await ensureStudio(studioId);
  if (!studio.ok) return studio;

  // SEC-27: правило «привязать можно только мастера БЕЗ студии либо уже этой же»
  // живёт в запросе, а не в ветке `if (master.studioId && master.studioId !== studioId)`.
  // Ту форму `lib/studio/tenancy.ts` прямо называет багом (NULL-PERMISSIVE):
  // при `studioId === null` условие ложно, и ветка «перепривязать» оказывается
  // общей для «свободного мастера» и для «мастера, которого никто не спрашивал».
  // Сегодня это не эксплуатируется — HTTP-хендлер прямой привязки удалён, а
  // единственный вызывающий (приём приглашения) передаёт СОБСТВЕННЫЙ provider
  // принимающего, — но это инвариант уровня ревью: любой новый вызывающий молча
  // возвращал бы захват solo-мастера. Теперь условие нельзя не заметить: оно в
  // `where`.
  const master = await prisma.provider.findFirst({
    where: {
      id: masterProviderId,
      type: ProviderType.MASTER,
      OR: [{ studioId: null }, { studioId }],
    },
    select: { id: true, name: true, studioId: true },
  });

  if (!master) {
    // Решение уже принято запросом; здесь только выбирается текст ответа —
    // «мастера нет» и «мастер занят» это разные ответы для принимающего
    // приглашение, и схлопывать их в один было бы регрессом флоу.
    const existingMasters = await prisma.provider.count({
      where: { id: masterProviderId, type: ProviderType.MASTER },
    });
    return existingMasters > 0
      ? { ok: false, status: 409, message: "Мастер уже состоит в студии.", code: "MASTER_ALREADY_ASSIGNED" }
      : { ok: false, status: 404, message: "Мастер не найден.", code: "MASTER_NOT_FOUND" };
  }

  if (master.studioId === studioId) {
    return { ok: true, data: { id: master.id, name: master.name, studioId: master.studioId } };
  }

  // Между чтением и записью мастера могла принять другая студия (два
  // приглашения, принятые одновременно). Состояние повторяется в `where`, чтобы
  // гонка кончалась отказом, а не тихой перепривязкой.
  const attached = await prisma.provider.updateMany({
    where: { id: master.id, type: ProviderType.MASTER, studioId: null },
    data: { studioId },
  });

  if (attached.count === 0) {
    return { ok: false, status: 409, message: "Мастер уже состоит в студии.", code: "MASTER_ALREADY_ASSIGNED" };
  }

  return { ok: true, data: { id: master.id, name: master.name, studioId } };
}

export async function detachMasterFromStudio(
  studioId: string,
  masterProviderId: string
): Promise<Result<StudioMasterRecord>> {
  const studio = await ensureStudio(studioId);
  if (!studio.ok) return studio;

  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, name: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER || master.studioId !== studioId) {
    return { ok: false, status: 404, message: "Мастер не найден.", code: "MASTER_NOT_FOUND" };
  }

  const updated = await prisma.provider.update({
    where: { id: master.id },
    data: { studioId: null },
    select: { id: true, name: true, studioId: true },
  });

  return { ok: true, data: updated };
}

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
    return { ok: false, status: 404, message: "Studio not found", code: "STUDIO_NOT_FOUND" };
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

  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, name: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER) {
    return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  if (master.studioId && master.studioId !== studioId) {
    return { ok: false, status: 409, message: "Master already belongs to a studio", code: "MASTER_ALREADY_ASSIGNED" };
  }

  if (master.studioId === studioId) {
    return { ok: true, data: { id: master.id, name: master.name, studioId: master.studioId } };
  }

  const updated = await prisma.provider.update({
    where: { id: master.id },
    data: { studioId },
    select: { id: true, name: true, studioId: true },
  });

  return { ok: true, data: updated };
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
    return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  const updated = await prisma.provider.update({
    where: { id: master.id },
    data: { studioId: null },
    select: { id: true, name: true, studioId: true },
  });

  return { ok: true, data: updated };
}

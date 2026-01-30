import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";

export type StudioMemberServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  catalogEnabled: boolean;
  enabled: boolean;
};

type MasterProvider = {
  id: string;
};

export async function resolveStudioMasterProvider(
  studioProviderId: string,
  userId: string
): Promise<Result<MasterProvider>> {
  const studioProvider = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { id: true, type: true },
  });
  if (!studioProvider || studioProvider.type !== ProviderType.STUDIO) {
    return { ok: false, status: 404, message: "Studio not found", code: "STUDIO_NOT_FOUND" };
  }

  const masterProvider = await prisma.provider.findFirst({
    where: {
      ownerUserId: userId,
      type: ProviderType.MASTER,
      studioId: studioProviderId,
    },
    select: { id: true },
  });

  if (!masterProvider) {
    return {
      ok: false,
      status: 404,
      message: "Master profile not found",
      code: "MASTER_PROFILE_NOT_FOUND",
    };
  }

  return { ok: true, data: masterProvider };
}

export async function listStudioMemberServices(
  studioProviderId: string,
  masterProviderId: string
): Promise<Result<StudioMemberServiceItem[]>> {
  const studioProvider = await prisma.provider.findUnique({
    where: { id: studioProviderId },
    select: { id: true, type: true },
  });
  if (!studioProvider || studioProvider.type !== ProviderType.STUDIO) {
    return { ok: false, status: 404, message: "Studio not found", code: "STUDIO_NOT_FOUND" };
  }

  const services = await prisma.service.findMany({
    where: { providerId: studioProviderId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      durationMin: true,
      price: true,
      isEnabled: true,
    },
  });

  const overrides = await prisma.masterService.findMany({
    where: { masterProviderId },
    select: { serviceId: true, isEnabled: true },
  });

  const overrideMap = new Map(overrides.map((o) => [o.serviceId, o]));

  const items: StudioMemberServiceItem[] = services.map((service) => {
    const override = overrideMap.get(service.id);
    const enabled = service.isEnabled && (override?.isEnabled ?? true);
    return {
      id: service.id,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
      catalogEnabled: service.isEnabled,
      enabled,
    };
  });

  return { ok: true, data: items };
}

export async function setStudioMemberServiceEnabled(
  studioProviderId: string,
  masterProviderId: string,
  serviceId: string,
  enabled: boolean
): Promise<Result<{ id: string; enabled: boolean }>> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true },
  });
  if (!service || service.providerId !== studioProviderId) {
    return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };
  }

  await prisma.masterService.upsert({
    where: { masterProviderId_serviceId: { masterProviderId, serviceId } },
    update: { isEnabled: enabled },
    create: { masterProviderId, serviceId, isEnabled: enabled },
  });

  return { ok: true, data: { id: serviceId, enabled } };
}

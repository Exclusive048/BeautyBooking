import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import type { MasterServiceOverride } from "@/lib/domain/services";
import { ProviderType } from "@prisma/client";

type MasterServiceRecord = {
  id: string;
  masterProviderId: string;
  serviceId: string;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  isEnabled: boolean;
};

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateOverride(input: MasterServiceOverride): Result<MasterServiceOverride> {
  if (input.priceOverride !== undefined && input.priceOverride !== null) {
    if (!isPositiveInt(input.priceOverride)) {
      return { ok: false, status: 400, message: "Price must be a positive integer", code: "PRICE_INVALID" };
    }
  }

  if (input.durationOverrideMin !== undefined && input.durationOverrideMin !== null) {
    if (!isPositiveInt(input.durationOverrideMin) || input.durationOverrideMin % 5 !== 0) {
      return {
        ok: false,
        status: 400,
        message: "Duration must be a positive multiple of 5",
        code: "DURATION_INVALID",
      };
    }
  }

  return { ok: true, data: input };
}

export async function listMasterServiceOverrides(
  studioId: string,
  masterProviderId: string
): Promise<Result<MasterServiceRecord[]>> {
  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER || master.studioId !== studioId) {
    return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  const overrides = await prisma.masterService.findMany({
    where: { masterProviderId },
    orderBy: { createdAt: "asc" },
  });

  return { ok: true, data: overrides };
}

export async function setMasterServiceOverride(
  studioId: string,
  masterProviderId: string,
  serviceId: string,
  input: MasterServiceOverride
): Promise<Result<MasterServiceRecord>> {
  const validated = validateOverride(input);
  if (!validated.ok) return validated;

  const studio = await prisma.provider.findUnique({
    where: { id: studioId },
    select: { id: true, type: true },
  });
  if (!studio || studio.type !== ProviderType.STUDIO) {
    return { ok: false, status: 404, message: "Studio not found", code: "STUDIO_NOT_FOUND" };
  }

  const master = await prisma.provider.findUnique({
    where: { id: masterProviderId },
    select: { id: true, type: true, studioId: true },
  });
  if (!master || master.type !== ProviderType.MASTER || master.studioId !== studioId) {
    return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, providerId: true },
  });
  if (!service || service.providerId !== studioId) {
    return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };
  }

  const upserted = await prisma.masterService.upsert({
    where: { masterProviderId_serviceId: { masterProviderId, serviceId } },
    update: {
      priceOverride: validated.data.priceOverride ?? null,
      durationOverrideMin: validated.data.durationOverrideMin ?? null,
      isEnabled: validated.data.isEnabled ?? true,
    },
    create: {
      masterProviderId,
      serviceId,
      priceOverride: validated.data.priceOverride ?? null,
      durationOverrideMin: validated.data.durationOverrideMin ?? null,
      isEnabled: validated.data.isEnabled ?? true,
    },
  });

  return { ok: true, data: upserted };
}

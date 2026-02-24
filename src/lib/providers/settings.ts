import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export type ProviderSettings = {
  autoConfirmBookings: boolean;
  cancellationDeadlineHours: number | null;
};

export function isAutoConfirmAllowed(provider: { type: ProviderType; studioId: string | null }): boolean {
  return provider.type === ProviderType.MASTER && !provider.studioId;
}

function isSoloMaster(provider: { type: ProviderType; studioId: string | null }): boolean {
  return provider.type === ProviderType.MASTER && !provider.studioId;
}

export async function getProviderSettings(userId: string): Promise<ProviderSettings> {
  const providerId = await getCurrentMasterProviderId(userId);
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      type: true,
      studioId: true,
      autoConfirmBookings: true,
      cancellationDeadlineHours: true,
    },
  });

  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (!isSoloMaster(provider)) {
    throw new AppError("Settings are not allowed for studio masters", 403, "FORBIDDEN");
  }

  return {
    autoConfirmBookings: provider.autoConfirmBookings,
    cancellationDeadlineHours: provider.cancellationDeadlineHours ?? null,
  };
}

export async function updateProviderSettings(
  userId: string,
  input: { autoConfirmBookings?: boolean; cancellationDeadlineHours?: number | null }
): Promise<ProviderSettings> {
  const providerId = await getCurrentMasterProviderId(userId);
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, studioId: true },
  });

  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (!isSoloMaster(provider)) {
    throw new AppError("Settings are not allowed for studio masters", 403, "FORBIDDEN");
  }

  const data: { autoConfirmBookings?: boolean; cancellationDeadlineHours?: number | null } = {};
  if (input.autoConfirmBookings !== undefined) {
    data.autoConfirmBookings = input.autoConfirmBookings;
  }
  if (input.cancellationDeadlineHours !== undefined) {
    data.cancellationDeadlineHours = input.cancellationDeadlineHours;
  }

  const updated = await prisma.provider.update({
    where: { id: provider.id },
    data,
    select: { autoConfirmBookings: true, cancellationDeadlineHours: true },
  });

  return {
    autoConfirmBookings: updated.autoConfirmBookings,
    cancellationDeadlineHours: updated.cancellationDeadlineHours ?? null,
  };
}

import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { getCurrentMasterProviderId } from "@/lib/master/access";

export function isAutoConfirmAllowed(provider: { type: ProviderType; studioId: string | null }): boolean {
  return provider.type === ProviderType.MASTER && !provider.studioId;
}

export async function getProviderAutoConfirmSettings(userId: string): Promise<{
  autoConfirmBookings: boolean;
}> {
  const providerId = await getCurrentMasterProviderId(userId);
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, studioId: true, autoConfirmBookings: true },
  });

  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (!isAutoConfirmAllowed(provider)) {
    throw new AppError("Auto confirm is not allowed for studio masters", 403, "AUTO_CONFIRM_NOT_ALLOWED_FOR_STUDIO");
  }

  return { autoConfirmBookings: provider.autoConfirmBookings };
}

export async function updateProviderAutoConfirmSettings(
  userId: string,
  input: { autoConfirmBookings: boolean }
): Promise<{ autoConfirmBookings: boolean }> {
  const providerId = await getCurrentMasterProviderId(userId);
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { id: true, type: true, studioId: true },
  });

  if (!provider || provider.type !== "MASTER") {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (!isAutoConfirmAllowed(provider)) {
    throw new AppError("Auto confirm is not allowed for studio masters", 403, "AUTO_CONFIRM_NOT_ALLOWED_FOR_STUDIO");
  }

  const updated = await prisma.provider.update({
    where: { id: provider.id },
    data: { autoConfirmBookings: input.autoConfirmBookings },
    select: { autoConfirmBookings: true },
  });

  return { autoConfirmBookings: updated.autoConfirmBookings };
}

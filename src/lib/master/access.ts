import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type MasterProviderContext = {
  id: string;
  studioId: string | null;
};

export async function getCurrentMasterProviderContext(userId: string): Promise<MasterProviderContext> {
  const provider = await prisma.provider.findFirst({
    where: {
      ownerUserId: userId,
      type: "MASTER",
    },
    select: { id: true, studioId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!provider) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  return provider;
}

export async function getCurrentMasterProviderId(userId: string): Promise<string> {
  const provider = await getCurrentMasterProviderContext(userId);
  return provider.id;
}

export async function isCurrentMasterManagedByStudio(userId: string): Promise<boolean> {
  const provider = await prisma.provider.findFirst({
    where: {
      ownerUserId: userId,
      type: "MASTER",
    },
    select: { studioId: true },
    orderBy: { createdAt: "asc" },
  });
  return Boolean(provider?.studioId);
}


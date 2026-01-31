import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { listProviderCards } from "@/lib/providers/queries";
import { mapProviderProfile } from "@/lib/providers/mappers";
import type { ProviderCardDto, ProviderProfileDto } from "@/lib/providers/dto";

export async function listProviders(): Promise<ProviderCardDto[]> {
  return listProviderCards();
}

export async function getProviderProfile(providerId: string): Promise<ProviderProfileDto> {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    include: {
      services: {
        where: { isEnabled: true },
        select: {
          id: true,
          name: true,
          durationMin: true,
          price: true,
        },
      },
    },
  });

  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  return mapProviderProfile(provider);
}

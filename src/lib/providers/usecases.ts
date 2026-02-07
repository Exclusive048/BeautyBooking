import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { listProviderCards } from "@/lib/providers/queries";
import { mapProviderProfile } from "@/lib/providers/mappers";
import type { ProviderCardDto, ProviderProfileDto } from "@/lib/providers/dto";
import { ProviderType } from "@prisma/client";
import { getStudioBannerUrl } from "@/lib/studios/banner";
import { getProviderSuperpowerBadges } from "@/lib/reviews/badges";

// AUDIT (section 5):
// - Superpower badges are computed server-side from public review tags.
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

  const profile = mapProviderProfile(provider);
  if (provider.type === ProviderType.STUDIO) {
    profile.bannerUrl = await getStudioBannerUrl(provider.id);
    return profile;
  }

  if (provider.type === ProviderType.MASTER) {
    profile.superpowerBadges = await getProviderSuperpowerBadges(provider.id);
  }

  return profile;
}

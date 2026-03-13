import { AppError } from "@/lib/api/errors";
import { listProviderCards } from "@/lib/providers/queries";
import { mapProviderProfile } from "@/lib/providers/mappers";
import type { ProviderCardDto, ProviderProfileDto } from "@/lib/providers/dto";
import { ProviderType } from "@prisma/client";
import { getStudioBannerUrl } from "@/lib/studios/banner";
import { getProviderSuperpowerBadges } from "@/lib/reviews/badges";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

// AUDIT (section 5):
// - Superpower badges are computed server-side from public review tags.
export async function listProviders(): Promise<ProviderCardDto[]> {
  return listProviderCards();
}

export async function getProviderProfile(providerKey: string): Promise<ProviderProfileDto> {
  const provider = await resolveProviderBySlugOrId({
    key: providerKey,
    select: {
      id: true,
      type: true,
      studioId: true,
      name: true,
      avatarUrl: true,
      avatarFocalX: true,
      avatarFocalY: true,
      tagline: true,
      description: true,
      publicUsername: true,
      isPublished: true,
      rating: true,
      reviews: true,
      priceFrom: true,
      address: true,
      district: true,
      categories: true,
      availableToday: true,
      timezone: true,
      cancellationDeadlineHours: true,
      bannerFocalX: true,
      bannerFocalY: true,
      discountRule: { select: { isEnabled: true } },
      geoLat: true,
      geoLng: true,
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
  if (!provider.isPublished) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  const profile = mapProviderProfile(provider);
  profile.hotSlotsEnabled = provider.discountRule?.isEnabled ?? false;
  if (provider.type === ProviderType.STUDIO) {
    profile.bannerUrl = await getStudioBannerUrl(provider.id);
    return profile;
  }

  if (provider.type === ProviderType.MASTER) {
    profile.superpowerBadges = await getProviderSuperpowerBadges(provider.id);
  }

  return profile;
}

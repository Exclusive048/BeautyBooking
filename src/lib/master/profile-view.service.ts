import { ProviderType } from "@prisma/client";
import { getMasterProfileData, type MasterProfileData } from "@/lib/master/profile.service";
import {
  computeProfileCompletion,
  type ProfileCompletion,
} from "@/lib/master/profile-completion";
import { prisma } from "@/lib/prisma";

/**
 * Server aggregator for `/cabinet/master/profile` (31a).
 *
 * Composes the existing `getMasterProfileData` (which already gathers
 * services + portfolio + master row) with three small extra reads:
 *  - `Provider.publicUsername` + `district` (not in the legacy DTO)
 *  - The owning `UserProfile` for read-only contact fields
 *  - The resolved `City.name` for the location card's "Город" display
 *
 * Returns a flat DTO sized for one RSC render — no client-side fetch
 * loops, no SWR cache. The page is a simple paint of these values.
 */

export type ProfileContacts = {
  /** Auth-anchored fields. Editing happens through dedicated account
   * flows (OTP for phone, OAuth for telegram/vk) — never inline here. */
  phone: string | null;
  email: string | null;
  telegramUsername: string | null;
  /** True when the user has a TelegramLink row (i.e. logged in via TG). */
  telegramConnected: boolean;
  /** True when the user has a VkLink row. */
  vkConnected: boolean;
  vkUserId: string | null;
};

export type ProfileServiceCategoryView = {
  /** GlobalCategory.id when known, null for "uncategorised" bucket. */
  id: string | null;
  name: string;
  services: Array<{
    id: string;
    title: string;
    /** kopeks */
    price: number;
    durationMin: number;
  }>;
};

export type ProfilePortfolioPreview = {
  totalCount: number;
  publicCount: number;
  items: Array<{
    id: string;
    mediaUrl: string;
    isPublic: boolean;
  }>;
};

export type MasterProfileViewData = {
  providerId: string;
  isSolo: boolean;
  isPublished: boolean;
  header: {
    displayName: string;
    tagline: string;
    avatarUrl: string | null;
    publicUsername: string | null;
  };
  contacts: ProfileContacts;
  about: {
    bio: string | null;
  };
  location: {
    address: string | null;
    district: string | null;
    cityName: string | null;
    cityId: string | null;
    geoLat: number | null;
    geoLng: number | null;
  };
  services: {
    totalCount: number;
    categories: ProfileServiceCategoryView[];
  };
  portfolio: ProfilePortfolioPreview;
  completion: ProfileCompletion;
};

export async function getMasterProfileView(input: {
  userId: string;
}): Promise<MasterProfileViewData | null> {
  // Resolve the master row owned by this user. Not a redirect-throwing
  // helper — the caller decides what to do with `null` (typically a
  // 403/redirect). Keeps this service callable from non-route contexts.
  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.MASTER },
    select: {
      id: true,
      publicUsername: true,
      district: true,
      cityId: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) return null;

  const [data, user, city] = await Promise.all([
    getMasterProfileData(provider.id),
    prisma.userProfile.findUnique({
      where: { id: input.userId },
      select: {
        phone: true,
        email: true,
        telegramUsername: true,
        telegramLink: { select: { isEnabled: true } },
        vkLink: { select: { vkUserId: true } },
      },
    }),
    provider.cityId
      ? prisma.city.findUnique({
          where: { id: provider.cityId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  return composeView({ data, provider, user, cityName: city?.name ?? null });
}

function composeView(input: {
  data: MasterProfileData;
  provider: {
    id: string;
    publicUsername: string | null;
    district: string;
    cityId: string | null;
  };
  user: {
    phone: string | null;
    email: string | null;
    telegramUsername: string | null;
    telegramLink: { isEnabled: boolean } | null;
    vkLink: { vkUserId: string } | null;
  } | null;
  cityName: string | null;
}): MasterProfileViewData {
  const { data, provider, user, cityName } = input;

  const enabledServices = data.services.filter((service) => service.isEnabled);
  const categories = groupServicesByCategory(enabledServices);

  // 31b correction: `isPublic` is the catalog-visibility flag (matches
  // the `feed/portfolio` and stories filters). The orthogonal `inSearch`
  // flag is for visual-search indexing and is not exposed to the master.
  const portfolioPublicCount = data.portfolio.filter((item) => item.isPublic).length;
  const portfolioPreview: ProfilePortfolioPreview = {
    totalCount: data.portfolio.length,
    publicCount: portfolioPublicCount,
    items: data.portfolio.slice(0, 6).map((item) => ({
      id: item.id,
      mediaUrl: item.mediaUrl,
      isPublic: item.isPublic,
    })),
  };

  const contacts: ProfileContacts = {
    phone: user?.phone ?? null,
    email: user?.email ?? null,
    telegramUsername: user?.telegramUsername ?? null,
    telegramConnected: Boolean(user?.telegramLink?.isEnabled),
    vkConnected: Boolean(user?.vkLink),
    vkUserId: user?.vkLink?.vkUserId ?? null,
  };

  const completion = computeProfileCompletion({
    header: {
      name: data.master.displayName,
      tagline: data.master.tagline,
      avatarUrl: data.master.avatarUrl,
    },
    contacts: { phone: contacts.phone },
    about: { bio: data.master.bio },
    location: {
      address: data.master.address,
      cityId: provider.cityId,
    },
    servicesCount: enabledServices.length,
    portfolioCount: data.portfolio.length,
  });

  return {
    providerId: provider.id,
    isSolo: data.master.isSolo,
    isPublished: data.master.isPublished,
    header: {
      displayName: data.master.displayName,
      tagline: data.master.tagline,
      avatarUrl: data.master.avatarUrl,
      publicUsername: provider.publicUsername,
    },
    contacts,
    about: { bio: data.master.bio },
    location: {
      address: data.master.address || null,
      district: provider.district || null,
      cityName,
      cityId: provider.cityId,
      geoLat: data.master.geoLat,
      geoLng: data.master.geoLng,
    },
    services: {
      totalCount: enabledServices.length,
      categories,
    },
    portfolio: portfolioPreview,
    completion,
  };
}

function groupServicesByCategory(
  services: MasterProfileData["services"]
): ProfileServiceCategoryView[] {
  const map = new Map<string, ProfileServiceCategoryView>();
  const uncategorised: ProfileServiceCategoryView = {
    id: null,
    name: "Без категории",
    services: [],
  };
  for (const service of services) {
    const category = service.globalCategory;
    const bucket = category ? map.get(category.id) : null;
    if (category && !bucket) {
      const fresh: ProfileServiceCategoryView = {
        id: category.id,
        name: category.name,
        services: [],
      };
      map.set(category.id, fresh);
    }
    const target = category ? map.get(category.id)! : uncategorised;
    target.services.push({
      id: service.serviceId,
      title: service.title,
      price: service.effectivePrice,
      durationMin: service.effectiveDurationMin,
    });
  }
  const out = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (uncategorised.services.length > 0) out.push(uncategorised);
  return out;
}

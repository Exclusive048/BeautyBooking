import { AppError } from "@/lib/api/errors";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createLimitReachedError } from "@/lib/billing/guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { detectCityFromAddress } from "@/lib/cities/detect-city";
import { invalidateStoriesCache } from "@/lib/feed/stories.service";
import { CategoryStatus, MediaEntityType, MediaKind, Prisma, SubscriptionScope } from "@prisma/client";

export type MasterContext = {
  id: string;
  ownerUserId: string | null;
  studioProviderId: string | null;
  studioId: string | null;
  isSolo: boolean;
  name: string;
  tagline: string;
  address: string;
  geoLat: number | null;
  geoLng: number | null;
  description: string | null;
  avatarUrl: string | null;
  isPublished: boolean;
  ratingAvg: number;
  ratingCount: number;
  autoPublishStoriesEnabled: boolean;
  cityId: string | null;
};

export async function getMasterContext(masterId: string): Promise<MasterContext> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: {
      id: true,
      type: true,
      ownerUserId: true,
      studioId: true,
      name: true,
      tagline: true,
      address: true,
      geoLat: true,
      geoLng: true,
      description: true,
      avatarUrl: true,
      isPublished: true,
      ratingAvg: true,
      ratingCount: true,
      autoPublishStoriesEnabled: true,
      cityId: true,
    },
  });
  if (!master || master.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  if (!master.studioId) {
    return {
      id: master.id,
      ownerUserId: master.ownerUserId,
      studioProviderId: null,
      studioId: null,
      isSolo: true,
      name: master.name,
      tagline: master.tagline,
      address: master.address,
      geoLat: master.geoLat,
      geoLng: master.geoLng,
      description: master.description,
      avatarUrl: master.avatarUrl,
      isPublished: master.isPublished,
      ratingAvg: master.ratingAvg,
      ratingCount: master.ratingCount,
      autoPublishStoriesEnabled: master.autoPublishStoriesEnabled,
      cityId: master.cityId,
    };
  }

  const studio = await prisma.studio.findUnique({
    where: { providerId: master.studioId },
    select: { id: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  return {
    id: master.id,
    ownerUserId: master.ownerUserId,
    studioProviderId: master.studioId,
    studioId: studio.id,
    isSolo: false,
    name: master.name,
    tagline: master.tagline,
    address: master.address,
    geoLat: master.geoLat,
    geoLng: master.geoLng,
    description: master.description,
    avatarUrl: master.avatarUrl,
    isPublished: master.isPublished,
    ratingAvg: master.ratingAvg,
    ratingCount: master.ratingCount,
    autoPublishStoriesEnabled: master.autoPublishStoriesEnabled,
    cityId: master.cityId,
  };
}

export type MasterProfileServiceItem = {
  serviceId: string;
  title: string;
  description: string | null;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
  globalCategoryId: string | null;
  globalCategory: { id: string; name: string } | null;
  basePrice: number;
  baseDurationMin: number;
  priceOverride: number | null;
  durationOverrideMin: number | null;
  effectivePrice: number;
  effectiveDurationMin: number;
  canEditPrice: boolean;
};

export type MasterPortfolioItem = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  serviceIds: string[];
  globalCategoryId: string | null;
  categorySource: string | null;
  /** Visual-search-indexed flag (orthogonal to `isPublic`). */
  inSearch: boolean;
  /** Public-catalog visibility. The master toggles this from the
   * portfolio management page (31b). */
  isPublic: boolean;
  createdAt: string;
};

export type MasterProfileData = {
  master: {
    id: string;
    displayName: string;
    tagline: string;
    address: string;
    geoLat: number | null;
    geoLng: number | null;
    bio: string | null;
    avatarUrl: string | null;
    isPublished: boolean;
    isSolo: boolean;
    ratingAvg: number;
    ratingCount: number;
    autoPublishStoriesEnabled: boolean;
    cityId: string | null;
  };
  services: MasterProfileServiceItem[];
  portfolio: MasterPortfolioItem[];
};

export async function getMasterProfileData(masterId: string): Promise<MasterProfileData> {
  const context = await getMasterContext(masterId);

  const portfolio = await prisma.portfolioItem.findMany({
    where: { masterId },
    include: { services: { select: { serviceId: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (context.isSolo) {
    const services = await prisma.service.findMany({
      where: { providerId: context.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        title: true,
        description: true,
        isEnabled: true,
        isActive: true,
        onlinePaymentEnabled: true,
        globalCategoryId: true,
        globalCategory: { select: { id: true, name: true } },
        price: true,
        durationMin: true,
      },
    });

    return {
      master: {
        id: context.id,
        displayName: context.name,
        tagline: context.tagline,
        address: context.address,
        geoLat: context.geoLat,
        geoLng: context.geoLng,
        bio: context.description,
        avatarUrl: context.avatarUrl,
        isPublished: context.isPublished,
        isSolo: true,
        ratingAvg: context.ratingAvg,
        ratingCount: context.ratingCount,
        autoPublishStoriesEnabled: context.autoPublishStoriesEnabled,
        cityId: context.cityId,
      },
      services: services.map((service) => ({
        serviceId: service.id,
        title: service.title?.trim() || service.name,
        description: service.description ?? null,
        isEnabled: service.isEnabled && service.isActive,
        onlinePaymentEnabled: service.onlinePaymentEnabled,
        globalCategoryId: service.globalCategoryId ?? null,
        globalCategory: service.globalCategory
          ? { id: service.globalCategory.id, name: service.globalCategory.name }
          : null,
        basePrice: service.price,
        baseDurationMin: service.durationMin,
        priceOverride: null,
        durationOverrideMin: null,
        effectivePrice: service.price,
        effectiveDurationMin: service.durationMin,
        canEditPrice: true,
      })),
      portfolio: portfolio.map((item) => ({
        id: item.id,
        mediaUrl: item.mediaUrl,
        caption: item.caption ?? null,
        serviceIds: item.services.map((link) => link.serviceId),
        globalCategoryId: item.globalCategoryId ?? null,
        categorySource: item.categorySource ?? null,
        inSearch: item.inSearch,
        isPublic: item.isPublic,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  const services = await prisma.service.findMany({
    where: { providerId: context.studioProviderId! },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      description: true,
      isActive: true,
      onlinePaymentEnabled: true,
      globalCategoryId: true,
      globalCategory: { select: { id: true, name: true } },
      price: true,
      durationMin: true,
      basePrice: true,
      baseDurationMin: true,
    },
  });

  const overrides = await prisma.masterService.findMany({
    where: { masterProviderId: context.id },
    select: {
      serviceId: true,
      isEnabled: true,
      priceOverride: true,
      durationOverrideMin: true,
    },
  });
  const overrideByService = new Map(overrides.map((item) => [item.serviceId, item]));

  return {
    master: {
      id: context.id,
      displayName: context.name,
      tagline: context.tagline,
      address: context.address,
      geoLat: context.geoLat,
      geoLng: context.geoLng,
      bio: context.description,
      avatarUrl: context.avatarUrl,
      isPublished: context.isPublished,
      isSolo: false,
      ratingAvg: context.ratingAvg,
      ratingCount: context.ratingCount,
      autoPublishStoriesEnabled: context.autoPublishStoriesEnabled,
      cityId: context.cityId,
    },
    services: services.map((service) => {
      const override = overrideByService.get(service.id);
      const basePrice = service.basePrice ?? service.price;
      const baseDurationMin = service.baseDurationMin ?? service.durationMin;
      const effectivePrice = override?.priceOverride ?? basePrice;
      const effectiveDurationMin = override?.durationOverrideMin ?? baseDurationMin;

      return {
        serviceId: service.id,
        title: service.title?.trim() || service.name,
        description: service.description ?? null,
        isEnabled: Boolean(service.isActive && override?.isEnabled),
        onlinePaymentEnabled: service.onlinePaymentEnabled,
        globalCategoryId: service.globalCategoryId ?? null,
        globalCategory: service.globalCategory
          ? { id: service.globalCategory.id, name: service.globalCategory.name }
          : null,
        basePrice,
        baseDurationMin,
        priceOverride: override?.priceOverride ?? null,
        durationOverrideMin: override?.durationOverrideMin ?? null,
        effectivePrice,
        effectiveDurationMin,
        canEditPrice: false,
      };
    }),
    portfolio: portfolio.map((item) => ({
      id: item.id,
      mediaUrl: item.mediaUrl,
      caption: item.caption ?? null,
      serviceIds: item.services.map((link) => link.serviceId),
      globalCategoryId: item.globalCategoryId ?? null,
      categorySource: item.categorySource ?? null,
      inSearch: item.inSearch,
      isPublic: item.isPublic,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function updateMasterProfile(
  masterId: string,
  input: {
    displayName?: string;
    tagline?: string;
    address?: string;
    geoLat?: number | null;
    geoLng?: number | null;
    bio?: string | null;
    avatarUrl?: string | null;
    isPublished?: boolean;
    district?: string;
  }
): Promise<{ id: string }> {
  const context = await getMasterContext(masterId);

  // 1. Apply non-publication fields first. We split publication out because
  //    it depends on cityId being set, and cityId may be (re-)derived here
  //    from a fresh address.
  const trimmedAddress =
    typeof input.address === "string" ? input.address.trim() : undefined;
  const trimmedDistrict =
    typeof input.district === "string" ? input.district.trim() : undefined;

  await prisma.provider.update({
    where: { id: masterId },
    data: {
      ...(input.displayName ? { name: input.displayName.trim() } : {}),
      ...(typeof input.tagline === "string" ? { tagline: input.tagline.trim() } : {}),
      ...(trimmedAddress !== undefined ? { address: trimmedAddress } : {}),
      ...(trimmedDistrict !== undefined ? { district: trimmedDistrict } : {}),
      ...(input.geoLat !== undefined ? { geoLat: input.geoLat } : {}),
      ...(input.geoLng !== undefined ? { geoLng: input.geoLng } : {}),
      ...(input.bio !== undefined
        ? { description: typeof input.bio === "string" ? input.bio.trim() || null : null }
        : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl?.trim() || null } : {}),
    },
  });

  // 2. If address changed, run server-side geocode + city detection. The
  //    server geocoder is authoritative — it overwrites any client-supplied
  //    geo and writes cityId. On failure we explicitly null cityId so the
  //    publish gate below blocks (and the master sees the address banner).
  let resolvedCityId: string | null = context.cityId;
  if (trimmedAddress !== undefined) {
    if (!trimmedAddress) {
      // Address cleared — drop the city link.
      await prisma.provider.update({
        where: { id: masterId },
        data: { cityId: null },
      });
      resolvedCityId = null;
    } else {
      const detection = await detectCityFromAddress(trimmedAddress);
      if (detection.ok) {
        await prisma.provider.update({
          where: { id: masterId },
          data: {
            cityId: detection.cityId,
            geoLat: detection.geoLat,
            geoLng: detection.geoLng,
          },
        });
        resolvedCityId = detection.cityId;
      } else {
        await prisma.provider.update({
          where: { id: masterId },
          data: { cityId: null },
        });
        resolvedCityId = null;
      }
    }
  }

  // 3. Publication gate: requires both a non-empty address AND a resolved cityId.
  //    Read-back the canonical address from the row in case input.address was
  //    omitted but we're still asked to publish.
  if (typeof input.isPublished === "boolean") {
    if (input.isPublished) {
      const canonicalAddress =
        trimmedAddress !== undefined ? trimmedAddress : context.address;
      if (!canonicalAddress || !resolvedCityId) {
        throw new AppError(
          "Заполните адрес, чтобы опубликовать профиль",
          400,
          "ADDRESS_REQUIRED",
        );
      }
    }
    await prisma.provider.update({
      where: { id: masterId },
      data: { isPublished: input.isPublished },
    });
  }

  return { id: masterId };
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

const MEDIA_FILE_PATH_PREFIX = "/api/media/file/";

function extractMediaAssetIdFromUrl(mediaUrl: string): string | null {
  try {
    const parsedUrl = new URL(mediaUrl);
    if (!parsedUrl.pathname.startsWith(MEDIA_FILE_PATH_PREFIX)) return null;
    const id = parsedUrl.pathname.slice(MEDIA_FILE_PATH_PREFIX.length).split("/")[0];
    return id || null;
  } catch {
    return null;
  }
}

async function resolvePortfolioMediaUrl(input: {
  userId: string;
  masterId: string;
  mediaAssetId?: string;
  mediaUrl?: string;
}): Promise<string> {
  const resolvedAssetId =
    input.mediaAssetId?.trim() ||
    (input.mediaUrl ? extractMediaAssetIdFromUrl(input.mediaUrl) : null);

  if (resolvedAssetId) {
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: resolvedAssetId },
      select: {
        id: true,
        deletedAt: true,
        createdByUserId: true,
        entityType: true,
        entityId: true,
        kind: true,
      },
    });

    if (
      !asset ||
      asset.deletedAt ||
      asset.createdByUserId !== input.userId ||
      asset.entityType !== MediaEntityType.MASTER ||
      asset.entityId !== input.masterId ||
      asset.kind !== MediaKind.PORTFOLIO
    ) {
      throw new AppError("Invalid media asset", 400, "FORBIDDEN");
    }

    return `${MEDIA_FILE_PATH_PREFIX}${asset.id}`;
  }

  const mediaUrl = input.mediaUrl?.trim();
  if (!mediaUrl) {
    throw new AppError("Invalid media URL", 400, "VALIDATION_ERROR");
  }

  const allowedS3Endpoint = env.S3_ENDPOINT?.trim();
  if (allowedS3Endpoint && mediaUrl.startsWith(allowedS3Endpoint)) {
    return mediaUrl;
  }

  throw new AppError("Invalid media URL", 400, "VALIDATION_ERROR");
}

export async function upsertMasterServices(
  masterId: string,
  items: Array<{
    serviceId: string;
    isEnabled: boolean;
    onlinePaymentEnabled?: boolean;
    durationOverrideMin?: number | null;
    priceOverride?: number | null;
    globalCategoryId?: string | null;
    description?: string | null;
  }>
): Promise<{ updated: number }> {
  const context = await getMasterContext(masterId);
  if (items.length === 0) return { updated: 0 };

  if (context.isSolo) {
    const serviceIds = uniqueIds(items.map((item) => item.serviceId));
    const existing = await prisma.service.findMany({
      where: { id: { in: serviceIds }, providerId: masterId },
      select: { id: true, globalCategoryId: true },
    });
    if (existing.length !== serviceIds.length) {
      throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
    }
    const existingById = new Map(existing.map((service) => [service.id, service]));

    const requestedGlobalCategoryIds = uniqueIds(
      items
        .map((item) =>
          item.globalCategoryId === undefined ? null : item.globalCategoryId?.trim() || null
        )
        .filter((value): value is string => Boolean(value))
    );
    if (requestedGlobalCategoryIds.length > 0) {
      const visibilityConditions: Prisma.GlobalCategoryWhereInput[] = [
        { status: CategoryStatus.APPROVED, visibleToAll: true },
      ];
      if (context.ownerUserId) {
        visibilityConditions.push({ createdByUserId: context.ownerUserId });
      }
      const categories = await prisma.globalCategory.findMany({
        where: {
          id: { in: requestedGlobalCategoryIds },
          OR: visibilityConditions,
        },
        select: { id: true },
      });
      if (categories.length !== requestedGlobalCategoryIds.length) {
        throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const previousGlobalCategoryId =
          existingById.get(item.serviceId)?.globalCategoryId ?? null;
        const nextGlobalCategoryId =
          item.globalCategoryId === undefined ? undefined : item.globalCategoryId?.trim() || null;

        await tx.service.update({
          where: { id: item.serviceId },
          data: {
            isEnabled: item.isEnabled,
            isActive: item.isEnabled,
            ...(typeof item.onlinePaymentEnabled === "boolean"
              ? { onlinePaymentEnabled: item.onlinePaymentEnabled }
              : {}),
            ...(typeof item.durationOverrideMin === "number"
              ? { durationMin: item.durationOverrideMin }
              : {}),
            ...(typeof item.priceOverride === "number" ? { price: item.priceOverride } : {}),
            ...(nextGlobalCategoryId !== undefined
              ? { globalCategoryId: nextGlobalCategoryId }
              : {}),
            ...(item.description !== undefined
              ? { description: item.description?.trim() || null }
              : {}),
          },
        });

        if (
          nextGlobalCategoryId !== undefined &&
          nextGlobalCategoryId !== previousGlobalCategoryId
        ) {
          if (previousGlobalCategoryId) {
            await tx.globalCategory.updateMany({
              where: { id: previousGlobalCategoryId, usageCount: { gt: 0 } },
              data: { usageCount: { decrement: 1 } },
            });
          }
          if (nextGlobalCategoryId) {
            await tx.globalCategory.update({
              where: { id: nextGlobalCategoryId },
              data: { usageCount: { increment: 1 } },
            });
          }
        }
      }
    });
    return { updated: items.length };
  }

  const serviceIds = uniqueIds(items.map((item) => item.serviceId));
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, providerId: context.studioProviderId! },
    select: { id: true },
  });
  if (services.length !== serviceIds.length) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.masterService.upsert({
        where: {
          masterProviderId_serviceId: {
            masterProviderId: masterId,
            serviceId: item.serviceId,
          },
        },
        create: {
          studioId: context.studioId!,
          masterProviderId: masterId,
          masterId,
          serviceId: item.serviceId,
          isEnabled: item.isEnabled,
          durationOverrideMin:
            typeof item.durationOverrideMin === "number" ? item.durationOverrideMin : null,
          priceOverride: null,
        },
        update: {
          studioId: context.studioId!,
          masterId,
          isEnabled: item.isEnabled,
          durationOverrideMin:
            typeof item.durationOverrideMin === "number" ? item.durationOverrideMin : null,
          // Studio pricing controlled by studio only.
          priceOverride: null,
        },
      })
    )
  );
  return { updated: items.length };
}

export async function createSoloMasterService(
  masterId: string,
  input: {
    title: string;
    price: number;
    durationMin: number;
    globalCategoryId?: string;
    description?: string;
    /** 31c: optional flags. Default to existing behaviour
     * (`isEnabled: true`, `onlinePaymentEnabled: false`) when omitted. */
    isEnabled?: boolean;
    onlinePaymentEnabled?: boolean;
  }
): Promise<{ id: string }> {
  const context = await getMasterContext(masterId);
  if (!context.isSolo) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const normalizedTitle = input.title.trim();
  if (!normalizedTitle) {
    throw new AppError("Validation error", 400, "VALIDATION_ERROR", {
      fieldErrors: { title: "Title is required" },
    });
  }

  const globalCategoryId = input.globalCategoryId?.trim() || null;
  if (globalCategoryId) {
    const visibilityConditions: Prisma.GlobalCategoryWhereInput[] = [
      { status: CategoryStatus.APPROVED, visibleToAll: true },
    ];
    if (context.ownerUserId) {
      visibilityConditions.push({ createdByUserId: context.ownerUserId });
    }
    const globalCategory = await prisma.globalCategory.findFirst({
      where: {
        id: globalCategoryId,
        OR: visibilityConditions,
      },
      select: { id: true },
    });
    if (!globalCategory) {
      throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
    }
  }

  const duplicate = await prisma.service.findFirst({
    where: {
      providerId: masterId,
      OR: [
        { name: { equals: normalizedTitle, mode: "insensitive" } },
        { title: { equals: normalizedTitle, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new AppError("Service already added", 409, "ALREADY_EXISTS", {
      fieldErrors: { title: "Service with this name already exists" },
    });
  }

  const last = await prisma.service.findFirst({
    where: { providerId: masterId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          providerId: masterId,
          title: normalizedTitle,
          name: normalizedTitle,
          description: input.description?.trim() || null,
          price: input.price,
          durationMin: input.durationMin,
          globalCategoryId,
          isEnabled: input.isEnabled ?? true,
          isActive: true,
          onlinePaymentEnabled: input.onlinePaymentEnabled ?? false,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });

      if (globalCategoryId) {
        await tx.globalCategory.update({
          where: { id: globalCategoryId },
          data: { usageCount: { increment: 1 } },
        });
      }

      return service;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("Service already added", 409, "ALREADY_EXISTS", {
        fieldErrors: { title: "Service with this name already exists" },
      });
    }
    throw error;
  }

  return { id: created.id };
}

export async function listMasterPortfolio(masterId: string): Promise<{ items: MasterPortfolioItem[] }> {
  await getMasterContext(masterId);
  const items = await prisma.portfolioItem.findMany({
    where: { masterId },
    include: { services: { select: { serviceId: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    items: items.map((item) => ({
      id: item.id,
      mediaUrl: item.mediaUrl,
      caption: item.caption ?? null,
      serviceIds: item.services.map((link) => link.serviceId),
      globalCategoryId: item.globalCategoryId ?? null,
      categorySource: item.categorySource ?? null,
      inSearch: item.inSearch,
      isPublic: item.isPublic,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function createMasterPortfolioItem(
  userId: string,
  masterId: string,
  input: {
    mediaAssetId?: string;
    mediaUrl?: string;
    caption?: string;
    serviceIds: string[];
    tagIds?: string[];
    globalCategoryId?: string;
    categorySource?: "ai" | "user";
  }
): Promise<{ id: string }> {
  const context = await getMasterContext(masterId);
  const uniqueServiceIds = uniqueIds(input.serviceIds);
  const uniqueTagIds = uniqueIds(input.tagIds ?? []);
  const serviceCategoryIds: string[] = [];

  if (uniqueServiceIds.length > 0) {
    const services = await prisma.service.findMany({
      where: {
        id: { in: uniqueServiceIds },
        providerId: context.isSolo ? masterId : context.studioProviderId!,
      },
      select: { id: true, globalCategoryId: true },
    });
    if (services.length !== uniqueServiceIds.length) {
      throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
    }
    serviceCategoryIds.push(
      ...uniqueIds(
      services
        .map((service) => service.globalCategoryId)
        .filter((value): value is string => Boolean(value))
      )
    );
  }

  const selectedGlobalCategoryId = input.globalCategoryId?.trim() || null;
  if (selectedGlobalCategoryId) {
    const visibilityConditions: Prisma.GlobalCategoryWhereInput[] = [
      { status: CategoryStatus.APPROVED, visibleToAll: true },
    ];
    if (context.ownerUserId) {
      visibilityConditions.push({ createdByUserId: context.ownerUserId });
      visibilityConditions.push({ proposedBy: context.ownerUserId });
    }
    const category = await prisma.globalCategory.findFirst({
      where: {
        id: selectedGlobalCategoryId,
        OR: visibilityConditions,
      },
      select: { id: true, status: true, visualSearchSlug: true },
    });
    if (!category || category.visualSearchSlug === "hot") {
      throw new AppError("Global category not found", 404, "NOT_FOUND");
    }
  }

  if (uniqueTagIds.length > 0) {
    const tags = await prisma.tag.findMany({
      where: { id: { in: uniqueTagIds } },
      select: { id: true },
    });
    if (tags.length !== uniqueTagIds.length) {
      throw new AppError("Тег не найден", 404, "NOT_FOUND");
    }
  }

  const plan = await getCurrentPlan(userId, SubscriptionScope.MASTER);
  const limitKey = context.isSolo
    ? "maxPortfolioPhotosSolo"
    : "maxPortfolioPhotosPerStudioMaster";
  const limit = context.isSolo
    ? plan.features.maxPortfolioPhotosSolo
    : plan.features.maxPortfolioPhotosPerStudioMaster;
  if (typeof limit === "number") {
    const current = await prisma.portfolioItem.count({
      where: { masterId },
    });
    if (current >= limit) {
      throw createLimitReachedError(limitKey, limit, current);
    }
  }

  const mediaUrl = await resolvePortfolioMediaUrl({
    userId,
    masterId,
    mediaAssetId: input.mediaAssetId,
    mediaUrl: input.mediaUrl,
  });

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.portfolioItem.create({
      data: {
        masterId,
        studioId: context.studioId,
        mediaUrl,
        caption: input.caption?.trim() || null,
        globalCategoryId: selectedGlobalCategoryId,
        categorySource: selectedGlobalCategoryId ? (input.categorySource ?? "user") : null,
        inSearch: Boolean(selectedGlobalCategoryId),
        isPublic: true,
      },
      select: { id: true },
    });

    if (uniqueServiceIds.length > 0) {
      await tx.portfolioItemService.createMany({
        data: uniqueServiceIds.map((serviceId) => ({
          portfolioItemId: item.id,
          serviceId,
        })),
      });
    }

    if (uniqueTagIds.length > 0) {
      await tx.portfolioItemTag.createMany({
        data: uniqueTagIds.map((tagId) => ({
          portfolioItemId: item.id,
          tagId,
        })),
      });
    }

    const usageCategoryIds = uniqueIds(
      selectedGlobalCategoryId
        ? [...serviceCategoryIds, selectedGlobalCategoryId]
        : [...serviceCategoryIds]
    );

    if (usageCategoryIds.length > 0) {
      await tx.globalCategory.updateMany({
        where: { id: { in: usageCategoryIds } },
        data: { usageCount: { increment: 1 } },
      });
    }

    if (uniqueTagIds.length > 0) {
      await tx.tag.updateMany({
        where: { id: { in: uniqueTagIds } },
        data: { usageCount: { increment: 1 } },
      });
    }

    return item;
  });

  await invalidateAdvisorCache(masterId);

  // Fire-and-forget: invalidate stories cache when master has autopublish on.
  // Don't block the API response — Redis failure should never break a successful create.
  if (context.autoPublishStoriesEnabled) {
    void invalidateStoriesCache();
  }

  return { id: created.id };
}

export async function updateMasterPortfolioCategory(
  masterId: string,
  portfolioId: string,
  globalCategoryId: string | null
): Promise<{ id: string; globalCategoryId: string | null; inSearch: boolean }> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: portfolioId },
    select: { id: true, masterId: true, globalCategoryId: true },
  });
  if (!item || item.masterId !== masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  const nextGlobalCategoryId = globalCategoryId?.trim() || null;
  if (nextGlobalCategoryId) {
    const context = await getMasterContext(masterId);
    const visibilityConditions: Prisma.GlobalCategoryWhereInput[] = [
      { status: CategoryStatus.APPROVED, visibleToAll: true },
    ];
    if (context.ownerUserId) {
      visibilityConditions.push({ createdByUserId: context.ownerUserId });
      visibilityConditions.push({ proposedBy: context.ownerUserId });
    }
    const category = await prisma.globalCategory.findFirst({
      where: {
        id: nextGlobalCategoryId,
        OR: visibilityConditions,
      },
      select: { id: true, status: true, visualSearchSlug: true },
    });
    if (!category || category.visualSearchSlug === "hot") {
      throw new AppError("Global category not found", 404, "NOT_FOUND");
    }
  }

  const changed = (item.globalCategoryId ?? null) !== nextGlobalCategoryId;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.portfolioItem.update({
      where: { id: portfolioId },
      data: {
        globalCategoryId: nextGlobalCategoryId,
        categorySource: "user",
        inSearch: Boolean(nextGlobalCategoryId),
      },
      select: { id: true, globalCategoryId: true, inSearch: true },
    });

    if (changed) {
      if (item.globalCategoryId) {
        await tx.globalCategory.updateMany({
          where: { id: item.globalCategoryId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (nextGlobalCategoryId) {
        await tx.globalCategory.update({
          where: { id: nextGlobalCategoryId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    return row;
  });

  await invalidateAdvisorCache(masterId);
  return updated;
}

export async function deleteMasterPortfolioItem(
  masterId: string,
  portfolioId: string
): Promise<{ id: string }> {
  const item = await prisma.portfolioItem.findUnique({
    where: { id: portfolioId },
    select: {
      id: true,
      masterId: true,
      globalCategoryId: true,
      services: { select: { service: { select: { globalCategoryId: true } } } },
      tags: { select: { tagId: true } },
    },
  });
  if (!item || item.masterId !== masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }
  const categoryIds = uniqueIds([
    ...item.services
      .map((link) => link.service.globalCategoryId)
      .filter((value): value is string => Boolean(value)),
    ...(item.globalCategoryId ? [item.globalCategoryId] : []),
  ]);
  const tagIds = uniqueIds(item.tags.map((link) => link.tagId));

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.portfolioItem.deleteMany({
      where: { id: item.id, masterId },
    });
    if (deleted.count === 0) return;
    if (categoryIds.length > 0) {
      await tx.globalCategory.updateMany({
        where: { id: { in: categoryIds }, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
    if (tagIds.length > 0) {
      await tx.tag.updateMany({
        where: { id: { in: tagIds }, usageCount: { gt: 0 } },
        data: { usageCount: { decrement: 1 } },
      });
    }
  });
  await invalidateAdvisorCache(masterId);
  return { id: item.id };
}



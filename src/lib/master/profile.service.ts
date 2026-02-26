import { AppError } from "@/lib/api/errors";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createLimitReachedError } from "@/lib/billing/guards";
import { prisma } from "@/lib/prisma";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { Prisma } from "@prisma/client";

type MasterContext = {
  id: string;
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
};

async function getMasterContext(masterId: string): Promise<MasterContext> {
  const master = await prisma.provider.findUnique({
    where: { id: masterId },
    select: {
      id: true,
      type: true,
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
    },
  });
  if (!master || master.type !== "MASTER") {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  if (!master.studioId) {
    return {
      id: master.id,
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
  };
}

export type MasterProfileServiceItem = {
  serviceId: string;
  title: string;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
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
        isEnabled: true,
        isActive: true,
        onlinePaymentEnabled: true,
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
      },
      services: services.map((service) => ({
        serviceId: service.id,
        title: service.title?.trim() || service.name,
        isEnabled: service.isEnabled && service.isActive,
        onlinePaymentEnabled: service.onlinePaymentEnabled,
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
      isActive: true,
      onlinePaymentEnabled: true,
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
        isEnabled: Boolean(service.isActive && override?.isEnabled),
        onlinePaymentEnabled: service.onlinePaymentEnabled,
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
  }
): Promise<{ id: string }> {
  await getMasterContext(masterId);
  await prisma.provider.update({
    where: { id: masterId },
    data: {
      ...(input.displayName ? { name: input.displayName.trim() } : {}),
      ...(typeof input.tagline === "string" ? { tagline: input.tagline.trim() } : {}),
      ...(typeof input.address === "string" ? { address: input.address.trim() } : {}),
      ...(input.geoLat !== undefined ? { geoLat: input.geoLat } : {}),
      ...(input.geoLng !== undefined ? { geoLng: input.geoLng } : {}),
      ...(input.bio !== undefined
        ? { description: typeof input.bio === "string" ? input.bio.trim() || null : null }
        : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl?.trim() || null } : {}),
      ...(typeof input.isPublished === "boolean" ? { isPublished: input.isPublished } : {}),
    },
  });
  return { id: masterId };
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export async function upsertMasterServices(
  masterId: string,
  items: Array<{
    serviceId: string;
    isEnabled: boolean;
    onlinePaymentEnabled?: boolean;
    durationOverrideMin?: number | null;
    priceOverride?: number | null;
  }>
): Promise<{ updated: number }> {
  const context = await getMasterContext(masterId);
  if (items.length === 0) return { updated: 0 };

  if (context.isSolo) {
    const serviceIds = uniqueIds(items.map((item) => item.serviceId));
    const existing = await prisma.service.findMany({
      where: { id: { in: serviceIds }, providerId: masterId },
      select: { id: true },
    });
    if (existing.length !== serviceIds.length) {
      throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.service.update({
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
          },
        })
      )
    );
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
  input: { title: string; price: number; durationMin: number; globalCategoryId?: string }
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
    const globalCategory = await prisma.globalCategory.findUnique({
      where: { id: globalCategoryId },
      select: { id: true, isActive: true },
    });
    if (!globalCategory || !globalCategory.isActive) {
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
          price: input.price,
          durationMin: input.durationMin,
          globalCategoryId,
          isEnabled: true,
          isActive: true,
          onlinePaymentEnabled: false,
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
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function createMasterPortfolioItem(
  userId: string,
  masterId: string,
  input: { mediaUrl: string; caption?: string; serviceIds: string[]; tagIds?: string[] }
): Promise<{ id: string }> {
  const context = await getMasterContext(masterId);
  const uniqueServiceIds = uniqueIds(input.serviceIds);
  const uniqueTagIds = uniqueIds(input.tagIds ?? []);
  let categoryIds: string[] = [];

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
    categoryIds = uniqueIds(
      services
        .map((service) => service.globalCategoryId)
        .filter((value): value is string => Boolean(value))
    );
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

  const plan = await getCurrentPlan(userId);
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

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.portfolioItem.create({
      data: {
        masterId,
        studioId: context.studioId,
        mediaUrl: input.mediaUrl,
        caption: input.caption?.trim() || null,
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

    if (categoryIds.length > 0) {
      await tx.globalCategory.updateMany({
        where: { id: { in: categoryIds } },
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
  return { id: created.id };
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
      services: { select: { service: { select: { globalCategoryId: true } } } },
      tags: { select: { tagId: true } },
    },
  });
  if (!item || item.masterId !== masterId) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }
  const categoryIds = uniqueIds(
    item.services
      .map((link) => link.service.globalCategoryId)
      .filter((value): value is string => Boolean(value))
  );
  const tagIds = uniqueIds(item.tags.map((link) => link.tagId));

  await prisma.$transaction(async (tx) => {
    await tx.portfolioItem.delete({ where: { id: item.id } });
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

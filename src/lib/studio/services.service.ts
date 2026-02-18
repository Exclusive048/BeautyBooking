import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { normalizeStudioServiceDurationMin, normalizeStudioServicePrice } from "@/lib/studio/service-normalization";

export type StudioServiceAssignedMaster = {
  masterId: string;
  masterName: string;
};

export type StudioServiceView = {
  id: string;
  categoryId: string | null;
  title: string;
  basePrice: number;
  baseDurationMin: number;
  sortOrder: number;
  isActive: boolean;
  onlinePaymentEnabled: boolean;
  masters: StudioServiceAssignedMaster[];
};

export type StudioCategoryView = {
  id: string;
  title: string;
  sortOrder: number;
  services: StudioServiceView[];
};

type StudioContext = {
  id: string;
  providerId: string;
};

async function getStudioContext(studioId: string): Promise<StudioContext> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }
  return studio;
}

export async function getStudioServices(studioId: string): Promise<{ categories: StudioCategoryView[] }> {
  const studio = await getStudioContext(studioId);

  const categories = await prisma.serviceCategory.findMany({
    where: { studioId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, sortOrder: true },
  });

  const services = await prisma.service.findMany({
    where: {
      OR: [{ studioId }, { providerId: studio.providerId }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      categoryId: true,
      name: true,
      title: true,
      basePrice: true,
      baseDurationMin: true,
      price: true,
      durationMin: true,
      sortOrder: true,
      isActive: true,
      onlinePaymentEnabled: true,
      masterServices: {
        where: { isEnabled: true },
        select: {
          masterProvider: { select: { id: true, name: true } },
        },
      },
    },
  });

  const grouped = new Map<string, StudioServiceView[]>();
  for (const service of services) {
    const key = service.categoryId ?? "__uncategorized__";
    const item: StudioServiceView = {
      id: service.id,
      categoryId: service.categoryId ?? null,
      title: service.title?.trim() || service.name,
      basePrice: service.basePrice ?? service.price,
      baseDurationMin: service.baseDurationMin ?? service.durationMin,
      sortOrder: service.sortOrder,
      isActive: service.isActive,
      onlinePaymentEnabled: service.onlinePaymentEnabled,
      masters: service.masterServices.map((ms) => ({
        masterId: ms.masterProvider.id,
        masterName: ms.masterProvider.name,
      })),
    };
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  const result: StudioCategoryView[] = categories.map((category) => ({
    id: category.id,
    title: category.title,
    sortOrder: category.sortOrder,
    services: grouped.get(category.id) ?? [],
  }));

  const uncategorized = grouped.get("__uncategorized__");
  if (uncategorized && uncategorized.length > 0) {
    result.push({
      id: "__uncategorized__",
      title: "Uncategorized",
      sortOrder: Number.MAX_SAFE_INTEGER,
      services: uncategorized,
    });
  }

  return { categories: result };
}

export async function createStudioCategory(input: {
  studioId: string;
  title: string;
}): Promise<{ id: string; title: string; sortOrder: number }> {
  const studio = await getStudioContext(input.studioId);
  const last = await prisma.serviceCategory.findFirst({
    where: { studioId: studio.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.serviceCategory.create({
    data: {
      studioId: studio.id,
      title: input.title.trim(),
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true, title: true, sortOrder: true },
  });
  return created;
}

export async function updateStudioCategory(input: {
  studioId: string;
  categoryId: string;
  title: string;
}): Promise<{ id: string }> {
  const category = await prisma.serviceCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, studioId: true },
  });
  if (!category) {
    throw new AppError("Category not found", 404, "NOT_FOUND");
  }
  if (category.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  await prisma.serviceCategory.update({
    where: { id: input.categoryId },
    data: { title: input.title.trim() },
  });
  return { id: input.categoryId };
}

export async function reorderStudioCategories(input: {
  studioId: string;
  orderedIds: string[];
}): Promise<{ updated: number }> {
  const existing = await prisma.serviceCategory.findMany({
    where: { studioId: input.studioId, id: { in: input.orderedIds } },
    select: { id: true },
  });
  if (existing.length !== input.orderedIds.length) {
    throw new AppError("Some categories were not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction(
    input.orderedIds.map((id, index) =>
      prisma.serviceCategory.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  return { updated: input.orderedIds.length };
}

export async function createStudioService(input: {
  studioId: string;
  categoryId: string;
  title: string;
  description?: string;
  globalCategoryId?: string;
  basePrice: number;
  baseDurationMin: number;
}): Promise<{ id: string }> {
  const studio = await getStudioContext(input.studioId);
  const normalizedPrice = normalizeStudioServicePrice(input.basePrice);
  const normalizedDurationMin = normalizeStudioServiceDurationMin(input.baseDurationMin);
  const globalCategoryId = input.globalCategoryId?.trim() || null;

  const category = await prisma.serviceCategory.findUnique({
    where: { id: input.categoryId },
    select: { studioId: true },
  });
  if (!category || category.studioId !== studio.id) {
    throw new AppError("Category not found", 404, "NOT_FOUND");
  }

  if (globalCategoryId) {
    const globalCategory = await prisma.globalCategory.findUnique({
      where: { id: globalCategoryId },
      select: { id: true, isActive: true },
    });
    if (!globalCategory || !globalCategory.isActive) {
      throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
    }
  }

  const last = await prisma.service.findFirst({
    where: { studioId: studio.id, categoryId: input.categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        providerId: studio.providerId,
        studioId: studio.id,
        categoryId: input.categoryId,
        globalCategoryId,
        name: input.title.trim(),
        title: input.title.trim(),
        description: input.description?.trim() || null,
        durationMin: normalizedDurationMin,
        price: normalizedPrice,
        baseDurationMin: normalizedDurationMin,
        basePrice: normalizedPrice,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        isActive: true,
        isEnabled: true,
        onlinePaymentEnabled: false,
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

  return created;
}

export async function updateStudioService(input: {
  studioId: string;
  serviceId: string;
  categoryId?: string;
  globalCategoryId?: string | null;
  title?: string;
  description?: string;
  basePrice?: number;
  baseDurationMin?: number;
  isActive?: boolean;
  onlinePaymentEnabled?: boolean;
}): Promise<{ id: string }> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true, studioId: true, globalCategoryId: true },
  });
  if (!service) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }
  if (service.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  if (input.categoryId) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: input.categoryId },
      select: { studioId: true },
    });
    if (!category || category.studioId !== input.studioId) {
      throw new AppError("Category not found", 404, "NOT_FOUND");
    }
  }

  let nextGlobalCategoryId: string | null | undefined;
  if (input.globalCategoryId !== undefined) {
    const trimmed = typeof input.globalCategoryId === "string" ? input.globalCategoryId.trim() : "";
    nextGlobalCategoryId = trimmed.length > 0 ? trimmed : null;
    if (nextGlobalCategoryId) {
      const globalCategory = await prisma.globalCategory.findUnique({
        where: { id: nextGlobalCategoryId },
        select: { id: true, isActive: true },
      });
      if (!globalCategory || !globalCategory.isActive) {
        throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
      }
    }
  }

  const nextTitle = input.title?.trim();
  const normalizedPrice =
    typeof input.basePrice === "number" ? normalizeStudioServicePrice(input.basePrice) : undefined;
  const normalizedDurationMin =
    typeof input.baseDurationMin === "number"
      ? normalizeStudioServiceDurationMin(input.baseDurationMin)
      : undefined;

  const nextCategoryId =
    nextGlobalCategoryId !== undefined ? nextGlobalCategoryId : service.globalCategoryId ?? null;
  const shouldUpdateUsage =
    nextGlobalCategoryId !== undefined && nextCategoryId !== (service.globalCategoryId ?? null);

  await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id: input.serviceId },
      data: {
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(nextTitle ? { name: nextTitle, title: nextTitle } : {}),
        ...(typeof input.description === "string" ? { description: input.description.trim() || null } : {}),
        ...(typeof normalizedPrice === "number" ? { price: normalizedPrice, basePrice: normalizedPrice } : {}),
        ...(typeof normalizedDurationMin === "number"
          ? { durationMin: normalizedDurationMin, baseDurationMin: normalizedDurationMin }
          : {}),
        ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {}),
        ...(typeof input.onlinePaymentEnabled === "boolean"
          ? { onlinePaymentEnabled: input.onlinePaymentEnabled }
          : {}),
        ...(nextGlobalCategoryId !== undefined ? { globalCategoryId: nextGlobalCategoryId } : {}),
      },
    });

    if (shouldUpdateUsage) {
      const previous = service.globalCategoryId;
      if (previous) {
        await tx.globalCategory.updateMany({
          where: { id: previous, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
      if (nextCategoryId) {
        await tx.globalCategory.update({
          where: { id: nextCategoryId },
          data: { usageCount: { increment: 1 } },
        });
      }
    }
  });
  return { id: input.serviceId };
}

export async function reorderStudioServices(input: {
  studioId: string;
  categoryId: string;
  orderedIds: string[];
}): Promise<{ updated: number }> {
  const services = await prisma.service.findMany({
    where: {
      studioId: input.studioId,
      categoryId: input.categoryId,
      id: { in: input.orderedIds },
    },
    select: { id: true },
  });
  if (services.length !== input.orderedIds.length) {
    throw new AppError("Some services were not found", 404, "NOT_FOUND");
  }

  await prisma.$transaction(
    input.orderedIds.map((id, index) =>
      prisma.service.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  return { updated: input.orderedIds.length };
}

export async function assignMasterToService(input: {
  studioId: string;
  serviceId: string;
  masterId: string;
}): Promise<{ serviceId: string; masterId: string }> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true, studioId: true },
  });
  if (!service) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }
  if (service.studioId && service.studioId !== input.studioId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const studio = await getStudioContext(input.studioId);
  const master = await prisma.provider.findFirst({
    where: { id: input.masterId, type: "MASTER", studioId: studio.providerId },
    select: { id: true },
  });
  if (!master) {
    throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
  }

  await prisma.masterService.upsert({
    where: { masterProviderId_serviceId: { masterProviderId: input.masterId, serviceId: input.serviceId } },
    create: {
      studioId: input.studioId,
      masterProviderId: input.masterId,
      masterId: input.masterId,
      serviceId: input.serviceId,
      isEnabled: true,
    },
    update: {
      studioId: input.studioId,
      masterId: input.masterId,
      isEnabled: true,
    },
  });

  return { serviceId: input.serviceId, masterId: input.masterId };
}

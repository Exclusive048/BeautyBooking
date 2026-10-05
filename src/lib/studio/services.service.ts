import { CategoryStatus, type Prisma } from "@prisma/client";
import { UNCATEGORIZED_KEY } from "@/features/studio-cabinet/services/lib/types";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { requireActiveStudioMaster } from "@/lib/studio/master-eligibility";
import { assertBelongsToStudio } from "@/lib/studio/tenancy";
import { normalizeStudioServiceDurationMin, normalizeStudioServicePrice } from "@/lib/studio/service-normalization";

export type StudioServiceAssignedMaster = {
  masterId: string;
  masterName: string;
};

export type StudioServiceView = {
  id: string;
  categoryId: string | null;
  globalCategoryId: string | null;
  globalCategory: { id: string; name: string } | null;
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
    throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
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
      globalCategoryId: true,
      globalCategory: { select: { id: true, name: true } },
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
      globalCategoryId: service.globalCategoryId ?? null,
      globalCategory: service.globalCategory
        ? { id: service.globalCategory.id, name: service.globalCategory.name }
        : null,
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
    throw new AppError("Категория не найдена.", 404, "NOT_FOUND");
  }
  if (category.studioId !== input.studioId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
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
    throw new AppError("Часть категорий не найдена.", 404, "NOT_FOUND");
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
  /** CATEGORY-UNIFICATION-A: optional. Legacy ServiceCategory FK kept
   * for `studio-settings-page.tsx`; new flow leaves it null. */
  categoryId?: string;
  title: string;
  description?: string;
  /** Drives catalog visibility. Accepts APPROVED globals OR a pending
   * category proposed by `proposerUserId`. */
  globalCategoryId?: string;
  /** Required when `globalCategoryId` points at a PENDING category
   * (own-pending check mirrors `listAvailableGlobalCategories`). */
  proposerUserId?: string;
  basePrice: number;
  baseDurationMin: number;
  /** MOBILE-STUDIO-C: сразу с онлайн-оплатой (тариф проверяет маршрут). */
  onlinePaymentEnabled?: boolean;
}): Promise<{ id: string }> {
  const studio = await getStudioContext(input.studioId);
  const normalizedPrice = normalizeStudioServicePrice(input.basePrice);
  const normalizedDurationMin = normalizeStudioServiceDurationMin(input.baseDurationMin);
  const globalCategoryId = input.globalCategoryId?.trim() || null;
  const categoryId = input.categoryId?.trim() || null;

  // Legacy ServiceCategory path: validate only when client supplied it.
  if (categoryId) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      select: { studioId: true },
    });
    if (!category || category.studioId !== studio.id) {
      throw new AppError("Категория не найдена.", 404, "NOT_FOUND");
    }
  }

  if (globalCategoryId) {
    const globalCategory = await prisma.globalCategory.findUnique({
      where: { id: globalCategoryId },
      select: {
        id: true,
        status: true,
        visualSearchSlug: true,
        proposedBy: true,
        createdByUserId: true,
      },
    });
    if (!globalCategory || globalCategory.visualSearchSlug === "hot") {
      throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
    }
    const isApproved = globalCategory.status === CategoryStatus.APPROVED;
    const isOwnPending =
      globalCategory.status === CategoryStatus.PENDING &&
      Boolean(input.proposerUserId) &&
      (globalCategory.proposedBy === input.proposerUserId ||
        globalCategory.createdByUserId === input.proposerUserId);
    if (!isApproved && !isOwnPending) {
      throw new AppError("Глобальная категория недоступна", 404, "NOT_FOUND");
    }
  }

  const last = await prisma.service.findFirst({
    where: {
      studioId: studio.id,
      ...(categoryId ? { categoryId } : { categoryId: null }),
    },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        providerId: studio.providerId,
        studioId: studio.id,
        categoryId,
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
        onlinePaymentEnabled: input.onlinePaymentEnabled ?? false,
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
  /** STUDIO-SERVICE-PENDING-CATEGORY-01: кто правит — для правила «своя на модерации». */
  proposerUserId?: string;
}): Promise<{ id: string }> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true, studioId: true, globalCategoryId: true },
  });
  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }
  if (service.studioId !== input.studioId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  if (input.categoryId) {
    const category = await prisma.serviceCategory.findUnique({
      where: { id: input.categoryId },
      select: { studioId: true },
    });
    if (!category || category.studioId !== input.studioId) {
      throw new AppError("Категория не найдена.", 404, "NOT_FOUND");
    }
  }

  let nextGlobalCategoryId: string | null | undefined;
  if (input.globalCategoryId !== undefined) {
    const trimmed = typeof input.globalCategoryId === "string" ? input.globalCategoryId.trim() : "";
    nextGlobalCategoryId = trimmed.length > 0 ? trimmed : null;
    // STUDIO-SERVICE-PENDING-CATEGORY-01: правило то же, что при создании
    // (`createStudioService`): одобренная ИЛИ своя, ещё на модерации. Раньше
    // правка требовала строго одобренную, а форма шлёт категорию при каждом
    // сохранении — поэтому любая правка услуги с категорией на модерации, в
    // том числе назначение мастера, падала «Глобальная категория не найдена».
    // Неизменённую категорию не перепроверяем вовсе: её уже приняли.
    if (nextGlobalCategoryId && nextGlobalCategoryId !== service.globalCategoryId) {
      const globalCategory = await prisma.globalCategory.findUnique({
        where: { id: nextGlobalCategoryId },
        select: { id: true, status: true, visualSearchSlug: true, proposedBy: true, createdByUserId: true },
      });
      if (!globalCategory || globalCategory.visualSearchSlug === "hot") {
        throw new AppError("Глобальная категория не найдена", 404, "NOT_FOUND");
      }
      const isApproved = globalCategory.status === CategoryStatus.APPROVED;
      const isOwnPending =
        globalCategory.status === CategoryStatus.PENDING &&
        Boolean(input.proposerUserId) &&
        (globalCategory.proposedBy === input.proposerUserId ||
          globalCategory.createdByUserId === input.proposerUserId);
      if (!isApproved && !isOwnPending) {
        throw new AppError("Глобальная категория недоступна", 404, "NOT_FOUND");
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

/**
 * Скоуп списка, внутри которого меняется порядок (MOBILE-STUDIO-C, G3).
 *  - `categoryId` — устаревшая `ServiceCategory` (прежний контракт);
 *  - `globalCategoryId` — категория каталога: так прайс группируют веб и
 *    приложение, а новые услуги создаются без устаревшей категории, и раньше
 *    их порядок поменять было нельзя вовсе. `null` или `"__uncategorized__"`
 *    (ключ корзины «Без категории» кабинета) — услуги без категории;
 *  - ни того, ни другого — весь прайс студии.
 */
export function studioServicesReorderScope(input: {
  categoryId?: string;
  globalCategoryId?: string | null;
}): Prisma.ServiceWhereInput {
  if (input.categoryId) return { categoryId: input.categoryId };
  if (input.globalCategoryId === undefined) return {};
  const isUncategorized =
    input.globalCategoryId === null || input.globalCategoryId === UNCATEGORIZED_KEY;
  return { globalCategoryId: isUncategorized ? null : input.globalCategoryId };
}

export async function reorderStudioServices(input: {
  studioId: string;
  categoryId?: string;
  globalCategoryId?: string | null;
  orderedIds: string[];
}): Promise<{ updated: number }> {
  // Каждая услуга списка обязана быть этой студии и этого скоупа — иначе 404,
  // и порядок не трогаем вовсе (в том числе чужих строк).
  const services = await prisma.service.findMany({
    where: {
      studioId: input.studioId,
      ...studioServicesReorderScope(input),
      id: { in: input.orderedIds },
    },
    select: { id: true },
  });
  if (services.length !== input.orderedIds.length) {
    throw new AppError("Часть услуг не найдена.", 404, "NOT_FOUND");
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
  isEnabled?: boolean;
}): Promise<{ serviceId: string; masterId: string }> {
  // SECURITY-EXPOSURE-AUDIT-01 #1 (R1e): the service guard was null-permissive
  // (`service.studioId && …`), so a solo provider's service (studioId === null)
  // could be targeted from any studio. Scope the service to this studio; the
  // master is scoped below by requireActiveStudioMaster.
  await assertBelongsToStudio("service", input.serviceId, input.studioId);

  const studio = await getStudioContext(input.studioId);
  // STUDIO-BUGS-FIX-A bug #5: gate assignment on ACTIVE master status.
  // INVITED (ownerUserId IS NULL) or DISABLED (studioPaused) masters
  // throw 409 MASTER_NOT_ACTIVE.
  await requireActiveStudioMaster({
    studioProviderId: studio.providerId,
    masterId: input.masterId,
  });

  await prisma.masterService.upsert({
    where: { masterProviderId_serviceId: { masterProviderId: input.masterId, serviceId: input.serviceId } },
    create: {
      studioId: input.studioId,
      masterProviderId: input.masterId,
      masterId: input.masterId,
      serviceId: input.serviceId,
      isEnabled: input.isEnabled ?? true,
    },
    update: {
      studioId: input.studioId,
      masterId: input.masterId,
      isEnabled: input.isEnabled ?? true,
    },
  });

  return { serviceId: input.serviceId, masterId: input.masterId };
}

/**
 * Soft-removes a master from a service by setting `MasterService.isEnabled
 * = false`. Mirrors the `assignMasterToService` pattern (upsert with
 * `isEnabled` flag) so the link record survives for analytics — the
 * master simply stops offering this service. Used by the studio
 * services page detail panel.
 */
export async function unassignMasterFromService(input: {
  studioId: string;
  serviceId: string;
  masterId: string;
}): Promise<{ serviceId: string; masterId: string }> {
  // SECURITY-EXPOSURE-AUDIT-01 #1 (R1e): the service guard was null-permissive
  // AND the master was never scoped (unlike assign). Scope BOTH to this studio.
  await assertBelongsToStudio("service", input.serviceId, input.studioId);
  await assertBelongsToStudio("master", input.masterId, input.studioId);

  await prisma.masterService.updateMany({
    where: {
      masterProviderId: input.masterId,
      serviceId: input.serviceId,
    },
    data: { isEnabled: false },
  });

  return { serviceId: input.serviceId, masterId: input.masterId };
}

/**
 * Deletes a service from the studio catalogue. The Service row is
 * removed entirely; cascading FKs handle MasterService cleanup. Hard
 * delete is acceptable for catalogue items (no business retention need
 * — analytics use `BookingServiceItem.priceSnapshot` snapshots, which
 * survive service deletion).
 *
 * MOBILE-STUDIO-C (G4): `Booking.serviceId` — `onDelete: Restrict`, поэтому
 * услуга с записями не удаляется, и раньше это был 500 (P2003 до
 * `toAppError` не узнаётся). Теперь — 409 `SERVICE_HAS_BOOKINGS` с подсказкой
 * выключить услугу, как у мастера (`deleteMasterService`): записи считаются
 * заранее, а запись, созданная между подсчётом и удалением, ловится по P2003.
 * Счётчик использования категории уменьшается, как при смене категории.
 */
export const SERVICE_HAS_BOOKINGS_MESSAGE = "У услуги есть записи. Выключите её вместо удаления.";

function serviceHasBookingsError(): AppError {
  return new AppError(SERVICE_HAS_BOOKINGS_MESSAGE, 409, "SERVICE_HAS_BOOKINGS");
}

/** P2003 — нарушение внешнего ключа; структурно, без value-импорта Prisma (как P2002 в `toAppError`). */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2003";
}

export async function deleteStudioService(input: {
  studioId: string;
  serviceId: string;
}): Promise<{ id: string }> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: {
      id: true,
      studioId: true,
      globalCategoryId: true,
      // include-ok: счётчик, а не выборка строк.
      _count: { select: { bookings: true } },
    },
  });
  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }
  if (service.studioId !== input.studioId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }
  if (service._count.bookings > 0) {
    throw serviceHasBookingsError();
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.service.delete({ where: { id: service.id } });
      if (service.globalCategoryId) {
        await tx.globalCategory.updateMany({
          where: { id: service.globalCategoryId, usageCount: { gt: 0 } },
          data: { usageCount: { decrement: 1 } },
        });
      }
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) throw serviceHasBookingsError();
    throw error;
  }
  return { id: service.id };
}


import {
  BookingStatus,
  CategoryStatus,
  Prisma,
  ProviderType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  UNCATEGORIZED_KEY,
  type StudioCategoryPickerOption,
  type StudioServiceCategoryRow,
  type StudioServiceDetail,
  type StudioServiceListItem,
  type StudioServicesKpis,
} from "../lib/types";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { studioBookingsWhere } from "@/lib/studio/booking-scope";

/**
 * CATEGORY-UNIFICATION-A: services-data service reads + groups by
 * `GlobalCategory` (the field the public catalog filters on). Pending
 * categories proposed by `currentUserId` are surfaced alongside
 * APPROVED globals — mirrors the master cabinet's
 * `listAvailableGlobalCategories` semantics so the studio admin can
 * use a freshly-proposed category right away.
 */

const COMPLETED_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.STARTED,
  BookingStatus.PREPAID,
  BookingStatus.IN_PROGRESS,
  BookingStatus.FINISHED,
];

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveBookingPriceKopeks(input: {
  service: { price: number } | null;
  serviceItems: Array<{ priceSnapshot: number }>;
}): number {
  const snapshotSum = input.serviceItems.reduce(
    (sum, item) => sum + Math.max(0, item.priceSnapshot),
    0,
  );
  if (snapshotSum > 0) return snapshotSum;
  return Math.max(0, input.service?.price ?? 0);
}

async function get30dBookingsByService(
  studioId: string,
): Promise<Map<string, { count: number; revenue: number }>> {
  const todayStart = startOfUtcDay(new Date());
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const bookings = await prisma.booking.findMany({
    where: {
      ...studioBookingsWhere(studioId),
      startAtUtc: { gte: periodStart, lt: periodEnd },
      status: { in: COMPLETED_STATUSES },
    },
    select: {
      serviceId: true,
      service: { select: { price: true } },
      serviceItems: { select: { priceSnapshot: true } },
    },
  });

  const map = new Map<string, { count: number; revenue: number }>();
  for (const booking of bookings) {
    if (!booking.serviceId) continue;
    const entry = map.get(booking.serviceId) ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += resolveBookingPriceKopeks(booking);
    map.set(booking.serviceId, entry);
  }
  return map;
}

/**
 * Available categories for the studio admin's pickers — APPROVED
 * globally visible categories plus own-pending proposals. Excludes
 * the `visualSearchSlug=hot` system category (reserved for hot-slot
 * routing, not a catalog filter).
 */
export async function listAvailableCategoriesForStudio(
  currentUserId: string,
): Promise<StudioCategoryPickerOption[]> {
  // STUDIO-BUGS-FIX-A bug #3: Prisma's `{ not: "hot" }` on a nullable field
  // excludes NULL rows (documented SQL-semantics behaviour). Freshly proposed
  // categories have `visualSearchSlug = null`, so the previous in-WHERE filter
  // silently dropped them from the picker. Select the field and filter
  // post-query — keeps the query simple and works regardless of Prisma
  // version.
  const rows = await prisma.globalCategory.findMany({
    where: {
      OR: [
        { status: CategoryStatus.APPROVED, visibleToAll: true },
        { createdByUserId: currentUserId },
        { proposedBy: currentUserId },
      ],
    },
    select: { id: true, name: true, icon: true, status: true, visualSearchSlug: true },
    orderBy: { name: "asc" },
  });
  return rows
    .filter(
      (row) =>
        row.status !== CategoryStatus.REJECTED &&
        row.visualSearchSlug !== "hot",
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      status: row.status === CategoryStatus.APPROVED ? "APPROVED" : "PENDING",
    }));
}

async function buildCategoriesSidebar(
  studioId: string,
  currentUserId: string,
): Promise<StudioServiceCategoryRow[]> {
  const services = await prisma.service.findMany({
    where: { studioId },
    select: { id: true, globalCategoryId: true },
  });
  const inUseIds = Array.from(
    new Set(
      services
        .map((s) => s.globalCategoryId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const uncategorizedCount = services.filter((s) => !s.globalCategoryId).length;

  // Union: in-use ∪ APPROVED-visible ∪ own-pending. Sidebar shows the
  // same pickable set as the dialog dropdown so studio admin can
  // navigate by category before attaching a service.
  // STUDIO-BUGS-FIX-A bug #3: post-query filter for visualSearchSlug=hot
  // (Prisma `not` on nullable column excludes NULL rows — see
  // listAvailableCategoriesForStudio above).
  const globalsRaw = await prisma.globalCategory.findMany({
    where: {
      OR: [
        ...(inUseIds.length > 0 ? [{ id: { in: inUseIds } }] : []),
        { status: CategoryStatus.APPROVED, visibleToAll: true },
        { createdByUserId: currentUserId },
        { proposedBy: currentUserId },
      ],
    },
    select: { id: true, name: true, icon: true, status: true, visualSearchSlug: true },
    orderBy: { name: "asc" },
  });
  const globals = globalsRaw.filter((g) => g.visualSearchSlug !== "hot");

  const countByCategory = new Map<string, number>();
  for (const service of services) {
    if (!service.globalCategoryId) continue;
    countByCategory.set(
      service.globalCategoryId,
      (countByCategory.get(service.globalCategoryId) ?? 0) + 1,
    );
  }

  const rows: StudioServiceCategoryRow[] = globals
    .filter((g) => g.status !== CategoryStatus.REJECTED)
    .map<StudioServiceCategoryRow>((g) => ({
      id: g.id,
      title: g.name,
      icon: g.icon,
      servicesCount: countByCategory.get(g.id) ?? 0,
      status: g.status === CategoryStatus.APPROVED ? "APPROVED" : "PENDING",
    }))
    // STUDIO-SERVICES-SORT-A: primary by services count (desc — the
    // most-populated categories surface first), secondary alphabetical
    // for stable, predictable ordering when counts tie. Replaces the
    // previous APPROVED-tier-first sort — APPROVED vs PENDING is
    // already visually distinguishable via the amber «PENDING» badge,
    // so the tier no longer needs to drive primary ordering.
    .sort((a, b) => {
      if (a.servicesCount !== b.servicesCount) {
        return b.servicesCount - a.servicesCount;
      }
      return a.title.localeCompare(b.title, "ru");
    });

  if (uncategorizedCount > 0) {
    rows.push({
      id: UNCATEGORIZED_KEY,
      title: "Без категории",
      icon: null,
      servicesCount: uncategorizedCount,
      status: "uncategorized",
    });
  }

  return rows;
}

export async function loadStudioServicesListData(input: {
  studioId: string;
  currentUserId: string;
  categoryId?: string | null;
  search?: string;
  /**
   * MOBILE-STUDIO-C: что делать без категории (или с неизвестной). Веб
   * (`"first"`, по умолчанию) открывает первую категорию сайдбара; приложение
   * (`"all"`) получает весь прайс, а неизвестную категорию — как есть
   * (пустой список).
   */
  categoryFallback?: "first" | "all";
}): Promise<{
  categories: StudioServiceCategoryRow[];
  items: StudioServiceListItem[];
  selectedCategoryId: string | null;
  totalServices: number;
}> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    return {
      categories: [],
      items: [],
      selectedCategoryId: null,
      totalServices: 0,
    };
  }

  const [categories, totalServicesCount] = await Promise.all([
    buildCategoriesSidebar(studio.id, input.currentUserId),
    prisma.service.count({ where: { studioId: studio.id } }),
  ]);

  const selectedCategoryId =
    input.categoryFallback === "all"
      ? input.categoryId || null
      : input.categoryId && categories.some((c) => c.id === input.categoryId)
        ? input.categoryId
        : categories[0]?.id ?? null;

  const searchTrimmed = input.search?.trim() ?? "";

  const where: Prisma.ServiceWhereInput = {
    studioId: studio.id,
    ...(selectedCategoryId === UNCATEGORIZED_KEY
      ? { globalCategoryId: null }
      : selectedCategoryId
        ? { globalCategoryId: selectedCategoryId }
        : {}),
    ...(searchTrimmed
      ? {
          OR: [
            { name: { contains: searchTrimmed, mode: "insensitive" } },
            { title: { contains: searchTrimmed, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [services, bookingsByService] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        title: true,
        durationMin: true,
        price: true,
        basePrice: true,
        baseDurationMin: true,
        globalCategoryId: true,
        isActive: true,
        onlinePaymentEnabled: true,
        sortOrder: true,
        _count: { select: { masterServices: { where: { isEnabled: true } } } },
        masterServices: {
          where: { isEnabled: true },
          take: 4,
          orderBy: { createdAt: "asc" },
          select: {
            masterProvider: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
        },
      },
    }),
    get30dBookingsByService(studio.id),
  ]);

  const items: StudioServiceListItem[] = services.map((service) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.baseDurationMin ?? service.durationMin,
    priceKopeks: service.basePrice ?? service.price,
    categoryId: service.globalCategoryId ?? null,
    isActive: service.isActive,
    onlinePaymentEnabled: service.onlinePaymentEnabled,
    sortOrder: service.sortOrder,
    bookings30d: bookingsByService.get(service.id)?.count ?? 0,
    mastersCount: service._count.masterServices,
    masters: service.masterServices.map((ms) => ({
      id: ms.masterProvider.id,
      displayName: ms.masterProvider.name,
      avatarUrl: ms.masterProvider.avatarUrl ?? null,
    })),
  }));

  return {
    categories,
    items,
    selectedCategoryId,
    totalServices: totalServicesCount,
  };
}

export async function loadStudioServicesKpis(
  studioId: string,
): Promise<StudioServicesKpis> {
  const studio = await prisma.studio.findUnique({
    where: { id: studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) {
    return {
      totalServices: 0,
      totalCategories: 0,
      popularServiceName: null,
      popularBookings30d: 0,
      averageCheckKopeks: 0,
      servicesWithoutMaster: 0,
    };
  }

  const services = await prisma.service.findMany({
    where: { studioId: studio.id },
    select: {
      id: true,
      name: true,
      title: true,
      price: true,
      basePrice: true,
      globalCategoryId: true,
      masterServices: {
        where: { isEnabled: true },
        select: { id: true },
        take: 1,
      },
    },
  });

  const usedGlobalCategoryIds = new Set<string>();
  let hasUncategorized = false;
  for (const service of services) {
    if (service.globalCategoryId) usedGlobalCategoryIds.add(service.globalCategoryId);
    else hasUncategorized = true;
  }
  const categoriesCount = usedGlobalCategoryIds.size + (hasUncategorized ? 1 : 0);

  const bookingsByService = await get30dBookingsByService(studio.id);

  let popularServiceId: string | null = null;
  let popularBookings = 0;
  for (const [serviceId, stats] of bookingsByService.entries()) {
    if (stats.count > popularBookings) {
      popularBookings = stats.count;
      popularServiceId = serviceId;
    }
  }
  const popularService = popularServiceId
    ? services.find((s) => s.id === popularServiceId)
    : null;

  let totalRevenue = 0;
  let totalCount = 0;
  for (const stats of bookingsByService.values()) {
    totalRevenue += stats.revenue;
    totalCount += stats.count;
  }
  const averageCheck = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0;

  const servicesWithoutMaster = services.filter(
    (s) => s.masterServices.length === 0,
  ).length;

  return {
    totalServices: services.length,
    totalCategories: categoriesCount,
    popularServiceName: popularService
      ? popularService.title?.trim() || popularService.name
      : null,
    popularBookings30d: popularBookings,
    averageCheckKopeks: averageCheck,
    servicesWithoutMaster,
  };
}

export async function loadStudioServiceDetail(input: {
  studioId: string;
  serviceId: string;
}): Promise<StudioServiceDetail | null> {
  const studio = await prisma.studio.findUnique({
    where: { id: input.studioId },
    select: { id: true, providerId: true },
  });
  if (!studio) return null;

  const service = await prisma.service.findFirst({
    where: { id: input.serviceId, studioId: studio.id },
    select: {
      id: true,
      name: true,
      title: true,
      description: true,
      durationMin: true,
      price: true,
      basePrice: true,
      baseDurationMin: true,
      globalCategoryId: true,
      isActive: true,
      onlinePaymentEnabled: true,
      sortOrder: true,
      masterServices: {
        where: { isEnabled: true },
        orderBy: { createdAt: "asc" },
        select: {
          masterProvider: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!service) return null;

  // STUDIO-BUGS-FIX-A bug #5: assign-master picker shows only ACTIVE
  // masters. INVITED (ownerUserId IS NULL) and DISABLED (studioPaused)
  // are filtered out at the source so they never appear in the dropdown.
  const allMasters = await prisma.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      studioId: studio.providerId,
      ...STUDIO_ACTIVE_MASTER_WHERE,
    },
    select: { id: true, name: true, avatarUrl: true },
    orderBy: { name: "asc" },
  });

  const assignedIds = new Set(
    service.masterServices.map((ms) => ms.masterProvider.id),
  );
  const assignedMasters = service.masterServices.map((ms) => ({
    id: ms.masterProvider.id,
    displayName: ms.masterProvider.name,
    avatarUrl: ms.masterProvider.avatarUrl ?? null,
  }));
  const availableMasters = allMasters
    .filter((m) => !assignedIds.has(m.id))
    .map((m) => ({
      id: m.id,
      displayName: m.name,
      avatarUrl: m.avatarUrl ?? null,
    }));

  const todayStart = startOfUtcDay(new Date());
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);
  const periodBookings = await prisma.booking.findMany({
    where: {
      ...studioBookingsWhere(studio.id),
      serviceId: service.id,
      startAtUtc: { gte: periodStart, lt: periodEnd },
      status: { in: COMPLETED_STATUSES },
    },
    select: {
      service: { select: { price: true } },
      serviceItems: { select: { priceSnapshot: true } },
    },
  });
  const stats30dRevenue = periodBookings.reduce(
    (sum, b) => sum + resolveBookingPriceKopeks(b),
    0,
  );

  return {
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.baseDurationMin ?? service.durationMin,
    priceKopeks: service.basePrice ?? service.price,
    categoryId: service.globalCategoryId ?? null,
    isActive: service.isActive,
    onlinePaymentEnabled: service.onlinePaymentEnabled,
    sortOrder: service.sortOrder,
    bookings30d: periodBookings.length,
    mastersCount: assignedMasters.length,
    masters: assignedMasters,
    description: service.description ?? null,
    assignedMasters,
    availableMasters,
    stats30d: {
      bookingsCount: periodBookings.length,
      revenueKopeks: stats30dRevenue,
    },
  };
}

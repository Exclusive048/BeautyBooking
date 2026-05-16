import { BookingStatus, Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  StudioServiceCategoryRow,
  StudioServiceDetail,
  StudioServiceListItem,
  StudioServicesKpis,
} from "../lib/types";

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
  providerId: string,
): Promise<Map<string, { count: number; revenue: number }>> {
  const todayStart = startOfUtcDay(new Date());
  const periodStart = addUtcDays(todayStart, -29);
  const periodEnd = addUtcDays(todayStart, 1);

  const bookings = await prisma.booking.findMany({
    where: {
      OR: [{ studioId }, { providerId }],
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

export async function loadStudioServicesListData(input: {
  studioId: string;
  categoryId?: string | null;
  search?: string;
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

  const [categoriesRaw, allServices] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { studioId: studio.id },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: { id: true, title: true, sortOrder: true },
    }),
    prisma.service.findMany({
      where: { studioId: studio.id },
      select: {
        id: true,
        categoryId: true,
      },
    }),
  ]);

  const servicesCountByCategory = new Map<string, number>();
  for (const service of allServices) {
    if (!service.categoryId) continue;
    servicesCountByCategory.set(
      service.categoryId,
      (servicesCountByCategory.get(service.categoryId) ?? 0) + 1,
    );
  }

  const categories: StudioServiceCategoryRow[] = categoriesRaw.map((cat) => ({
    id: cat.id,
    title: cat.title,
    servicesCount: servicesCountByCategory.get(cat.id) ?? 0,
    sortOrder: cat.sortOrder,
  }));

  const selectedCategoryId =
    input.categoryId && categories.some((c) => c.id === input.categoryId)
      ? input.categoryId
      : categories[0]?.id ?? null;

  const searchTrimmed = input.search?.trim().toLowerCase() ?? "";

  const where: Prisma.ServiceWhereInput = {
    studioId: studio.id,
    ...(selectedCategoryId ? { categoryId: selectedCategoryId } : {}),
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
        categoryId: true,
        isActive: true,
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
    get30dBookingsByService(studio.id, studio.providerId),
  ]);

  const items: StudioServiceListItem[] = services.map((service) => ({
    id: service.id,
    name: service.title?.trim() || service.name,
    durationMin: service.baseDurationMin ?? service.durationMin,
    priceKopeks: service.basePrice ?? service.price,
    categoryId: service.categoryId ?? null,
    isActive: service.isActive,
    bookings30d: bookingsByService.get(service.id)?.count ?? 0,
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
    totalServices: allServices.length,
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

  const [services, categoriesCount, bookingsByService] = await Promise.all([
    prisma.service.findMany({
      where: { studioId: studio.id },
      select: {
        id: true,
        name: true,
        title: true,
        price: true,
        basePrice: true,
        masterServices: {
          where: { isEnabled: true },
          select: { id: true },
          take: 1,
        },
      },
    }),
    prisma.serviceCategory.count({ where: { studioId: studio.id } }),
    get30dBookingsByService(studio.id, studio.providerId),
  ]);

  // Popular service — highest bookings30d
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

  // Average check — total revenue / total bookings in 30d
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
      categoryId: true,
      isActive: true,
      masterServices: {
        where: { isEnabled: true },
        select: {
          masterProvider: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!service) return null;

  const allMasters = await prisma.provider.findMany({
    where: { type: ProviderType.MASTER, studioId: studio.providerId },
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
      OR: [{ studioId: studio.id }, { providerId: studio.providerId }],
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
    categoryId: service.categoryId ?? null,
    isActive: service.isActive,
    bookings30d: periodBookings.length,
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

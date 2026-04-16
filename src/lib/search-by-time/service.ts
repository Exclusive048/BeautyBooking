import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/api/errors";
import type { AvailabilitySearchQuery } from "@/lib/search-by-time/schemas";
import type { AvailabilityProviderItem, AvailabilitySearchResponse } from "@/lib/search-by-time/types";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { isDateKey } from "@/lib/schedule/dateKey";
import { getLocalTimeParts } from "@/lib/schedule/timezone";
import type { CatalogSmartTagPreset } from "@/lib/catalog/schemas";

const DEFAULT_SEARCH_TIMEZONE = env.DEFAULT_TIMEZONE;
const MAX_SLOTS_PER_PROVIDER = 12;
const CANDIDATE_MULTIPLIER = 3;
const MAX_CANDIDATES = 120;
const SMART_TAG_MIN_COUNT = 3;

const SMART_TAG_TO_REVIEW_CODE: Record<CatalogSmartTagPreset, string> = {
  rush: "FAST",
  relax: "ATMOSPHERE",
  design: "DESIGN",
  safe: "STERILE",
  silent: "PLEASANT_SILENCE",
};

type TimeRangeMinutes = {
  fromMin: number;
  toMin: number;
};

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeTimeRange(timeFrom: string | undefined, timeTo: string | undefined): TimeRangeMinutes {
  if (!timeFrom || !timeTo) {
    throw new AppError("Выберите диапазон времени", 400, "TIME_RANGE_INVALID");
  }
  const fromMin = parseTimeToMinutes(timeFrom);
  const toMin = parseTimeToMinutes(timeTo);
  if (fromMin === null || toMin === null) {
    throw new AppError("Некорректный формат времени", 400, "TIME_RANGE_INVALID");
  }
  if (fromMin >= toMin) {
    throw new AppError("Некорректный диапазон времени", 400, "TIME_RANGE_INVALID");
  }
  if (fromMin < 6 * 60 || toMin > 23 * 60 + 59) {
    throw new AppError("Диапазон времени должен быть в пределах 06:00–23:59", 400, "TIME_RANGE_INVALID");
  }
  if (fromMin % 5 !== 0 || toMin % 5 !== 0) {
    throw new AppError("Шаг времени должен быть кратен 5 минутам", 400, "TIME_RANGE_INVALID");
  }
  return { fromMin, toMin };
}

function formatTimeLabel(date: Date, timeZone: string): string {
  const parts = getLocalTimeParts(date, timeZone);
  const hours = String(parts.hour).padStart(2, "0");
  const minutes = String(parts.minute).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function resolveProviderTimezone(timezone: string | null | undefined): string {
  const candidate = timezone?.trim();
  const selected = candidate && candidate.length > 0 ? candidate : DEFAULT_SEARCH_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: selected }).format(new Date());
    return selected;
  } catch {
    return DEFAULT_SEARCH_TIMEZONE;
  }
}

function buildWhere(
  input: AvailabilitySearchQuery,
  serviceId: string,
  hotProviderIds?: string[]
): Prisma.ProviderWhereInput {
  const and: Prisma.ProviderWhereInput[] = [
    { isPublished: true },
    { publicUsername: { not: null } },
    {
      OR: [
        {
          services: {
            some: {
              id: serviceId,
              isEnabled: true,
              isActive: true,
            },
          },
        },
        {
          masterServices: {
            some: {
              serviceId,
              isEnabled: true,
              service: { isEnabled: true, isActive: true },
            },
          },
        },
      ],
    },
  ];

  if (input.entityType === "master") {
    and.push({ type: ProviderType.MASTER });
  } else if (input.entityType === "studio") {
    and.push({ type: ProviderType.STUDIO });
  }

  if (input.district) {
    and.push({ district: { contains: input.district, mode: "insensitive" } });
  }

  if (typeof input.availableToday === "boolean") {
    and.push({ availableToday: input.availableToday });
  }

  if (typeof input.ratingMin === "number") {
    and.push({ ratingAvg: { gte: input.ratingMin } });
  }

  if (typeof input.priceMin === "number") {
    and.push({ priceFrom: { gte: input.priceMin } });
  }

  if (typeof input.priceMax === "number") {
    and.push({ priceFrom: { lte: input.priceMax } });
  }

  if (hotProviderIds) {
    and.push({ id: { in: hotProviderIds } });
  }

  return and.length ? { AND: and } : {};
}

async function loadHotProviderIds(): Promise<string[]> {
  const items = await prisma.discountRule.findMany({
    where: {
      isEnabled: true,
      provider: { type: "MASTER" },
    },
    select: { providerId: true },
  });
  return Array.from(new Set(items.map((item) => item.providerId)));
}

async function loadSmartTagCounts(
  providerIds: string[],
  preset: CatalogSmartTagPreset | undefined
): Promise<Map<string, number>> {
  if (!preset || providerIds.length === 0) return new Map();
  const tagCode = SMART_TAG_TO_REVIEW_CODE[preset];

  const reviews = await prisma.review.findMany({
    where: {
      targetType: "provider",
      targetId: { in: providerIds },
      tags: {
        some: {
          tag: {
            type: "PUBLIC",
            code: tagCode,
          },
        },
      },
    },
    select: {
      targetId: true,
      tags: {
        where: {
          tag: {
            type: "PUBLIC",
            code: tagCode,
          },
        },
        select: { tagId: true },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const review of reviews) {
    const current = counts.get(review.targetId) ?? 0;
    counts.set(review.targetId, current + review.tags.length);
  }
  return counts;
}

export async function searchAvailabilityByTime(input: AvailabilitySearchQuery): Promise<AvailabilitySearchResponse> {
  const serviceId = input.serviceId?.trim() ?? "";
  if (!serviceId) {
    throw new AppError("Сначала выберите услугу", 400, "SERVICE_REQUIRED");
  }

  const dateKey = input.date?.trim() ?? "";
  if (!dateKey || !isDateKey(dateKey)) {
    throw new AppError("Некорректная дата", 400, "DATE_INVALID");
  }

  const { fromMin, toMin } = normalizeTimeRange(input.timeFrom, input.timeTo);

  const limit = input.limit ?? 30;
  const candidateLimit = Math.min(Math.max(limit * CANDIDATE_MULTIPLIER, limit), MAX_CANDIDATES);

  const hotProviderIds = input.hot ? await loadHotProviderIds() : null;
  if (input.hot && (!hotProviderIds || hotProviderIds.length === 0)) {
    return { items: [] };
  }

  const where = buildWhere(input, serviceId, hotProviderIds ?? undefined);

  const providers = await prisma.provider.findMany({
    where,
    orderBy: [{ ratingAvg: "desc" }, { reviews: "desc" }, { createdAt: "desc" }],
    take: candidateLimit,
    select: {
      id: true,
      type: true,
      name: true,
      publicUsername: true,
      avatarUrl: true,
      avatarFocalX: true,
      avatarFocalY: true,
      ratingAvg: true,
      reviews: true,
      priceFrom: true,
      address: true,
      district: true,
      geoLat: true,
      geoLng: true,
      timezone: true,
      services: {
        where: { id: serviceId, isEnabled: true, isActive: true },
        select: {
          id: true,
          name: true,
          title: true,
          price: true,
          durationMin: true,
          isEnabled: true,
          isActive: true,
        },
      },
      masterServices: {
        where: { serviceId, isEnabled: true },
        select: {
          priceOverride: true,
          durationOverrideMin: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              price: true,
              durationMin: true,
              isEnabled: true,
              isActive: true,
            },
          },
        },
      },
      portfolioItems: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { mediaUrl: true },
      },
      masters: {
        select: {
          portfolioItems: {
            where: { isPublic: true },
            orderBy: { createdAt: "desc" },
            take: 4,
            select: { mediaUrl: true },
          },
        },
      },
    },
  });

  const now = new Date();
  const items: AvailabilityProviderItem[] = [];

  await Promise.all(
    providers.map(async (provider) => {
      const username = provider.publicUsername;
      if (!username) return;

      const directService = provider.services[0] ?? null;
      const masterService = provider.masterServices[0] ?? null;
      const baseService = masterService?.service ?? directService;
      if (!baseService || !baseService.isEnabled || !baseService.isActive) return;

      const serviceTitle = baseService.title?.trim() || baseService.name;
      const durationMin = masterService?.durationOverrideMin ?? baseService.durationMin;
      const servicePrice = masterService?.priceOverride ?? baseService.price;
      const providerTimezone = resolveProviderTimezone(provider.timezone);

      const result = await listAvailabilitySlotsPaginated(provider.id, baseService.id, durationMin, {
        fromKey: dateKey,
        limit: 1,
      });
      if (!result.ok) return;

      const filtered = result.data.slots
        .filter((slot) => slot.startAtUtc > now)
        .filter((slot) => {
          const parts = getLocalTimeParts(slot.startAtUtc, providerTimezone);
          const minutes = parts.hour * 60 + parts.minute;
          return minutes >= fromMin && minutes < toMin;
        })
        .sort((a, b) => a.startAtUtc.getTime() - b.startAtUtc.getTime())
        .slice(0, MAX_SLOTS_PER_PROVIDER)
        .map((slot) => ({
          startAtUtc: slot.startAtUtc.toISOString(),
          label: formatTimeLabel(slot.startAtUtc, providerTimezone),
        }));

      if (filtered.length === 0) return;

      items.push({
        providerId: provider.id,
        providerType: provider.type,
        publicUsername: username,
        name: provider.name,
        avatarUrl: provider.avatarUrl,
        avatarFocalX: provider.avatarFocalX ?? null,
        avatarFocalY: provider.avatarFocalY ?? null,
        ratingAvg: provider.ratingAvg,
        reviewsCount: provider.reviews,
        priceFrom: provider.priceFrom > 0 ? provider.priceFrom : null,
        photos:
          provider.type === ProviderType.STUDIO
            ? provider.masters.flatMap((master) => master.portfolioItems.map((item) => item.mediaUrl)).slice(0, 8)
            : provider.portfolioItems.map((item) => item.mediaUrl).slice(0, 8),
        address: provider.address || null,
        district: provider.district || null,
        geoLat: provider.geoLat ?? null,
        geoLng: provider.geoLng ?? null,
        service: {
          id: baseService.id,
          title: serviceTitle,
          price: servicePrice,
          durationMin,
        },
        slots: filtered,
      });
    })
  );

  const smartCounts = await loadSmartTagCounts(
    items.map((item) => item.providerId),
    input.smartTag
  );

  const ranked = [...items]
    .map((item, index) => ({
      item,
      index,
      smartCount: smartCounts.get(item.providerId) ?? 0,
      firstSlotAt: new Date(item.slots[0]?.startAtUtc ?? 0).getTime(),
    }))
    .sort((a, b) => {
      if (input.smartTag) {
        const aBoost = a.smartCount >= SMART_TAG_MIN_COUNT ? 1 : 0;
        const bBoost = b.smartCount >= SMART_TAG_MIN_COUNT ? 1 : 0;
        if (aBoost !== bBoost) return bBoost - aBoost;
        if (a.smartCount !== b.smartCount) return b.smartCount - a.smartCount;
      }
      if (a.firstSlotAt !== b.firstSlotAt) return a.firstSlotAt - b.firstSlotAt;
      if (a.item.ratingAvg !== b.item.ratingAvg) return b.item.ratingAvg - a.item.ratingAvg;
      return a.index - b.index;
    })
    .map((entry) => entry.item)
    .slice(0, limit);

  return { items: ranked };
}

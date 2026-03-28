import { prisma } from "@/lib/prisma";
import * as cache from "@/lib/cache/cache";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { logError } from "@/lib/logging/logger";

const CACHE_KEY_PREFIX = "rebook";
const CACHE_TTL_SECONDS = 3600;
const MAX_RECENT_MASTERS = 5;
const LOOKBACK_MONTHS = 6;
const SLOT_SEARCH_DAYS = 5;

export type RecentMasterItem = {
  provider: {
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
    category: string | null;
  };
  lastService: {
    id: string;
    name: string;
    price: number;
    durationMin: number;
  };
  lastVisit: string;
  nextSlot: {
    startAtUtc: string;
    endAtUtc: string;
    label: string;
    date: string;
    time: string;
  } | null;
};

function buildCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}:${userId}`;
}

export async function invalidateRecentMastersCache(userId: string): Promise<void> {
  try {
    await cache.del(buildCacheKey(userId));
  } catch {
    /* best effort */
  }
}

export async function getRecentMasters(userId: string): Promise<RecentMasterItem[]> {
  const cacheKey = buildCacheKey(userId);
  const cached = await cache.get<RecentMasterItem[]>(cacheKey);
  if (cached) return cached;

  const result = await loadRecentMasters(userId);
  await cache.set(cacheKey, result, CACHE_TTL_SECONDS);
  return result;
}

async function loadRecentMasters(userId: string): Promise<RecentMasterItem[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);

  const bookings = await prisma.booking.findMany({
    where: {
      clientUserId: userId,
      status: "FINISHED",
      startAtUtc: { gte: cutoff },
    },
    orderBy: { startAtUtc: "desc" },
    select: {
      startAtUtc: true,
      provider: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          publicUsername: true,
          isPublished: true,
          type: true,
          timezone: true,
        },
      },
      masterProvider: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          publicUsername: true,
          isPublished: true,
          type: true,
          timezone: true,
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          price: true,
          durationMin: true,
          isEnabled: true,
          isActive: true,
        },
      },
    },
  });

  const seen = new Set<string>();
  const candidates: Array<{
    provider: NonNullable<(typeof bookings)[number]["masterProvider"]>;
    service: (typeof bookings)[number]["service"];
    lastVisit: Date;
  }> = [];

  for (const booking of bookings) {
    const master = booking.masterProvider ?? booking.provider;
    if (!master.isPublished || master.type !== "MASTER") continue;
    if (seen.has(master.id)) continue;
    if (!booking.service.isEnabled || !booking.service.isActive) continue;
    seen.add(master.id);
    candidates.push({
      provider: master,
      service: booking.service,
      lastVisit: booking.startAtUtc!,
    });
    if (candidates.length >= MAX_RECENT_MASTERS) break;
  }

  const results = await Promise.all(
    candidates.map((c) => buildRecentMasterItem(c))
  );

  return results.filter((item): item is RecentMasterItem => item !== null);
}

async function buildRecentMasterItem(input: {
  provider: {
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
    timezone: string;
  };
  service: {
    id: string;
    name: string;
    price: number;
    durationMin: number;
  };
  lastVisit: Date;
}): Promise<RecentMasterItem | null> {
  const { provider, service, lastVisit } = input;

  const categoryRow = await prisma.service.findUnique({
    where: { id: service.id },
    select: { category: { select: { title: true } } },
  });

  const nextSlot = await findNextSlot(provider.id, service.id, provider.timezone);

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      avatarUrl: provider.avatarUrl,
      publicUsername: provider.publicUsername,
      category: categoryRow?.category?.title ?? null,
    },
    lastService: {
      id: service.id,
      name: service.name,
      price: service.price,
      durationMin: service.durationMin,
    },
    lastVisit: lastVisit.toISOString().slice(0, 10),
    nextSlot,
  };
}

async function findNextSlot(
  providerId: string,
  serviceId: string,
  timezone: string
): Promise<RecentMasterItem["nextSlot"]> {
  try {
    const duration = await resolveServiceDuration(providerId, serviceId);
    if (!duration.ok) return null;

    const now = new Date();
    const todayKey = toLocalDateKey(now, timezone);

    const result = await listAvailabilitySlotsPaginated(
      providerId,
      serviceId,
      duration.data,
      { fromKey: todayKey, limit: SLOT_SEARCH_DAYS }
    );

    if (!result.ok || result.data.slots.length === 0) return null;

    const firstSlot = result.data.slots[0];
    const startUtc = new Date(firstSlot.startAtUtc as unknown as string);
    const endUtc = new Date(firstSlot.endAtUtc as unknown as string);

    if (Number.isNaN(startUtc.getTime())) return null;

    const localDateKey = toLocalDateKey(startUtc, timezone);
    const localTime = startUtc.toLocaleTimeString("ru-RU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return {
      startAtUtc: startUtc.toISOString(),
      endAtUtc: endUtc.toISOString(),
      label: firstSlot.label,
      date: localDateKey,
      time: localTime,
    };
  } catch (error) {
    logError("findNextSlot failed", {
      providerId,
      serviceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

import type { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encodePublicId } from "@/lib/public-id";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";

/* ──────────────────────────────────────────────────────────────────────────
 * V2: getActiveStoriesGroups (used by /api/feed/stories)
 *
 * Cached in Redis under FEED_STORIES_CACHE_KEY (5 min TTL).
 * Invalidated on portfolio create (when provider.autoPublishStoriesEnabled).
 * Lookback hours from SystemConfig key STORIES_LOOKBACK_HOURS, default 72.
 * ────────────────────────────────────────────────────────────────────────── */

// v2 (STUDIO-PORTFOLIO-FEED): у элемента появилась подпись «мастер · услуга» —
// кадры прежней формы её не несут, поэтому ключ новый, а не общий.
export const FEED_STORIES_CACHE_KEY = "feed:stories:v2";
/**
 * MOBILE-B1 — истории города (`?city=<slug>`): свой ключ на город и множество-
 * указатель этих ключей, чтобы `invalidateStoriesCache` гасил их вместе с
 * общим (новая работа видна сразу и в ленте города). Общий ключ не меняется.
 */
export const FEED_STORIES_CITY_KEYS_INDEX = "feed:stories:v2:city-keys";

export function feedStoriesCacheKey(cityId?: string): string {
  return cityId ? `${FEED_STORIES_CACHE_KEY}:city:${cityId}` : FEED_STORIES_CACHE_KEY;
}
export const STORIES_LOOKBACK_CONFIG_KEY = "STORIES_LOOKBACK_HOURS";
export const STORIES_LOOKBACK_HOURS_DEFAULT = 72;

const STORIES_CACHE_TTL_SECONDS = 300; // 5 min
const STORIES_MAX_GROUPS = 50;
const STORIES_MAX_ITEMS_PER_MASTER = 10;

export type StoriesGroupItem = {
  // Rule 12 (RULE-12-REMAINDER): opaque token, NOT the raw portfolio CUID.
  // Used client-side only (localStorage view-tracking + React key).
  id: string;
  mediaUrl: string;
  createdAt: string; // ISO
  /**
   * STUDIO-PORTFOLIO-FEED: подпись на фото. `performerName` — мастер студии,
   * выполнивший работу (только у историй студии; у мастера исполнитель — автор
   * группы). `serviceTitle` — первая привязанная услуга.
   */
  performerName: string | null;
  serviceTitle: string | null;
};

export type StoriesGroup = {
  // Rule 12: opaque group token, NOT the raw provider CUID. Client uses it for
  // React keys + group dedup only; profile links go via `username` (/u/<...>).
  masterId: string;
  providerName: string;
  providerType: ProviderType;
  username: string | null;
  avatarUrl: string | null;
  items: StoriesGroupItem[];
};

export type StoriesPayload = {
  groups: StoriesGroup[];
  cachedAt: string;
};

async function resolveLookbackHours(): Promise<number> {
  try {
    const setting = await prisma.systemConfig.findUnique({
      where: { key: STORIES_LOOKBACK_CONFIG_KEY },
      select: { value: true },
    });
    const raw = setting?.value;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw <= 24 * 30) {
      return Math.floor(raw);
    }
  } catch (err) {
    logError("stories: failed to read STORIES_LOOKBACK_HOURS", { error: String(err) });
  }
  return STORIES_LOOKBACK_HOURS_DEFAULT;
}

async function fetchStoriesFromDb(cityId?: string): Promise<StoriesPayload> {
  const lookbackHours = await resolveLookbackHours();
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const recentItems = await prisma.portfolioItem.findMany({
    where: {
      isPublic: true,
      createdAt: { gte: since },
      master: {
        AND: [
          catalogVisibleProviderWhere(),
          { autoPublishStoriesEnabled: true },
          // MOBILE-B1: истории города; без него — все города, как было.
          ...(cityId ? [{ cityId }] : []),
        ],
      },
    },
    select: {
      id: true,
      mediaUrl: true,
      createdAt: true,
      masterId: true,
      master: {
        select: {
          name: true,
          type: true,
          publicUsername: true,
          avatarUrl: true,
        },
      },
      performer: { select: { name: true } },
      services: {
        select: { service: { select: { name: true, title: true } } },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    orderBy: [{ masterId: "asc" }, { createdAt: "desc" }],
  });

  const byMaster = new Map<string, StoriesGroup>();
  for (const item of recentItems) {
    let group = byMaster.get(item.masterId);
    if (!group) {
      if (byMaster.size >= STORIES_MAX_GROUPS) continue;
      group = {
        masterId: encodePublicId(item.masterId),
        providerName: item.master.name,
        providerType: item.master.type,
        username: item.master.publicUsername,
        avatarUrl: item.master.avatarUrl,
        items: [],
      };
      byMaster.set(item.masterId, group);
    }
    if (group.items.length >= STORIES_MAX_ITEMS_PER_MASTER) continue;
    const service = item.services[0]?.service;
    group.items.push({
      id: encodePublicId(item.id),
      mediaUrl: item.mediaUrl,
      createdAt: item.createdAt.toISOString(),
      performerName: item.performer?.name ?? null,
      serviceTitle: service ? service.title?.trim() || service.name : null,
    });
  }

  const groups = Array.from(byMaster.values()).sort((a, b) => {
    const aLatest = a.items[0]?.createdAt ?? "";
    const bLatest = b.items[0]?.createdAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return { groups, cachedAt: new Date().toISOString() };
}

export async function getActiveStoriesGroups(options: { cityId?: string } = {}): Promise<StoriesPayload> {
  const { cityId } = options;
  const cacheKey = feedStoriesCacheKey(cityId);
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const cached = await withRedisCommandTimeout(
        "feed:stories:get",
        redis.get(cacheKey),
      );
      if (cached) {
        const parsed = JSON.parse(cached) as StoriesPayload;
        if (parsed && Array.isArray(parsed.groups) && typeof parsed.cachedAt === "string") {
          return parsed;
        }
      }
    }

    const fresh = await fetchStoriesFromDb(cityId);

    if (redis) {
      await withRedisCommandTimeout(
        "feed:stories:set",
        redis.set(cacheKey, JSON.stringify(fresh), {
          EX: STORIES_CACHE_TTL_SECONDS,
        }),
      ).catch((err: unknown) => {
        logError("Failed to cache stories", { error: String(err) });
      });
      if (cityId) {
        // Указатель живёт не меньше самого свежего из своих ключей: срок
        // продлевается на каждом добавлении (как `sAdd` в `cache/redisClient`).
        await Promise.all([
          withRedisCommandTimeout("feed:stories:index-add", redis.sAdd(FEED_STORIES_CITY_KEYS_INDEX, cacheKey)),
          withRedisCommandTimeout(
            "feed:stories:index-expire",
            redis.expire(FEED_STORIES_CITY_KEYS_INDEX, STORIES_CACHE_TTL_SECONDS),
          ),
        ]).catch((err: unknown) => {
          logError("Failed to index city stories cache", { error: String(err) });
        });
      }
    }

    return fresh;
  } catch (err) {
    logError("getActiveStoriesGroups failed, falling back to DB", { error: String(err) });
    return fetchStoriesFromDb(cityId);
  }
}

export async function invalidateStoriesCache(): Promise<void> {
  try {
    const redis = await getRedisConnection();
    if (!redis) return;
    await withRedisCommandTimeout("feed:stories:del", redis.del(FEED_STORIES_CACHE_KEY));
    // MOBILE-B1: и истории городов — по указателю.
    const cityKeys = await withRedisCommandTimeout(
      "feed:stories:index-members",
      redis.sMembers(FEED_STORIES_CITY_KEYS_INDEX),
    );
    if (Array.isArray(cityKeys) && cityKeys.length > 0) {
      await withRedisCommandTimeout(
        "feed:stories:del-cities",
        redis.del([...cityKeys, FEED_STORIES_CITY_KEYS_INDEX]),
      );
    }
  } catch (err) {
    logError("invalidateStoriesCache failed", { error: String(err) });
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Stories V1 fully removed across LEGACY-CLEANUP-EXEC-B/C (2026-05-23):
 * `listStoriesMasters` fn, `/api/home/{stories,feed}` routes, the
 * `<PortfolioStoriesBar>` + `<StoryViewer>` UI, and the `StoryMaster` /
 * `StoryPhoto` types are all gone. Live stories run through
 * `getActiveStoriesGroups` (V2, above) via `/api/feed/stories`.
 * ────────────────────────────────────────────────────────────────────────── */

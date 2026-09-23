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

export const FEED_STORIES_CACHE_KEY = "feed:stories:v1";
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

async function fetchStoriesFromDb(): Promise<StoriesPayload> {
  const lookbackHours = await resolveLookbackHours();
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  const recentItems = await prisma.portfolioItem.findMany({
    where: {
      isPublic: true,
      createdAt: { gte: since },
      master: {
        AND: [catalogVisibleProviderWhere(), { autoPublishStoriesEnabled: true }],
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
    group.items.push({
      id: encodePublicId(item.id),
      mediaUrl: item.mediaUrl,
      createdAt: item.createdAt.toISOString(),
    });
  }

  const groups = Array.from(byMaster.values()).sort((a, b) => {
    const aLatest = a.items[0]?.createdAt ?? "";
    const bLatest = b.items[0]?.createdAt ?? "";
    return bLatest.localeCompare(aLatest);
  });

  return { groups, cachedAt: new Date().toISOString() };
}

export async function getActiveStoriesGroups(): Promise<StoriesPayload> {
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const cached = await withRedisCommandTimeout(
        "feed:stories:get",
        redis.get(FEED_STORIES_CACHE_KEY),
      );
      if (cached) {
        const parsed = JSON.parse(cached) as StoriesPayload;
        if (parsed && Array.isArray(parsed.groups) && typeof parsed.cachedAt === "string") {
          return parsed;
        }
      }
    }

    const fresh = await fetchStoriesFromDb();

    if (redis) {
      await withRedisCommandTimeout(
        "feed:stories:set",
        redis.set(FEED_STORIES_CACHE_KEY, JSON.stringify(fresh), {
          EX: STORIES_CACHE_TTL_SECONDS,
        }),
      ).catch((err: unknown) => {
        logError("Failed to cache stories", { error: String(err) });
      });
    }

    return fresh;
  } catch (err) {
    logError("getActiveStoriesGroups failed, falling back to DB", { error: String(err) });
    return fetchStoriesFromDb();
  }
}

export async function invalidateStoriesCache(): Promise<void> {
  try {
    const redis = await getRedisConnection();
    if (!redis) return;
    await withRedisCommandTimeout("feed:stories:del", redis.del(FEED_STORIES_CACHE_KEY));
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

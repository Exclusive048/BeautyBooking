import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { tooManyRequests } from "@/lib/api/response";
import { getRequestId, logError } from "@/lib/logging/logger";
import { listPortfolioFeed } from "@/lib/feed/portfolio.service";
import { portfolioFeedQuerySchema } from "@/lib/feed/schemas";
import { parseQuery } from "@/lib/validation";
import { getSessionUser } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { getClientIp } from "@/lib/http/ip";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";

export const runtime = "nodejs";

const FEED_PORTFOLIO_CACHE_TTL_SECONDS = 60;

function feedPortfolioCacheKey(cursor: string | undefined, limit: number): string {
  return `feed:portfolio:cursor=${cursor ?? "first"}:limit=${limit}`;
}

export async function GET(req: Request) {
  try {
    const rateLimit = await checkRateLimit(
      `rl:/api/feed/portfolio:ip:${getClientIp(req)}`,
      RATE_LIMITS.feedPortfolio,
    );
    if (rateLimit.limited) {
      return tooManyRequests(rateLimit.retryAfterSeconds);
    }

    const query = parseQuery(new URL(req.url), portfolioFeedQuerySchema);
    const user = await getSessionUser();

    // Cache only the unfiltered, anonymous hot path. Filtered queries (q,
    // category, tag, near, masterId) and per-user state (favorites in `items`)
    // would explode the keyspace and serve stale per-user data.
    const isCacheable =
      !user?.id &&
      !query.q &&
      !query.categoryId &&
      !query.category &&
      !query.tag &&
      !query.near &&
      !query.masterId;

    if (isCacheable) {
      const cacheKey = feedPortfolioCacheKey(query.cursor, query.limit);
      try {
        const redis = await getRedisConnection();
        if (redis) {
          const raw = await withRedisCommandTimeout(
            "feed:portfolio:get",
            redis.get(cacheKey),
          );
          if (raw) {
            return jsonOk(JSON.parse(raw));
          }
        }
        const data = await listPortfolioFeed({
          limit: query.limit,
          cursor: query.cursor,
          currentUserId: undefined,
        });
        if (redis) {
          await withRedisCommandTimeout(
            "feed:portfolio:set",
            redis.set(cacheKey, JSON.stringify(data), {
              EX: FEED_PORTFOLIO_CACHE_TTL_SECONDS,
            }),
          ).catch((err: unknown) => {
            logError("Failed to cache feed:portfolio", { error: String(err) });
          });
        }
        return jsonOk(data);
      } catch (cacheErr) {
        // Cache failure → fall through to direct DB read (fail-open).
        logError("feed:portfolio cache path failed; falling back to DB", {
          error: String(cacheErr),
        });
      }
    }

    const data = await listPortfolioFeed({
      limit: query.limit,
      cursor: query.cursor,
      q: query.q,
      categoryId: query.categoryId ?? query.category,
      tag: query.tag,
      near: query.near,
      masterId: query.masterId,
      currentUserId: user?.id,
    });
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/feed/portfolio failed", {
        requestId: getRequestId(req),
        route: "GET /api/feed/portfolio",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

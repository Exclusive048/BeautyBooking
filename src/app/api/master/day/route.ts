import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import { getMasterDay } from "@/lib/master/day.service";
import { masterDayQuerySchema } from "@/lib/master/schemas";
import { parseQuery } from "@/lib/validation";

export const runtime = "nodejs";

type CachedMasterDay = {
  expiresAt: number;
  data: Awaited<ReturnType<typeof getMasterDay>>;
};

const MASTER_DAY_CACHE_TTL_MS = 5_000;
const MASTER_DAY_CACHE_MAX = 200;
const masterDayCache = new Map<string, CachedMasterDay>();

function getCacheKey(masterId: string, date: string): string {
  return `${masterId}:${date}`;
}

function readCachedMasterDay(masterId: string, date: string): Awaited<ReturnType<typeof getMasterDay>> | null {
  const key = getCacheKey(masterId, date);
  const cached = masterDayCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    masterDayCache.delete(key);
    return null;
  }
  return cached.data;
}

function writeCachedMasterDay(masterId: string, date: string, data: Awaited<ReturnType<typeof getMasterDay>>): void {
  if (masterDayCache.size >= MASTER_DAY_CACHE_MAX) {
    const firstKey = masterDayCache.keys().next().value;
    if (firstKey) {
      masterDayCache.delete(firstKey);
    }
  }
  masterDayCache.set(getCacheKey(masterId, date), {
    data,
    expiresAt: Date.now() + MASTER_DAY_CACHE_TTL_MS,
  });
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");
    const query = parseQuery(new URL(req.url), masterDayQuerySchema);
    const masterId = await getCurrentMasterProviderId(user.id);
    const cached = readCachedMasterDay(masterId, query.date);
    if (cached) {
      return jsonOk(cached);
    }

    const data = await getMasterDay({ masterId, date: query.date });
    writeCachedMasterDay(masterId, query.date, data);
    return jsonOk(data);
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/master/day failed", {
        requestId: getRequestId(req),
        route: "GET /api/master/day",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

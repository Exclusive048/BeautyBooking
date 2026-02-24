import { ok, fail } from "@/lib/api/response";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { findWorkingDays } from "@/lib/schedule/booking-days";
import * as cache from "@/lib/cache/cache";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

const MAX_SCAN_DAYS = 60;
const CACHE_TTL_SECONDS = 120;

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
  const p = params instanceof Promise ? await params : params;
  const url = new URL(req.url);
  const fromKey = url.searchParams.get("from") ?? "";
  const limitRaw = url.searchParams.get("limit") ?? "3";
  const limit = Number.parseInt(limitRaw, 10);

  if (!isDateKey(fromKey)) {
    return fail("Invalid from", 400, "DATE_INVALID");
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 14) {
    return fail("Invalid limit", 400, "LIMIT_INVALID");
  }

  const provider = await resolveProviderBySlugOrId({
    key: p.providerId,
    select: { id: true, type: true, timezone: true },
  });
  if (!provider || provider.type !== "MASTER") {
    return fail("Master not found", 404, "MASTER_NOT_FOUND");
  }

  const scanToKeyExclusive = addDaysToDateKey(fromKey, MAX_SCAN_DAYS);
  const ctx = await createScheduleContext({
    providerId: provider.id,
    timezoneHint: provider.timezone,
    range: { fromKey, toKeyExclusive: scanToKeyExclusive },
  });
  const cacheKey = `bookingDays:${provider.id}:${fromKey}:${limit}:${provider.timezone}:${ctx.scheduleWindow.scheduleVersion}:${ctx.scheduleWindow.publishedUntilLocal}`;
  const cached = await cache.get<{ timezone: string; days: Array<{ date: string }>; nextFrom: string }>(cacheKey);
  if (cached) {
    return ok(cached);
  }

  const result = await findWorkingDays({
    fromKey,
    limit,
    maxScan: MAX_SCAN_DAYS,
    getDayPlan: async (dateKey) => ScheduleEngine.getDayPlanFromContext(ctx, dateKey),
  });

  const payload = {
    timezone: provider.timezone,
    days: result.days,
    nextFrom: result.nextFrom,
  };

  await cache.set(cacheKey, payload, CACHE_TTL_SECONDS);
  return ok(payload);
}

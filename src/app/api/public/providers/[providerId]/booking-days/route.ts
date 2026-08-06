import { ok, fail } from "@/lib/api/response";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { ScheduleEngine } from "@/lib/schedule/engine";
import { findWorkingDays } from "@/lib/schedule/booking-days";
import * as cache from "@/lib/cache/cache";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { createScheduleContext } from "@/lib/schedule/engine-context";
import { withSingleFlight } from "@/lib/cache/single-flight";
import { resolveProviderBySlugOrId } from "@/lib/providers/resolve-provider";

type BookingDaysPayload = { timezone: string; days: Array<{ date: string }>; nextFrom: string };

const MAX_SCAN_DAYS = 60;
const CACHE_TTL_SECONDS = 120;

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> | { providerId: string } }
) {
  // RES-13: без этого конверта неожиданный throw (ошибка Prisma, битая tz)
  // отдаёт дефолтную HTML-страницу 500 Next вместо `{ ok:false, error }` —
  // виджет записи разбирает JSON и получает нераспарсиваемый ответ.
  try {
    const p = params instanceof Promise ? await params : params;
    const url = new URL(req.url);
    const fromKey = url.searchParams.get("from") ?? "";
    const limitRaw = url.searchParams.get("limit") ?? "3";
    const limit = Number.parseInt(limitRaw, 10);

    if (!isDateKey(fromKey)) {
      return fail("Некорректная дата начала.", 400, "DATE_INVALID");
    }
    if (!Number.isInteger(limit) || limit <= 0 || limit > 14) {
      return fail("Некорректное значение limit.", 400, "LIMIT_INVALID");
    }

    const provider = await resolveProviderBySlugOrId({
      key: p.providerId,
      select: { id: true, type: true, timezone: true },
      requirePublished: true,
    });
    if (!provider || provider.type !== "MASTER") {
      return fail("Мастер не найден.", 404, "MASTER_NOT_FOUND");
    }

    const scanToKeyExclusive = addDaysToDateKey(fromKey, MAX_SCAN_DAYS);
    const ctx = await createScheduleContext({
      providerId: provider.id,
      timezoneHint: provider.timezone,
      range: { fromKey, toKeyExclusive: scanToKeyExclusive },
    });
    const cacheKey = `bookingDays:${provider.id}:${fromKey}:${limit}:${provider.timezone}:${ctx.scheduleWindow.scheduleVersion}:${ctx.scheduleWindow.publishedUntilLocal}`;
    const cached = await cache.get<BookingDaysPayload>(cacheKey);
    if (cached) {
      return ok(cached);
    }

    // PERF-10: без замка истечение TTL горячего мастера означает, что скан
    // рабочих дней запускают все параллельные запросы разом.
    const payload = await withSingleFlight<BookingDaysPayload>({
      lockKey: `sf:${cacheKey}`,
      read: () => cache.get<BookingDaysPayload>(cacheKey),
      compute: async () => {
        const result = await findWorkingDays({
          fromKey,
          limit,
          maxScan: MAX_SCAN_DAYS,
          getDayPlan: async (dateKey) => ScheduleEngine.getDayPlanFromContext(ctx, dateKey),
        });

        const computed: BookingDaysPayload = {
          timezone: provider.timezone,
          days: result.days,
          nextFrom: result.nextFrom,
        };
        await cache.set(cacheKey, computed, CACHE_TTL_SECONDS);
        return computed;
      },
    });

    return ok(payload);
  } catch (error) {
    const appError = toAppError(error);
    const requestId = getRequestId(req);
    if (appError.status >= 500) {
      logError("GET /api/public/providers/[providerId]/booking-days failed", {
        requestId,
        route: "GET /api/public/providers/{providerId}/booking-days",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return fail(appError.message, appError.status, appError.code);
  }
}

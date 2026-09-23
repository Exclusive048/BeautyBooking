import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { parseQuery } from "@/lib/validation";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";
import { listHotSlotServices } from "@/lib/hot-slots/service";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { diffDateKeys } from "@/lib/schedule/dateKey";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { toLocalDateKey, toLocalDateKeyExclusive } from "@/lib/schedule/timezone";
import { prisma } from "@/lib/prisma";
import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";
import { STUDIO_ACCEPTS_BOOKINGS_WHERE } from "@/lib/studio/accepts-bookings";
import { encodeCursor } from "@/lib/pagination/cursor";
import * as cache from "@/lib/cache/cache";
import { getClientIp } from "@/lib/http/ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

const hotSlotsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().trim().min(1).optional(),
  tag: z.string().trim().min(1).optional(),
  geo: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

type FeedItem = {
  id: string;
  provider: {
    id: string;
    publicUsername: string;
    name: string;
    avatarUrl: string | null;
    address: string;
    district: string;
    ratingAvg: number;
    ratingCount: number;
    timezone: string;
  };
  slot: {
    startAtUtc: string;
    endAtUtc: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    isActive: true;
  };
  service: {
    id: string;
    title: string;
    price: number;
    durationMin: number;
  } | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const runtime = "nodejs";

/**
 * SEC-15 — лента горячих слотов считается заново на КАЖДЫЙ анонимный запрос.
 *
 * Обработчик прогонял вложенный цикл «каждый провайдер со скидочным правилом ×
 * каждая подходящая услуга × до 14 дней», материализовывал весь набор, сортировал
 * его в памяти и отдавал срез. Пагинация по курсору пересчитывала ВСЁ с нуля
 * (`findIndex` по свежепосчитанному массиву). Ни auth, ни собственного лимита,
 * ни кэша — то есть дешёвый запрос покупал дорогую работу, растущую линейно с
 * числом провайдеров.
 *
 * TTL 120 с — как у соседнего `booking-days`. Для ленты последних скидок это
 * приемлемо: бронирование всё равно перепроверяет слот, а протухшая запись
 * максимум покажет уже занятое время.
 */
const FEED_CACHE_TTL_SECONDS = 120;

/**
 * Ключ кэша строится ТОЛЬКО из параметров, которые влияют на результат.
 *
 * `tag` и `geo` схема принимает, но обработчик их не использует — если положить
 * их в ключ, любой желающий сможет бесплатно промахиваться мимо кэша
 * (`?tag=<random>`), то есть фикс отменит сам себя.
 *
 * Время округляется до сетки TTL: иначе `from`, по умолчанию равный `now`,
 * давал бы новый ключ каждую миллисекунду и кэш не попадал бы никогда.
 */
function buildFeedCacheKey(from: Date, to: Date, category: string | undefined): string {
  const bucket = (date: Date) => Math.floor(date.getTime() / (FEED_CACHE_TTL_SECONDS * 1000));
  return `hot-slots:feed:v1:${bucket(from)}:${bucket(to)}:${category ?? "-"}`;
}

async function buildHotSlotFeed(from: Date, to: Date, category: string | undefined): Promise<FeedItem[]> {
  // `now` нужен ценообразованию скидки; берём его в момент расчёта ленты,
  // а не запроса — при попадании в кэш расчёта не происходит вовсе.
  const now = new Date();
  const rules = await prisma.discountRule.findMany({
    where: {
      isEnabled: true,
      provider: {
        AND: [
          // SECURITY-EXPOSURE-AUDIT-01 · Y11: only published providers belong in
          // the public hot-slots feed — an unpublished/paused master's discount
          // rules were leaking (and advertising bookable slots that 409 later).
          // VISIBILITY-DEFAULT-01: лента — поверхность, где мастера НАХОДЯТ,
          // поэтому предикат каталога (видимость + город + расписание), а не
          // один переключатель.
          catalogVisibleProviderWhere(),
          // STUDIO-HIDDEN-MASTER-SERVICES: горящие окошки мастера студии —
          // по услугам студии (`hot-slots/service.ts`), а скрытая студия
          // записей не принимает.
          { OR: [{ studioId: null }, { studio: { is: STUDIO_ACCEPTS_BOOKINGS_WHERE } }] },
          {
            type: "MASTER",
            // STUDIO-PAUSE-SPLIT-01: у мастера студии горящие окошки — по услугам
            // студии, а на паузе в студии их не забронировать (MASTER_NOT_ACTIVE).
            // У соло-мастера `studioPaused` всегда false.
            studioPaused: false,
            publicUsername: { not: null },
            ...(category ? { categories: { has: category } } : {}),
          },
        ],
      },
    },
    select: {
      providerId: true,
      isEnabled: true,
      triggerHours: true,
      discountType: true,
      discountValue: true,
      applyMode: true,
      minPriceFrom: true,
      serviceIds: true,
      provider: {
        select: {
          id: true,
          publicUsername: true,
          name: true,
          avatarUrl: true,
          address: true,
          district: true,
          ratingAvg: true,
          ratingCount: true,
          timezone: true,
        },
      },
    },
  });

  const items: FeedItem[] = [];
  const seenKeys = new Set<string>();

  for (const rule of rules) {
    if (!rule.provider.publicUsername) continue;

    const services = await listHotSlotServices(rule.providerId);
    const eligibleServices = services.filter((service) =>
      isServiceEligibleForHotRule(rule, service.id, service.price)
    );
    if (eligibleServices.length === 0) continue;

    const fromKey = toLocalDateKey(from, rule.provider.timezone);
    const toKeyExclusive = toLocalDateKeyExclusive(to, rule.provider.timezone);
    const days = Math.max(1, Math.min(14, diffDateKeys(fromKey, toKeyExclusive)));

    for (const service of eligibleServices) {
      const slotsResult = await listAvailabilitySlotsPaginated(rule.providerId, service.id, service.durationMin, {
        fromKey,
        toKeyExclusive,
        limit: days,
      });
      if (!slotsResult.ok) continue;

      for (const slot of slotsResult.data.slots) {
        const slotStartAt = toDate(slot.startAtUtc);
        const slotEndAt = toDate(slot.endAtUtc);
        if (!slotStartAt || !slotEndAt) continue;
        if (slotStartAt < from || slotStartAt >= to) continue;

        const hot = resolveDynamicHotSlotPricing({
          rule,
          slotStartAtUtc: slotStartAt,
          serviceId: service.id,
          servicePrice: service.price,
          providerTimeZone: rule.provider.timezone,
          now,
        });
        if (!hot.isHot) continue;

        // SEC-12: внутренний ключ склеен из двух CUID — он годится для
        // дедупликации внутри прогона, но наружу уходить не должен. Клиент
        // структуру не разбирает (React-key + мёртвый `?slotId=`), поэтому
        // публичный id — непрозрачный токен; он же становится курсором.
        const internalKey = `${rule.providerId}:${service.id}:${slotStartAt.toISOString()}:${slotEndAt.toISOString()}`;
        if (seenKeys.has(internalKey)) continue;
        seenKeys.add(internalKey);

        items.push({
          id: encodeCursor(internalKey),
          provider: {
            id: rule.provider.id,
            publicUsername: rule.provider.publicUsername,
            name: rule.provider.name,
            avatarUrl: rule.provider.avatarUrl,
            address: rule.provider.address,
            district: rule.provider.district,
            ratingAvg: rule.provider.ratingAvg,
            ratingCount: rule.provider.ratingCount,
            timezone: rule.provider.timezone,
          },
          slot: {
            startAtUtc: slotStartAt.toISOString(),
            endAtUtc: slotEndAt.toISOString(),
            discountType: hot.discountType ?? rule.discountType,
            discountValue: hot.discountValue ?? rule.discountValue,
            isActive: true,
          },
          service: {
            id: service.id,
            title: service.title,
            price: service.price,
            durationMin: service.durationMin,
          },
        });
      }
    }
  }

  items.sort((a, b) => {
    const timeDiff = new Date(a.slot.startAtUtc).getTime() - new Date(b.slot.startAtUtc).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.provider.ratingAvg - a.provider.ratingAvg;
  });

  return items;
}

export async function GET(req: Request) {
  try {
    const query = parseQuery(new URL(req.url), hotSlotsQuerySchema);

    // SEC-15: собственный тир. Общий publicApi (120/мин) здесь неуместен —
    // цена одного запроса на порядок выше обычного публичного чтения, а
    // варьируя `from`, можно промахиваться мимо кэша намеренно.
    const limitResult = await checkRateLimit(
      `rl:hot-slots:feed:${getClientIp(req)}`,
      RATE_LIMITS.hotSlotsFeed,
    );
    if (limitResult.limited) {
      return jsonFail(429, "Слишком много запросов. Попробуйте позже.", "RATE_LIMITED");
    }

    const now = new Date();
    const from = query.from ? new Date(query.from) : now;
    const to = query.to ? new Date(query.to) : new Date(now.getTime() + 48 * 60 * 60 * 1000);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return jsonFail(400, "Проверьте выбранный период.", "DATE_INVALID");
    }
    if (from > to) {
      return jsonFail(400, "Дата начала позже даты окончания.", "RANGE_INVALID");
    }

    const cacheKey = buildFeedCacheKey(from, to, query.category);
    let items = await cache.get<FeedItem[]>(cacheKey);
    if (!items) {
      items = await buildHotSlotFeed(from, to, query.category);
      await cache.set(cacheKey, items, FEED_CACHE_TTL_SECONDS);
    }

    let startIndex = 0;
    if (query.cursor) {
      const cursorIndex = items.findIndex((item) => item.id === query.cursor);
      startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    }

    const pageItems = items.slice(startIndex, startIndex + query.limit);
    const hasMore = startIndex + query.limit < items.length;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id ?? null : null;

    return jsonOk({ items: pageItems, nextCursor });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/hot-slots failed", {
        requestId: getRequestId(req),
        route: "GET /api/hot-slots",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const message = appError.code === "VALIDATION_ERROR" ? "Проверьте заполненные поля." : appError.message;
    return jsonFail(appError.status, message, appError.code, appError.details);
  }
}

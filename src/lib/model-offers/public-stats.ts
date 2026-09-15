import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { todayDateString } from "@/lib/model-offers/public.service";

/**
 * FOOTER-HONEST-METRICS (2026-09-15). Карточка «Для моделей» в футере несла
 * выдуманные «1 240 предложений» и «−54%». Теперь — живые числа: сколько
 * предложений моделям открыто прямо сейчас и какая у них средняя скидка.
 *
 * Предикат «открытое предложение» — дословно тот же, что у публичного списка
 * `listPublicModelOffers` (ACTIVE, дата не в прошлом, мастер опубликован),
 * иначе футер обещал бы предложения, которых на `/models` нет. Скидка
 * считается так же, как на карточке предложения (`offer-card.tsx`): от цены
 * услуги мастера (персональная цена, иначе базовая) к цене для модели;
 * предложения без скидки или без базовой цены в среднее не входят.
 *
 * Кэш — Redis на 15 минут (образец — `stats/public-stats.ts`): футер стоит на
 * каждой публичной странице, а точность «до минуты» здесь никому не нужна.
 * Отказ Redis → прямой запрос, отказ БД → `null` (футер прячет метрики, а не
 * падает: числа — украшение, не содержание).
 */
export type PublicModelOfferStats = {
  activeCount: number;
  /** Средняя скидка в процентах по предложениям со скидкой; `null`, когда таких нет. */
  averageDiscountPercent: number | null;
};

const CACHE_KEY = "public:model-offer-stats";
const CACHE_TTL_SECONDS = 900;

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchFromDb(): Promise<PublicModelOfferStats> {
  const rows = await prisma.modelOffer.findMany({
    where: {
      AND: [
        { status: "ACTIVE" },
        { dateLocal: { gte: todayDateString() } },
        { master: { isPublished: true, type: ProviderType.MASTER } },
      ],
    },
    select: {
      price: true,
      masterService: { select: { priceOverride: true, service: { select: { price: true } } } },
      service: { select: { price: true } },
    },
  });

  const discounts: number[] = [];
  for (const row of rows) {
    const price = toNumber(row.price);
    const original =
      toNumber(row.masterService?.priceOverride) ??
      toNumber(row.masterService?.service.price) ??
      toNumber(row.service?.price);
    if (price === null || original === null || original <= 0 || price >= original) continue;
    discounts.push(Math.round(((original - price) / original) * 100));
  }

  return {
    activeCount: rows.length,
    averageDiscountPercent:
      discounts.length > 0
        ? Math.round(discounts.reduce((sum, value) => sum + value, 0) / discounts.length)
        : null,
  };
}

function isStats(value: unknown): value is PublicModelOfferStats {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.activeCount === "number" &&
    (record.averageDiscountPercent === null || typeof record.averageDiscountPercent === "number")
  );
}

export async function getPublicModelOfferStats(): Promise<PublicModelOfferStats | null> {
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const raw = await withRedisCommandTimeout("public:model-offer-stats:get", redis.get(CACHE_KEY));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStats(parsed)) return parsed;
      }
    }

    const stats = await fetchFromDb();

    if (redis) {
      await withRedisCommandTimeout(
        "public:model-offer-stats:set",
        redis.set(CACHE_KEY, JSON.stringify(stats), { EX: CACHE_TTL_SECONDS }),
      ).catch((err: unknown) => {
        logError("Failed to cache public model-offer stats", { error: String(err) });
      });
    }

    return stats;
  } catch (err) {
    logError("getPublicModelOfferStats failed", { error: String(err) });
    try {
      return await fetchFromDb();
    } catch (dbErr) {
      logError("getPublicModelOfferStats DB fallback failed", { error: String(dbErr) });
      return null;
    }
  }
}

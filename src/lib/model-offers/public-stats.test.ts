import { describe, expect, it, beforeEach, vi } from "vitest";

/**
 * FOOTER-HONEST-METRICS — числа карточки «Для моделей» считаются, а не
 * пишутся руками. Скидка — как на карточке предложения (`offer-card.tsx`):
 * от цены услуги мастера (персональная, иначе базовая) к цене для модели;
 * предложения без скидки в среднее не входят.
 */
const prismaMock = vi.hoisted(() => ({ modelOffer: { findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () => null),
  withRedisCommandTimeout: vi.fn(async (_name: string, p: Promise<unknown>) => p),
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import { getPublicModelOfferStats } from "@/lib/model-offers/public-stats";

describe("getPublicModelOfferStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("считает открытые предложения и среднюю скидку только по предложениям со скидкой", async () => {
    prismaMock.modelOffer.findMany.mockResolvedValue([
      // 2000 → 1000: −50%
      { price: 1000, masterService: { priceOverride: null, service: { price: 2000 } }, service: null },
      // персональная цена 3000 → 2100: −30%
      { price: 2100, masterService: { priceOverride: 3000, service: { price: 2000 } }, service: null },
      // без скидки — в среднее не входит, в счёт входит
      { price: 2000, masterService: null, service: { price: 2000 } },
      // без цены — тоже только счёт
      { price: null, masterService: null, service: { price: 1500 } },
    ]);

    await expect(getPublicModelOfferStats()).resolves.toEqual({
      activeCount: 4,
      averageDiscountPercent: 40,
    });

    const where = prismaMock.modelOffer.findMany.mock.calls[0]?.[0]?.where;
    expect(where).toEqual({
      AND: [
        { status: "ACTIVE" },
        { dateLocal: { gte: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } },
        { master: { isPublished: true, type: "MASTER" } },
      ],
    });
  });

  it("нет скидок — averageDiscountPercent null; нет предложений — 0", async () => {
    prismaMock.modelOffer.findMany.mockResolvedValueOnce([
      { price: 2000, masterService: null, service: { price: 2000 } },
    ]);
    await expect(getPublicModelOfferStats()).resolves.toEqual({ activeCount: 1, averageDiscountPercent: null });

    prismaMock.modelOffer.findMany.mockResolvedValueOnce([]);
    await expect(getPublicModelOfferStats()).resolves.toEqual({ activeCount: 0, averageDiscountPercent: null });
  });

  it("отказ БД — null, футер прячет метрики, а не падает", async () => {
    prismaMock.modelOffer.findMany.mockRejectedValue(new Error("db down"));
    await expect(getPublicModelOfferStats()).resolves.toBeNull();
  });
});

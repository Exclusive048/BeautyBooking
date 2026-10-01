import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 30, шаг 0 (решение 30.1 — стриминг не делаем): у ИИ-сводки
 * отзывов один платный вызов на промах кэша, сколько бы зрителей ни нажали
 * кнопку одновременно. До этого у сводки не было single-flight (в отличие от
 * советника): два параллельных промаха — два вызова Яндекса и две единицы
 * потолка `review-summary` (инв. #44).
 *
 * Вызов ИИ длится секунды (граница — 15 с и один повтор), поэтому проигравший
 * обязан ждать ДОЛЬШЕ стандартных 300 мс `withSingleFlight`: иначе он не
 * дождётся победителя и позовёт ИИ сам — замок был бы, а дубля не убирал.
 *
 * @probe 2026-10-01 (по одной оси; ИИ в тесте отвечает 1,2 с):
 *   1. Генерация мимо замка (`generateSummary` до `withSingleFlight`) → красный
 *      «expected "vi.fn()" to be called 1 times, but got 3 times».
 *   2. `withSingleFlight` без `waitMs` (стандартные 300 мс) → тот же красный,
 *      3 вызова: проигравшие не дожидаются победителя. ⚠️ Пока ИИ в тесте
 *      отвечал за 400 мс, эта проба была ЗЕЛЁНОЙ — шаг опроса 250 мс
 *      перешагивал дедлайн 300 мс, и проигравший успевал. Отсюда 1,2 с.
 */

const store = vi.hoisted(() => new Map<string, unknown>());
const aiChat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  claimLock: vi.fn(async (key: string, value: string) => {
    if (store.has(key)) return { status: "held" };
    store.set(key, value);
    return { status: "acquired" };
  }),
}));
vi.mock("@/lib/ai/config", () => ({ assertAiFeaturesEnabled: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/client", () => ({ aiChat }));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      count: vi.fn(async () => 5),
      findMany: vi.fn(async () =>
        Array.from({ length: 5 }, (_, i) => ({ rating: 5, text: `Отзыв ${i}`, createdAt: new Date("2026-09-01") })),
      ),
    },
  },
}));

import { getReviewSummary } from "@/lib/ai/review-summary";

beforeEach(() => {
  store.clear();
  aiChat.mockReset();
});

describe("сводка отзывов — один вызов ИИ на промах", () => {
  it("три параллельных промаха — один вызов ИИ, у всех одна сводка", async () => {
    aiChat.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      return "Клиенты хвалят аккуратность.";
    });

    const results = await Promise.all([1, 2, 3].map(() => getReviewSummary("prov-1")));

    expect(aiChat).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.summary)).toEqual(Array(3).fill("Клиенты хвалят аккуратность."));
  });

  it("сбой ИИ не кэшируется: следующий промах зовёт ИИ снова", async () => {
    aiChat.mockResolvedValueOnce(null).mockResolvedValueOnce("Вторая попытка.");

    expect((await getReviewSummary("prov-1")).summary).toBeNull();
    expect((await getReviewSummary("prov-1")).summary).toBe("Вторая попытка.");
    expect(aiChat).toHaveBeenCalledTimes(2);
  });

  it("попадание в кэш ИИ не зовёт", async () => {
    store.set("ai:review-summary:prov-1", "Из кэша.");
    expect((await getReviewSummary("prov-1")).summary).toBe("Из кэша.");
    expect(aiChat).not.toHaveBeenCalled();
  });
});

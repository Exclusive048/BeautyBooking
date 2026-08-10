// SEC-04 by-photo (AUDIT-CAMPAIGN-02 п.7) — guard-тесты бюджета и дедупа.
// Кэш дедупа гоняется на memory-fallback'е (REDIS_URL пуст в тестовом env).
// Счётчик бюджета — через counting-fake поверх vi.mock: без Redis не-prod
// checkRateLimit БЕЗ СЧЁТА fail-open (задокументированная семантика §8), то
// есть настоящий счёт в тестовом env недостижим; зона ответственности ЭТОГО
// модуля — ключ (UTC-дата), конфиг (окно/потолок) и маппинг limited, их fake
// и проверяет; счёт самого лимитера покрыт его собственными тестами.
// Тесты доказаны невакуумными пробой (сломанный модуль → красный; лог пробы
// в ledger кампании).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => {
  const counters = new Map<string, number>();
  return {
    checkRateLimit: vi.fn(async (key: string, config: { maxRequests: number }) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next > config.maxRequests
        ? { limited: true, retryAfterSeconds: 60 }
        : { limited: false };
    }),
  };
});
import {
  VISUAL_SEARCH_DAILY_BUDGET,
  byPhotoImageHash,
  getCachedByPhotoResult,
  secondsToUtcMidnight,
  setCachedByPhotoResult,
  takeVisualSearchDailyBudget,
  visualSearchBudgetKey,
} from "@/lib/visual-search/by-photo-guards";
import type { VisualSearchHttpResponse } from "@/lib/visual-search/contracts";

describe("visualSearchBudgetKey", () => {
  it("несёт UTC-дату — новый день означает новый счётчик", () => {
    const key = visualSearchBudgetKey(new Date("2026-08-10T23:59:59Z"));
    expect(key).toBe("rl:visual-search:budget:global:2026-08-10");
    const nextDay = visualSearchBudgetKey(new Date("2026-08-11T00:00:01Z"));
    expect(nextDay).toBe("rl:visual-search:budget:global:2026-08-11");
    expect(nextDay).not.toBe(key);
  });

  it("дефолтный бюджет — осмысленно положительный", () => {
    expect(VISUAL_SEARCH_DAILY_BUDGET).toBeGreaterThan(0);
  });
});

describe("takeVisualSearchDailyBudget", () => {
  it("пропускает до потолка и отсекает сверх него", async () => {
    // Собственная дата → собственный ключ памяти, изоляция от соседних тестов.
    const now = new Date("2031-01-15T10:00:00Z");
    const budget = 2;
    expect((await takeVisualSearchDailyBudget(now, budget)).limited).toBe(false);
    expect((await takeVisualSearchDailyBudget(now, budget)).limited).toBe(false);
    expect((await takeVisualSearchDailyBudget(now, budget)).limited).toBe(true);
    expect((await takeVisualSearchDailyBudget(now, budget)).limited).toBe(true);
  });

  it("новая дата — свежий бюджет", async () => {
    const day1 = new Date("2031-02-01T12:00:00Z");
    const day2 = new Date("2031-02-02T12:00:00Z");
    expect((await takeVisualSearchDailyBudget(day1, 1)).limited).toBe(false);
    expect((await takeVisualSearchDailyBudget(day1, 1)).limited).toBe(true);
    expect((await takeVisualSearchDailyBudget(day2, 1)).limited).toBe(false);
  });
});

describe("secondsToUtcMidnight", () => {
  it("считает до конца UTC-суток и не отдаёт ноль", () => {
    expect(secondsToUtcMidnight(new Date("2026-08-10T23:59:30Z"))).toBe(30);
    expect(secondsToUtcMidnight(new Date("2026-08-10T00:00:00Z"))).toBe(24 * 60 * 60);
    expect(secondsToUtcMidnight(new Date("2026-08-10T23:59:59.900Z"))).toBeGreaterThanOrEqual(1);
  });
});

describe("дедуп по хешу изображения", () => {
  it("хеш стабилен для тех же байтов и различен для разных", () => {
    const a = byPhotoImageHash(new Uint8Array([1, 2, 3]));
    const b = byPhotoImageHash(new Uint8Array([1, 2, 3]));
    const c = byPhotoImageHash(new Uint8Array([1, 2, 4]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("set → get возвращает сохранённый ответ; незнакомый хеш — null", async () => {
    const hash = byPhotoImageHash(new Uint8Array([9, 9, 9]));
    const stored: VisualSearchHttpResponse = {
      ok: false,
      reason: "unrecognized",
      message: "проба",
    } as VisualSearchHttpResponse;
    await setCachedByPhotoResult(hash, stored);
    const roundTrip = await getCachedByPhotoResult(hash);
    expect(roundTrip).toEqual(stored);
    expect(await getCachedByPhotoResult(byPhotoImageHash(new Uint8Array([7])))).toBeNull();
  });
});

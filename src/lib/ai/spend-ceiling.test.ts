// FIX-B16 — поведенческие тесты денежного потолка.
//
// ЧТО именно проверяется и почему такой формой:
//
// Прежний потолок (Redis) прошёл бы «пропускает N, режет N+1» на ура — он
// действительно так делал в пределах одного живого процесса с живым Redis.
// Отличает настоящий потолок от прежнего не это, а ДВА свойства, поэтому они
// идут первыми: он держится через рестарт процесса и держится без Redis.
//
// Хранилище здесь — фейковая «таблица» в замыкании мока `prisma`, которая
// переживает `vi.resetModules()`. Это и есть модель durable-хранилища: модуль
// пересоздаётся с нуля, данные остаются. Прежний механизм на такой модели
// падает по построению — его счётчик жил в памяти модуля.
//
// @probe (GUARD-INTEGRITY): каждый тест ниже прогонялся на намеренно сломанном
// входе; наблюдавшийся текст падения — в отчёте FIX-B16 § Пробы.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Durable-хранилище живёт ВНЕ модуля: `vi.resetModules()` его не трогает —
// ровно как Postgres не трогает рестарт процесса.
const store = vi.hoisted(() => new Map<string, number>());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("");
      if (!sql.includes("AiSpendCounter")) throw new Error(`unexpected SQL: ${sql}`);
      const [meter, dayKey] = values as [string, string];
      const key = `${meter}|${dayKey}`;
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return [{ count: next }];
    }),
  },
}));

import {
  AI_SPEND_CEILINGS,
  AiSpendCeilingError,
  takeAiSpendBudget,
  secondsToUtcMidnight,
  utcDayKey,
} from "@/lib/ai/spend-ceiling";

const DAY = new Date("2031-03-05T10:00:00Z");

beforeEach(() => {
  store.clear();
  vi.unstubAllEnvs();
});

/** Доводит счётчик метра до потолка, не проверяя исходы. */
async function exhaust(meter: keyof typeof AI_SPEND_CEILINGS, now: Date): Promise<void> {
  store.set(`${meter}|${utcDayKey(now)}`, AI_SPEND_CEILINGS[meter]);
}

describe("потолок переживает РЕСТАРТ процесса", () => {
  it("после полной пересборки модуля исчерпанный бюджет остаётся исчерпанным", async () => {
    await exhaust("review-summary", DAY);
    await expect(takeAiSpendBudget("review-summary", DAY)).rejects.toBeInstanceOf(
      AiSpendCeilingError,
    );

    // Рестарт: весь граф модулей выбрасывается и импортируется заново, то есть
    // любое состояние в памяти модуля исчезает. Хранилище — нет.
    vi.resetModules();
    const fresh = await import("@/lib/ai/spend-ceiling");

    await expect(fresh.takeAiSpendBudget("review-summary", DAY)).rejects.toBeInstanceOf(
      fresh.AiSpendCeilingError,
    );
  });

  it("контроль машинерии: рестарт НЕ является универсальным отказом — свежий метр проходит", async () => {
    // Без этой половины предыдущий тест зеленел бы и на «после resetModules
    // всегда бросаем», то есть не отличал бы потолок от поломки.
    await exhaust("review-summary", DAY);
    vi.resetModules();
    const fresh = await import("@/lib/ai/spend-ceiling");

    await expect(fresh.takeAiSpendBudget("review-reply", DAY)).resolves.toBeUndefined();
  });
});

describe("потолок держится при недоступном Redis", () => {
  it("отказ не зависит от кэша — счётчик Redis не касается вовсе", async () => {
    // Redis «сломан» настолько, насколько это вообще выразимо: любой доступ к
    // модулям кэша/лимитера из этого пути кинул бы. Если потолок продолжает
    // работать, значит он на них не опирается.
    vi.doMock("@/lib/cache/cache", () => {
      throw new Error("Redis unavailable");
    });
    vi.doMock("@/lib/rate-limit", () => {
      throw new Error("Redis unavailable");
    });
    vi.resetModules();
    const fresh = await import("@/lib/ai/spend-ceiling");

    store.set(`review-reply|${utcDayKey(DAY)}`, AI_SPEND_CEILINGS["review-reply"]);
    await expect(fresh.takeAiSpendBudget("review-reply", DAY)).rejects.toBeInstanceOf(
      fresh.AiSpendCeilingError,
    );

    vi.doUnmock("@/lib/cache/cache");
    vi.doUnmock("@/lib/rate-limit");
    vi.resetModules();
  });
});

describe("счёт и границы", () => {
  it("пропускает ровно до потолка и режет следующий", async () => {
    const meter = "advisor-advice" as const;
    store.set(`${meter}|${utcDayKey(DAY)}`, AI_SPEND_CEILINGS[meter] - 1);

    await expect(takeAiSpendBudget(meter, DAY)).resolves.toBeUndefined();
    await expect(takeAiSpendBudget(meter, DAY)).rejects.toBeInstanceOf(AiSpendCeilingError);
  });

  it("новые UTC-сутки — свежий бюджет", async () => {
    const meter = "service-description" as const;
    const day1 = new Date("2031-04-01T23:59:00Z");
    const day2 = new Date("2031-04-02T00:01:00Z");
    await exhaust(meter, day1);

    await expect(takeAiSpendBudget(meter, day1)).rejects.toBeInstanceOf(AiSpendCeilingError);
    await expect(takeAiSpendBudget(meter, day2)).resolves.toBeUndefined();
  });

  it("метры не делят бюджет — исчерпание одного не гасит другой", async () => {
    await exhaust("review-summary", DAY);
    await expect(takeAiSpendBudget("review-summary", DAY)).rejects.toBeInstanceOf(
      AiSpendCeilingError,
    );
    await expect(takeAiSpendBudget("visual-search:search", DAY)).resolves.toBeUndefined();
  });
});

describe("форма отказа", () => {
  it("несёт курируемую строку, код и Retry-After до конца UTC-суток", async () => {
    await exhaust("review-reply", DAY);
    const error = await takeAiSpendBudget("review-reply", DAY).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiSpendCeilingError);
    const ceiling = error as AiSpendCeilingError;
    expect(ceiling.status).toBe(429);
    expect(ceiling.code).toBe("AI_DAILY_LIMIT_REACHED");
    // Русская курируемая строка, а не машинный код (FIX-B14: машинный код в
    // поле, где клиент ждёт текст, показывает пользователю пустую ошибку).
    expect(ceiling.message).toMatch(/[А-Яа-я]/);
    expect(ceiling.message).not.toMatch(/AI_DAILY_LIMIT_REACHED/);
    expect(ceiling.retryAfterSeconds).toBe(secondsToUtcMidnight(DAY));
    expect(ceiling.meter).toBe("review-reply");
  });

  it("недоступный счётчик = ОТКАЗ, а не молчаливый пропуск (fail-closed)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error("connection refused"));

    const error = await takeAiSpendBudget("review-summary", DAY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as { status?: number }).status).toBe(503);
    expect((error as { message: string }).message).toMatch(/[А-Яа-я]/);
  });
});

describe("secondsToUtcMidnight", () => {
  it("считает до конца UTC-суток и не отдаёт ноль", () => {
    expect(secondsToUtcMidnight(new Date("2026-08-10T23:59:30Z"))).toBe(30);
    expect(secondsToUtcMidnight(new Date("2026-08-10T00:00:00Z"))).toBe(24 * 60 * 60);
    expect(secondsToUtcMidnight(new Date("2026-08-10T23:59:59.900Z"))).toBeGreaterThanOrEqual(1);
  });
});

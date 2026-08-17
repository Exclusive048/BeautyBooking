// SEC-04 (AUDIT-CAMPAIGN-02 п.7) — ПИН ратифицированного решения о деградации
// ЧАСТОТНОГО лимита визуального поиска.
//
// ## Зачем пин именно сейчас
//
// FIX-B16 разделил два контроля: денежный потолок стал durable и fail-closed,
// частотный лимит остался деградирующим. Такое соседство — приглашение
// «доужесточить заодно и второй»: правка на две строки, дифф выглядит
// последовательным, и никто не вспомнит, что обратное решение ратифицировано
// владельцем с конкретным обоснованием — fail-closed здесь глушит анонимную
// фичу целиком из-за моргнувшего Redis, а цена отказа частотного слоя измеряется
// лишними запросами, а не деньгами.
//
// Пин проверяет ПОВЕДЕНИЕ (что происходит при недоступном Redis), а не форму
// кода: «нет ли префикса в списке» зеленело бы на любой другой реализации
// fail-closed, а их в проекте ТРИ (§10 снапшота).
//
// @probe (GUARD-INTEGRITY): внесение `rl:visual-search:by-photo:` в
// `SENSITIVE_KEY_PREFIXES` роняет первый тест; наблюдавшийся текст падения — в
// отчёте FIX-B16 § Пробы.

import { describe, expect, it } from "vitest";
import { checkRateLimit, isSensitiveRouteKey } from "@/lib/rate-limit";

const BY_PHOTO_KEY = "rl:visual-search:by-photo:203.0.113.7";
const BY_PHOTO_PROXY_KEY = "rl:publicApi:203.0.113.7:POST:/api/search/by-photo";

describe("SEC-04 — частотный лимит by-photo деградирует, а не закрывается", () => {
  it("при недоступном Redis запрос ПРОХОДИТ (fail-open в не-prod, memory-fallback в prod)", async () => {
    // Тестовое окружение = REDIS_URL пуст, то есть это и есть «Redis недоступен».
    const result = await checkRateLimit(BY_PHOTO_KEY, {
      windowSeconds: 60,
      maxRequests: 3,
    });

    expect(
      result.limited,
      "Частотный лимит by-photo стал fail-closed. Это ратифицированное обратное " +
        "решение владельца (SEC-04): анонимная фича не должна умирать из-за " +
        "моргнувшего Redis. Денежный потолок — отдельный механизм, он durable " +
        "и живёт в lib/ai/spend-ceiling.ts; ужесточать частотный слой «заодно» не надо.",
    ).toBe(false);
  });

  it("ни ключ лимитера, ни путь роута не числятся чувствительными", () => {
    expect(isSensitiveRouteKey(BY_PHOTO_KEY)).toBe(false);
    expect(isSensitiveRouteKey(BY_PHOTO_PROXY_KEY)).toBe(false);
  });

  it("контроль машинерии: тот же предикат ПРИЗНАЁТ заведомо чувствительный ключ", () => {
    // Иначе оба утверждения выше зеленели бы на предикате, который всегда false.
    expect(isSensitiveRouteKey("rl:publicApi:203.0.113.7:POST:/api/bookings")).toBe(true);
    expect(isSensitiveRouteKey("rate:createBooking:user-1")).toBe(true);
  });
});

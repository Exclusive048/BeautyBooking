import { describe, expect, it, vi } from "vitest";

/**
 * FIX-B15 — ключ вебхука Telegram классифицирован как чувствительный **сегодня**,
 * пока сам роут недостижим.
 *
 * ## Предмет
 *
 * Telegram включается в ДЕПЛОЕ (с ENV-SPLIT-01 — наличием
 * `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`), где ни один гейт не работает. До FIX-B15
 * включение делало вебхук живым И fail-open одним движением: рейт-лимит роута не
 * был в чувствительном множестве, то есть при обрыве Redis анонимный публичный
 * эндпоинт, пишущий `TelegramLinkToken`, деградировал бы до per-process памяти.
 * Заметить это было бы некому — дифф пустой, тесты зелёные.
 *
 * С 29.09 доработки · 15 регистрация — точный шаблон `/api/telegram/webhook` в
 * `SENSITIVE_ROUTE_TEMPLATES` (прежде — префикс ключа `rate:telegramWebhook:`).
 *
 * ## Почему тест НЕ мокает флаг
 *
 * Это и есть содержание проверки: политика обязана быть верной независимо от
 * значения флага, потому что менять её будет некому в тот момент, когда флаг
 * поменяют.
 *
 * ## Почему ключ не написан строкой
 *
 * Литерал проверял бы совпадение строки с самой собой. Ключ ДОБЫВАЕТСЯ из
 * настоящего лимитера роута: `checkRateLimit` подменён, вызов перехвачен, и в
 * `isSensitiveRouteKey` уходит то, что модуль реально построил.
 *
 * @probe 2026-09-29 — из `SENSITIVE_ROUTE_TEMPLATES` убран `/api/telegram/webhook`:
 *        красный «ключ вебхука … классифицирован как НЕ чувствительный» с
 *        именем ключа. Возвращено — зелёный.
 */

const captured = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async (key: string) => {
      captured.keys.push(key);
      return { limited: false };
    }),
  };
});

import { isSensitiveRouteKey } from "@/lib/rate-limit";
import { routeRateLimitKey } from "@/lib/rate-limit/keys";
import { checkTelegramWebhookRateLimit } from "@/lib/telegram/webhookRateLimit";

describe("FIX-B15 · вебхук Telegram fail-closed ДО включения Telegram", () => {
  it("ключ, который строит сам лимитер, признан чувствительным", async () => {
    captured.keys.length = 0;
    await checkTelegramWebhookRateLimit(
      new Request("http://x/api/telegram/webhook", { method: "POST" }),
      "203.0.113.7",
    );

    expect(captured.keys, "лимитер не вызвал checkRateLimit — проверять нечего").toHaveLength(1);
    const key = captured.keys[0]!;
    expect(
      isSensitiveRouteKey(key),
      `ключ вебхука «${key}» классифицирован как НЕ чувствительный. ` +
        "Включение Telegram сделает роут живым и fail-open одним движением — " +
        "шаблон обязан стоять в SENSITIVE_ROUTE_TEMPLATES заранее (lib/rate-limit/index.ts).",
    ).toBe(true);
  });

  it("классификация по шаблону, а не «всё подряд»: соседние пути Telegram — не чувствительны", () => {
    // Контроль механизма: иначе `isSensitiveRouteKey` мог бы возвращать true на
    // всё, и первый тест ничего бы не значил.
    expect(isSensitiveRouteKey(routeRateLimitKey(new Request("http://x/api/telegram/status"), "ip", "203.0.113.7"))).toBe(false);
    expect(isSensitiveRouteKey("rl:publicApi:1.1.1.1:GET:/api/catalog/search")).toBe(false);
  });
});

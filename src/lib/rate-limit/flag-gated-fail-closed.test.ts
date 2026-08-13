import { describe, expect, it, vi } from "vitest";

/**
 * FIX-B15 — ключ вебхука Telegram классифицирован как чувствительный **сегодня**,
 * пока сам роут недостижим.
 *
 * ## Предмет
 *
 * `NEXT_PUBLIC_TELEGRAM_ENABLED` снимается в ДЕПЛОЕ, где ни один гейт не
 * работает. До FIX-B15 флип делал вебхук живым И fail-open одним движением:
 * рейт-лимит роута не был в чувствительном множестве, то есть при обрыве Redis
 * анонимный публичный эндпоинт, пишущий `TelegramLinkToken`, деградировал бы до
 * per-process памяти. Заметить это было бы некому — дифф пустой, тесты зелёные.
 *
 * ## Почему тест НЕ мокает флаг
 *
 * Это и есть содержание проверки: политика обязана быть верной независимо от
 * значения флага, потому что менять её будет некому в тот момент, когда флаг
 * поменяют. Тест, поставленный «при включённом Telegram», проверял бы будущее
 * состояние и молчал бы про сегодняшнее — то есть ровно про то, что защищает.
 *
 * ## Почему ключ не написан строкой
 *
 * Литерал `"rate:telegramWebhook:1.2.3.4"` проверял бы совпадение строки с
 * самой собой. Ключ ДОБЫВАЕТСЯ из настоящего лимитера роута: `checkRateLimit`
 * подменён, вызов перехвачен, и в `isSensitiveRouteKey` уходит то, что модуль
 * реально построил. Переименование ключа (`rate:tgWebhook:`) немедленно
 * краснеет — а именно так регистрация и протухла бы незаметно.
 */

const captured = vi.hoisted(() => ({ keys: [] as string[] }));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async (key: string) => {
      captured.keys.push(key);
      return true;
    }),
  };
});

import { isSensitiveRouteKey } from "@/lib/rate-limit";
import { checkTelegramWebhookRateLimit } from "@/lib/telegram/webhookRateLimit";

describe("FIX-B15 · вебхук Telegram fail-closed ДО снятия килсвитча", () => {
  it("ключ, который строит сам лимитер, признан чувствительным", async () => {
    captured.keys.length = 0;
    await checkTelegramWebhookRateLimit("203.0.113.7");

    expect(captured.keys, "лимитер не вызвал checkRateLimit — проверять нечего").toHaveLength(1);
    const key = captured.keys[0]!;
    expect(
      isSensitiveRouteKey(key),
      `ключ вебхука «${key}» классифицирован как НЕ чувствительный. ` +
        "Флип NEXT_PUBLIC_TELEGRAM_ENABLED сделает роут живым и fail-open одним движением — " +
        "префикс обязан стоять в SENSITIVE_KEY_PREFIXES заранее (lib/rate-limit/index.ts).",
    ).toBe(true);
  });

  it("классификация не зависит от флага: в этом файле он вообще не подменён", async () => {
    // Контроль механизма, а не совпадения: соседний ключ того же модуля-формы
    // чувствительным быть НЕ должен, иначе `isSensitiveRouteKey` просто
    // возвращает true на всё и первый тест ничего не значит.
    expect(isSensitiveRouteKey("rate:telegramSomethingElse:203.0.113.7")).toBe(false);
    expect(isSensitiveRouteKey("rl:publicApi:1.1.1.1:GET:/api/catalog/search")).toBe(false);
  });
});

/**
 * @probe   что сломать: убрать `"rate:telegramWebhook:"` из
 *          `SENSITIVE_KEY_PREFIXES` (`lib/rate-limit/index.ts`).
 *          наблюдалось: «ключ вебхука «rate:telegramWebhook:203.0.113.7»
 *          классифицирован как НЕ чувствительный… префикс обязан стоять в
 *          SENSITIVE_KEY_PREFIXES заранее» — красный, с именем ключа.
 *
 * @probe   что сломать: переименовать ключ в `webhookRateLimit.ts` в
 *          `rate:tgWebhook:${ip}` (регистрация при этом остаётся).
 *          наблюдалось: тот же тест красный с «rate:tgWebhook:203.0.113.7» —
 *          то есть протухшая регистрация ловится, а не выглядит покрытием.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { installHangingFetch } from "@/lib/testing/hanging-fetch";

/**
 * RES-23 — поведенческая половина сторожа дедлайна алертов.
 *
 * Соседний `alert.test.ts` проверял `signal instanceof AbortSignal` и
 * `signal.aborted === false` в момент вызова. Вторая проверка выглядит строже
 * первой, но на деле слабее: у бесконечного `AbortController` сигнал в момент
 * вызова тоже не сработавший, — то есть обе проходили при снятом дедлайне.
 *
 * Здесь проверяются ОБЕ половины, и вторая — главная:
 *   1. запрос к зависшему Telegram отпускается внутри границы;
 *   2. **`sendAlert` при этом не отклоняется**, а уходит в свой `catch` и
 *      пишет `logError` с `alertError` + `__skipAlert: true`. Это существенно:
 *      функция зовётся через `void` из `logError`, и её reject стал бы
 *      `unhandledRejection` — то есть падением процесса из-за телеметрии.
 *      `__skipAlert` не даёт записи об упавшем алерте снова позвать алерт.
 *
 * @probe   что сломать: убрать строку `signal: AbortSignal.timeout(...)` из
 *          `fetch` в `lib/monitoring/alert.ts`.
 *          наблюдалось: «алерт к зависшему Telegram отпускается внутри
 *          границы» — красный, «Test timed out in 15000ms»; прежний
 *          `alert.test.ts` на той же мутации падал лишь потому, что читал
 *          `init.signal` напрямую — но на мутации «бесконечный сигнал»
 *          (`new AbortController().signal`) он остаётся ЗЕЛЁНЫМ, а этот файл
 *          красным. Проверено обеими мутациями.
 *          восстановлено, `git diff src/lib/monitoring/alert.ts` пуст, зелено.
 */

const DECLARED_TIMEOUT_MS = 5_000;
const SLACK_MS = 4_000;

const logErrorSpy = vi.fn();

vi.mock("@/lib/logging/logger", () => ({
  logError: (...args: unknown[]) => logErrorSpy(...args),
  logInfo: () => undefined,
}));

// Алерт уходит только в production и только при настроенных кредах — иначе
// `sendAlert` возвращается до `fetch`, и тест проверял бы пустоту.
vi.mock("@/lib/env", () => ({
  env: {
    NODE_ENV: "production",
    MONITORING_TELEGRAM_BOT_TOKEN: "bot-token",
    MONITORING_TELEGRAM_CHAT_ID: "chat-id",
  },
  isProduction: true,
}));

import { sendAlert } from "@/lib/monitoring/alert";

describe("RES-23 · дедлайн алерта срабатывает и fail-soft ветка отрабатывает", () => {
  let harness: ReturnType<typeof installHangingFetch> | null = null;

  afterEach(() => {
    harness?.restore();
    harness = null;
    logErrorSpy.mockClear();
  });

  it(
    "алерт к зависшему Telegram отпускается внутри границы и НЕ бросает",
    async () => {
      harness = installHangingFetch();

      const startedAt = Date.now();
      // Намеренно без `.catch`: reject здесь провалит тест, и это предмет
      // проверки — вызывающий (`logError`) зовёт через `void`.
      await sendAlert("critical", "проверка дедлайна");
      const elapsed = Date.now() - startedAt;

      expect(harness.callCount(), "запрос к Telegram не дошёл до fetch").toBe(1);
      expect(
        elapsed,
        `алерт висел ${elapsed} мс при границе ${DECLARED_TIMEOUT_MS} мс`,
      ).toBeLessThan(DECLARED_TIMEOUT_MS + SLACK_MS);
      expect(elapsed, "отказ пришёл мгновенно — это не таймаут").toBeGreaterThan(
        DECLARED_TIMEOUT_MS / 2,
      );
    },
    DECLARED_TIMEOUT_MS + SLACK_MS + 6_000,
  );

  it("сработавший дедлайн уходит в fail-soft ветку, а не наружу", async () => {
    harness = installHangingFetch();

    await sendAlert("error", "текст события");

    // Половина, ради которой тест написан: отказ ЗАПИСАН, помечен как
    // алертный сбой и не зовёт алерт повторно.
    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    const [message, context] = logErrorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("текст события");
    expect(context.__skipAlert, "запись о сбое алерта сама поднимет алерт").toBe(true);
    expect(String(context.alertError)).toMatch(/timeout/i);
  }, 20_000);
});

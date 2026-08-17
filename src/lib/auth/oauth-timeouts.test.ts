import { afterEach, describe, expect, it, vi } from "vitest";

import { installHangingFetch } from "@/lib/testing/hanging-fetch";

/**
 * RES-09 — обмены с VK ID и Яндекс ID шли без верхней границы.
 *
 * Все четыре вызова стоят в callback'е авторизации: пользователь уже сходил к
 * провайдеру и вернулся, и его запрос висит, пока мы ходим за токеном и за
 * профилем. Медленный внешний партнёр держал слот обработки бессрочно, а
 * признака «таймаут» не появлялось нигде — вход выглядел просто зависшим.
 *
 * GUARD-INTEGRITY (FIX-B10) — почему файл переписан. Прежние четыре проверки
 * были вида `expect(signalOf(mock)).toBeInstanceOf(AbortSignal)`, то есть
 * утверждали, что сигнал ПЕРЕДАН, и молчали о том, срабатывает ли он.
 * `AbortSignal` бесконечного контроллера (`new AbortController().signal`) —
 * тоже `AbortSignal`, и все четыре теста остались бы зелёными, а дефект RES-09
 * вернулся бы целиком. Инвариант #43 — этот самый класс.
 *
 * @probe   что сломать: в `lib/vk/oauth.ts` заменить
 *          `signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS)` на
 *          `signal: new AbortController().signal` (оба обмена VK).
 *          наблюдалось: «VK · обмен кода на токен» и «VK · чтение профиля»
 *          красные по таймауту теста (5000 ms) с текстом
 *          «promise never resolved»; ПРЕЖНЯЯ форма проверки на той же мутации
 *          осталась бы зелёной — сигнал передан, он `instanceof AbortSignal`.
 *          восстановлено, `git diff src/lib/vk/oauth.ts` пуст, снова зелено.
 */

vi.mock("@/lib/vk/config", () => ({
  getVkClientId: () => "vk-client",
  getVkClientSecret: () => "vk-secret",
  getVkRedirectUri: () => "https://example.test/api/auth/vk/callback",
}));
vi.mock("@/lib/yandex/config", () => ({
  getYandexClientId: () => "ya-client",
  getYandexClientSecret: () => "ya-secret",
  getYandexRedirectUri: () => "https://example.test/api/auth/yandex/callback",
}));

import { exchangeVkCodeForToken, fetchVkProfile } from "@/lib/vk/oauth";
import { exchangeYandexCodeForToken, fetchYandexProfile } from "@/lib/yandex/oauth";

/** Заявленная граница обоих модулей (`OAUTH_REQUEST_TIMEOUT_MS`). */
const DECLARED_TIMEOUT_MS = 10_000;
/** Запас на планировщик: проверяем «внутри дедлайна», а не точное значение. */
const SLACK_MS = 4_000;

const CALLS: Array<{ name: string; run: () => Promise<unknown> }> = [
  {
    name: "VK · обмен кода на токен",
    run: () =>
      exchangeVkCodeForToken({
        code: "c",
        codeVerifier: "v",
        deviceId: "d",
        redirectUri: "https://example.test/cb",
        state: "s",
      }),
  },
  { name: "VK · чтение профиля", run: () => fetchVkProfile("token") },
  {
    name: "Яндекс · обмен кода на токен",
    run: () =>
      exchangeYandexCodeForToken({
        code: "c",
        codeVerifier: "v",
        redirectUri: "https://example.test/cb",
      }),
  },
  { name: "Яндекс · чтение профиля", run: () => fetchYandexProfile("token") },
];

describe("RES-09 · дедлайн OAuth-обменов срабатывает, а не просто объявлен", () => {
  let harness: ReturnType<typeof installHangingFetch> | null = null;

  afterEach(() => {
    harness?.restore();
    harness = null;
  });

  it(
    "все четыре вызова к зависшему провайдеру отклоняются внутри границы",
    async () => {
      harness = installHangingFetch();

      // Параллельно, а не подряд: дедлайн настоящий (fake timers не двигают
      // нативный `AbortSignal.timeout`), поэтому последовательный прогон стоил
      // бы четырёх ожиданий вместо одного.
      const startedAt = Date.now();
      const settled = await Promise.all(
        CALLS.map(async ({ name, run }) => {
          const outcome = await run().then(
            () => ({ name, rejected: false, error: null as unknown }),
            (error: unknown) => ({ name, rejected: true, error }),
          );
          return { ...outcome, elapsed: Date.now() - startedAt };
        }),
      );

      expect(harness.callCount(), "ни один вызов не дошёл до fetch").toBe(CALLS.length);

      for (const outcome of settled) {
        expect(outcome.rejected, `${outcome.name}: вызов завершился без отказа`).toBe(true);
        expect(
          outcome.elapsed,
          `${outcome.name}: висел ${outcome.elapsed} мс при границе ${DECLARED_TIMEOUT_MS} мс`,
        ).toBeLessThan(DECLARED_TIMEOUT_MS + SLACK_MS);
        // Нижняя граница: мгновенный отказ означал бы, что мы поймали не
        // таймаут, а что-то другое (битый конфиг, синхронный throw), и тест
        // прошёл бы мимо предмета проверки.
        expect(
          outcome.elapsed,
          `${outcome.name}: отказ пришёл через ${outcome.elapsed} мс — это не таймаут`,
        ).toBeGreaterThan(DECLARED_TIMEOUT_MS / 2);
      }
    },
    DECLARED_TIMEOUT_MS + SLACK_MS + 6_000,
  );

  it("отказ по дедлайну — TimeoutError, а не безымянная ошибка", async () => {
    harness = installHangingFetch();

    // Форма отказа — часть контракта: `failOAuthCallback` разбирает ошибку
    // через `toAppError`, и неотличимый `Error` там теряет причину.
    const error = await fetchVkProfile("token").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("TimeoutError");
  }, 20_000);
});

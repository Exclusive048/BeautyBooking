import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHangingFetch, type HangingFetchHandle } from "@/lib/testing/hanging-fetch";

/**
 * FIX-B18 · RES-10 — последний shape-сторож семейства дедлайнов переведён на
 * ПОВЕДЕНИЕ.
 *
 * Что было. `address-timeouts.test.ts` доказывал границу тремя способами, и
 * третий — регекспом по исходникам двух файлов геокодера
 * (`/signal:\s*AbortSignal\.timeout\(GEOCODE_REQUEST_TIMEOUT_MS\)/`). Такое
 * утверждение зелено при любой из поломок, ради которых оно написано:
 * константа объявлена, но `fetch` вызывается вторым, необёрнутым сайтом;
 * значение выставлено в `0`; `catch`, который должен превратить срыв дедлайна
 * в fail-soft, снят — регекспу всё равно.
 *
 * Что здесь. Тот же стенд, что у FIX-B10/FIX-B13: хост принимает соединение и
 * не отвечает НИКОГДА (`createHangingFetch`). Без дедлайна вызов повисает и
 * тест падает по собственному таймауту — это и есть «сторож умеет покраснеть».
 * Проверяется не факт наличия сигнала, а то, ради чего он существует: вызов
 * ОТПУСКАЕТСЯ внутри границы **и** управление доходит до существующей
 * fail-soft-ветки, а не наружу исключением.
 *
 * ⚠️ Таймеры не мокаются намеренно: `AbortSignal.timeout` живёт в нативном
 * слое Node мимо `globalThis.setTimeout`, и подменённый таймер дал бы зелёный
 * тест при мёртвом дедлайне. Цена честности — реальные ~5 с, поэтому оба
 * вызова стартуют параллельно.
 *
 * Оба геокодер-сайта покрыты по отдельности: они дёргают один и тот же внешний
 * сервис из разных модулей, и забыть границу в одном — вернуть половину
 * дефекта (ровно то, что и утверждал прежний регексп, только теперь это
 * проверяется поведением).
 *
 * @probe   что сломать (по одному, каждый раз с откатом):
 *   1. `signal: AbortSignal.timeout(...)` → `signal: new AbortController().signal`
 *      в `src/lib/cities/yandex-locality.ts` → 1 failed по таймауту теста
 *      («Test timed out in 15000ms») — боевой симптом «запрос висит вечно»;
 *   2. то же в `src/app/api/address/geocode/route.ts` → 1 failed, тот же вид;
 *   3. снять `catch` вокруг `fetch` в `yandex-locality.ts` (пробросить наружу)
 *      → 1 failed: «geocodeWithLocality пробросил исключение вместо fail-soft
 *      null: TimeoutError: The operation was aborted due to timeout».
 */

vi.mock("@/lib/env", () => ({
  env: {
    YANDEX_SUGGEST_API_KEY: "key",
    YANDEX_GEOCODER_API_KEY: "key",
    TRUSTED_PROXY_HOPS: 1,
    TRUSTED_REAL_IP_HEADER: "",
  },
  isProduction: false,
}));
vi.mock("@/lib/maps/address-cache", () => ({
  normalizeAddressQuery: (value: string) => value.trim().toLowerCase(),
  readAddressCache: async () => null,
  writeAddressCache: async () => undefined,
}));
// Тир лимитера — не предмет этого файла; пропускаем, чтобы измерялся дедлайн.
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ limited: false }) }));

import { geocodeWithLocality } from "@/lib/cities/yandex-locality";
import { GET as geocodeRoute } from "@/app/api/address/geocode/route";

/** Обе границы — 5 с; запас на планировщик, но заметно меньше таймаута теста. */
const DEADLINE_CEILING_MS = 10_000;

let hanging: HangingFetchHandle;
const realFetch = globalThis.fetch;

beforeEach(() => {
  hanging = createHangingFetch();
  globalThis.fetch = hanging.fetch;
});

afterEach(() => {
  hanging.release();
  globalThis.fetch = realFetch;
});

describe("FIX-B18 · RES-10 — зависший геокодер отпускается дедлайном", () => {
  it(
    "оба сайта: вызов завершается внутри границы и уходит в свою fail-soft-ветку",
    async () => {
      const started = Date.now();

      // Параллельно: каждый ждёт свои реальные 5 с, последовательно было бы 10.
      const [locality, routeResponse] = await Promise.all([
        geocodeWithLocality("Тверская, 1").catch((error: unknown) => {
          throw new Error(
            `geocodeWithLocality пробросил исключение вместо fail-soft null: ${String(error)}`,
          );
        }),
        geocodeRoute(new Request("http://localhost/api/address/geocode?q=%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F")),
      ]);

      const elapsed = Date.now() - started;

      // 1. Оба дошли до внешнего сервиса — иначе «отпустило» означало бы
      //    «не позвали», и тест был бы вакуумным.
      expect(hanging.callCount(), "ни один сайт не дошёл до внешнего сервиса").toBe(2);

      // 2. Отпустило, а не повисло. Без дедлайна сюда управление не приходит
      //    вовсе — тест падает по своему таймауту.
      expect(
        elapsed,
        `зависший геокодер держал вызовы ${elapsed} мс — граница не сработала`,
      ).toBeLessThan(DEADLINE_CEILING_MS);

      // 3. Сработала именно существующая fail-soft-ветка каждого сайта.
      expect(locality, "yandex-locality вернул не null при недоступном геокодере").toBeNull();
      expect(routeResponse.status, "роут ответил не 502 при недоступном геокодере").toBe(502);

      const body = (await routeResponse.json()) as { ok: boolean; error: { message: string } };
      expect(body.ok).toBe(false);
      // Текст курируемый и русский — отказ читает человек в поле ввода адреса.
      expect(body.error.message).toMatch(/[А-Яа-яЁё]/);
    },
    15_000,
  );
});

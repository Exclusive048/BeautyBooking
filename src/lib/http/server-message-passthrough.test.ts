import { describe, expect, it, vi } from "vitest";

import { ApiClientError, fetchJson } from "@/lib/http/client";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FIX-C3 · SMOKE-01 · F3 — курируемое сообщение сервера доходит до человека, а
 * своя строка поверхности остаётся дефолтом.
 *
 * ## Что было
 *
 * FIX-B16 отдаёт на проводе честный отказ: 429 `AI_DAILY_LIMIT_REACHED`,
 * «…дневной лимит ИИ-запросов исчерпан. Попробуйте завтра.» Единственная
 * достижимая из UI ИИ-поверхность тело ЧИТАЛА, но `json.error.message` не
 * смотрела ни в одной ветке и печатала «Резюме временно недоступно. Попробуйте
 * через минуту.»
 *
 * 🔴 Расхождение не в тоне, а в **масштабе времени**: потолок сбрасывается в
 * UTC-полночь, а продукт советовал повторить через минуту. Пользователь жмёт
 * кнопку весь день и делает вывод, что сломан продукт.
 *
 * ## Почему проверяются ОБА направления
 *
 * Починить passthrough легко ценой fallback'а: если всегда показывать
 * `error.message`, то на 500 без тела пользователь получит либо пустоту, либо
 * `res.statusText` — английскую строку протокола. Поэтому тесты держат обе
 * стороны, а различает их признак `fromServer`.
 *
 * @probe   что сломать: в `lib/http/client.ts` вернуть `fromServer: false`
 *          безусловно.
 *          наблюдалось: «сервер прислал курируемую строку, а поверхность её не
 *          показала» — красный на первом тесте.
 *          Второй пробой возвращён `res.statusText` в цепочку сообщений →
 *          «пользователю уехала строка протокола вместо русской» — красный.
 *          Оба восстановлены, `diff` с бэкапом пуст, зелено.
 */

const CEILING_MESSAGE = UI_TEXT.ai.dailyLimitReached;

function respond(status: number, body: unknown | null): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? "Too Many Requests" : "Internal Server Error",
    json: async () => {
      if (body === null) throw new Error("no body");
      return body;
    },
  } as unknown as Response;
}

/** Ветка поверхности: показать серверное, иначе — своё, более конкретное. */
function messageForUser(error: unknown, ownFallback: string): string {
  return error instanceof ApiClientError && error.fromServer ? error.message : ownFallback;
}

const OWN_FALLBACK = UI_TEXT.publicProfile.reviews.summaryFailed;

describe("FIX-C3 · сообщение сервера доходит до человека", () => {
  it("потолок ИИ показывается своей строкой, а не «через минуту»", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        respond(429, {
          ok: false,
          requestId: "r1",
          error: { message: CEILING_MESSAGE, code: "AI_DAILY_LIMIT_REACHED" },
        }),
    );

    const shown = await fetchJson("/x").then(
      () => "unreachable",
      (error) => messageForUser(error, OWN_FALLBACK),
    );

    expect(
      shown,
      "сервер прислал курируемую строку, а поверхность её не показала — " +
        "пользователь узнаёт про «минуту» вместо суточного лимита (SMOKE-01 · F3)",
    ).toBe(CEILING_MESSAGE);
    expect(shown).not.toBe(OWN_FALLBACK);
    vi.unstubAllGlobals();
  });

  it("отказ без тела оставляет строку поверхности", async () => {
    vi.stubGlobal("fetch", async () => respond(500, null));

    const shown = await fetchJson("/x").then(
      () => "unreachable",
      (error) => messageForUser(error, OWN_FALLBACK),
    );

    expect(
      shown,
      "fallback потерян при починке passthrough — на 500 без тела пользователю " +
        "показывать нечего",
    ).toBe(OWN_FALLBACK);
    vi.unstubAllGlobals();
  });

  it("`res.statusText` до пользователя не доходит", async () => {
    vi.stubGlobal("fetch", async () => respond(429, null));

    const error = await fetchJson("/x").then(
      () => null,
      (e: unknown) => e as ApiClientError,
    );

    expect(
      error?.message,
      "строка протокола («Too Many Requests») попала в сообщение пользователю — " +
        "она всегда английская и адресована не человеку",
    ).not.toBe("Too Many Requests");
    expect(error?.fromServer).toBe(false);
    vi.unstubAllGlobals();
  });

  it("код ошибки сохраняется — поверхность может ветвиться не по тексту", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        respond(429, {
          ok: false,
          requestId: "r1",
          error: { message: CEILING_MESSAGE, code: "AI_DAILY_LIMIT_REACHED" },
        }),
    );

    const error = await fetchJson("/x").then(
      () => null,
      (e: unknown) => e as ApiClientError,
    );

    expect(error?.code).toBe("AI_DAILY_LIMIT_REACHED");
    expect(error?.status).toBe(429);
    vi.unstubAllGlobals();
  });
});

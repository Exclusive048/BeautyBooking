import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { installHangingFetch } from "@/lib/testing/hanging-fetch";

/**
 * FIX-B13 · OAUTH-TIMEOUT-DEAD-END-UX — таймаут провайдера возвращает
 * пользователя в приложение, остальные отказы по-прежнему нет.
 *
 * Контекст. Пользователь в момент отказа находится ВНУТРИ редиректа провайдера,
 * поэтому `fail()` здесь — не «ответ API», а тупик: браузер печатает сырой JSON,
 * и вернуться некуда. Прежнее решение оставляло редирект единственному отказу
 * (конфликт адреса) и защищало это тем, что остальным «повторять нечего» —
 * рассуждение верное, и оно СОХРАНЕНО. Дефект был уже: таймаут повторять как раз
 * есть смысл, а с RES-09 он ещё и наступает предсказуемо, на 10-й секунде.
 *
 * 🔴 Почему ошибка здесь настоящая, а не собранная руками. Классификатор смотрит
 * на ИСХОДНУЮ ошибку, потому что `toAppError` сводит `DOMException` к общему
 * `INTERNAL_ERROR` 500 — признак теряется. Значит предмет проверки — совпадение
 * формы: то, чем отклоняется НАСТОЯЩИЙ дедлайн, обязано быть тем, что узнаёт
 * классификатор. Подделка `new DOMException("...", "TimeoutError")` проверяла бы
 * согласие теста с самим собой и осталась бы зелёной в тот день, когда
 * `lib/vk/oauth.ts` начнёт оборачивать отказ в свой `AppError`. Поэтому ошибка
 * добывается прогоном `fetchVkProfile` через зависший стенд — ценой 10 с.
 *
 * @probe   что сломать (по одному, каждый раз с откатом):
 *   1. снять ветку `isRetryableOAuthCallbackFailure` в `oauth-callback-error.ts`
 *      → красное «таймаут провайдера … получено 500» (тупик вернулся);
 *   2. расширить предикат до `return true` → красное «прочие отказы формы НЕ
 *      меняют»: небитый токен начал бы редиректить, то есть прятать сбой;
 *   3. заменить ключ на `?error=timeout` в хелпере → красное на lockstep-проверке
 *      (`login-client.tsx` разбирает `provider_timeout`).
 */

vi.mock("@/lib/vk/config", () => ({
  getVkClientId: () => "vk-client",
  getVkClientSecret: () => "vk-secret",
  getVkRedirectUri: () => "https://example.test/api/auth/vk/callback",
}));

import { AppError } from "@/lib/api/errors";
import { failOAuthCallback } from "@/lib/auth/oauth-callback-error";
import { fetchVkProfile } from "@/lib/vk/oauth";

const DECLARED_TIMEOUT_MS = 10_000;

const req = () => new Request("https://мастеррядом.online/api/auth/vk/callback?code=x");

const LOGIN_CLIENT_SOURCE = readFileSync(
  resolve(process.cwd(), "src", "app", "login", "login-client.tsx"),
  "utf8",
);

describe("FIX-B13 · классификация отказов колбэка по retryability", () => {
  let harness: ReturnType<typeof installHangingFetch> | null = null;

  afterEach(() => {
    harness?.restore();
    harness = null;
  });

  it(
    "таймаут провайдера → редирект в /login с разбираемой причиной",
    async () => {
      harness = installHangingFetch();

      // Ошибка ровно та, которой отклоняется боевой дедлайн RES-09.
      const error = await fetchVkProfile("token").catch((e: unknown) => e);
      expect(harness.callCount(), "вызов не дошёл до fetch — стенд не задействован").toBe(1);

      const response = failOAuthCallback(req(), error);

      // Ведущая проверка — та, что описывает дефект: без редиректа пользователь
      // получает JSON внутри редиректа провайдера и вернуться ему некуда.
      expect(
        response.headers.get("location"),
        `таймаут провайдера обязан возвращать пользователя в /login?error=provider_timeout, ` +
          `а отдан ответ ${response.status} без Location — это тупик внутри редиректа провайдера`,
      ).toContain("/login?error=provider_timeout");

      expect(response.status).toBeGreaterThanOrEqual(300);
      expect(response.status).toBeLessThan(400);
    },
    DECLARED_TIMEOUT_MS + 10_000,
  );

  it("прочие отказы формы НЕ меняют — подмена редиректом прятала бы сбой", () => {
    // Обе формы «повторять нечего»: безымянный сбой и осмысленный отказ
    // провайдера. Ни одна не имеет права стать редиректом.
    for (const error of [
      new Error("boom"),
      new AppError("Провайдер отказал в доступе.", 403, "FORBIDDEN"),
    ]) {
      const response = failOAuthCallback(req(), error);
      expect(response.status, `${String(error)}: ожидался отказ, не редирект`).toBeGreaterThanOrEqual(400);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("прерывание НЕ по дедлайну таймаутом не считается", () => {
    // `AbortError` — это отменённый запрос (уход клиента, наш собственный
    // abort), а не «провайдер не ответил». Обещать здесь «попробуйте ещё раз»
    // значило бы называть причиной провайдера то, к чему он не причастен.
    const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
    const response = failOAuthCallback(req(), aborted);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("lockstep: ключ редиректа разбирается страницей входа", () => {
    // Ключ — литерал в двух файлах (как уже сделано у `consent` и
    // `email_taken`), поэтому расхождение ловится здесь: без этой проверки
    // сервер редиректил бы с ключом, который страница молча игнорирует, и
    // пользователь видел бы /login вообще без объяснения.
    expect(LOGIN_CLIENT_SOURCE).toContain('code === "provider_timeout"');
    expect(LOGIN_CLIENT_SOURCE).toContain("oauthProviderTimeout");
  });
});

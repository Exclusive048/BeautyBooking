import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RES-09 — обмены с VK ID и Яндекс ID шли без верхней границы.
 *
 * Все четыре вызова стоят в callback'е авторизации: пользователь уже сходил к
 * провайдеру и вернулся, и его запрос висит, пока мы ходим за токеном и за
 * профилем. Медленный внешний партнёр держал слот обработки бессрочно, а
 * признака «таймаут» не появлялось нигде — вход выглядел просто зависшим.
 *
 * Проверяется контракт «в каждый исходящий вызов уходит AbortSignal»: сам факт
 * срабатывания таймера ждать 10 с в прогоне дороже, чем оно стоит.
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

const realFetch = globalThis.fetch;

function stubFetch(payload: unknown) {
  const mock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), { status: 200 })
  );
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function signalOf(mock: ReturnType<typeof stubFetch>): unknown {
  const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
  return init?.signal;
}

describe("RES-09 · OAuth-обмены ограничены сверху", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("VK: обмен кода на токен передаёт AbortSignal", async () => {
    const mock = stubFetch({
      access_token: "t",
      refresh_token: "r",
      expires_in: 3600,
      user_id: 1,
    });

    await exchangeVkCodeForToken({
      code: "c",
      codeVerifier: "v",
      deviceId: "d",
      redirectUri: "https://example.test/cb",
      state: "s",
    }).catch(() => undefined);

    expect(signalOf(mock)).toBeInstanceOf(AbortSignal);
  });

  it("VK: чтение профиля передаёт AbortSignal", async () => {
    const mock = stubFetch({ user: { user_id: "1", first_name: "A" } });

    await fetchVkProfile("token").catch(() => undefined);

    expect(signalOf(mock)).toBeInstanceOf(AbortSignal);
  });

  it("Яндекс: обмен кода на токен передаёт AbortSignal", async () => {
    const mock = stubFetch({ access_token: "t", expires_in: 3600 });

    await exchangeYandexCodeForToken({
      code: "c",
      codeVerifier: "v",
      redirectUri: "https://example.test/cb",
    }).catch(() => undefined);

    expect(signalOf(mock)).toBeInstanceOf(AbortSignal);
  });

  it("Яндекс: чтение профиля передаёт AbortSignal", async () => {
    const mock = stubFetch({ id: "1", login: "a" });

    await fetchYandexProfile("token").catch(() => undefined);

    expect(signalOf(mock)).toBeInstanceOf(AbortSignal);
  });
});

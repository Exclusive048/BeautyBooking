import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * C-01 · MOBILE-OAUTH-LINK-COMPLETE — колбэк провайдера во флоу привязки
 * приложения не трогает БД вовсе.
 *
 * Флоу с link-intent проходит браузер, который мог открыть кто угодно: intent
 * предъявительский, его владелец волен отправить по ссылке чужого человека.
 * Пока колбэк сам звал `linkOAuthIdentity`, VK/Яндекс жертвы привязывался к
 * владельцу ссылки, её подтверждённый провайдером номер засчитывался ему, а
 * её гостевые записи переезжали к нему. Теперь колбэк только кладёт личность
 * в одноразовый код привязки, а пишет связку шаг приложения с Bearer
 * владельца intent (`/api/mobile/v1/auth/oauth/link/complete`, свои тесты в
 * `mobile-oauth-routes.test.ts`).
 *
 * Предмет проверки — ПОВЕДЕНИЕ «ни одного обращения к БД», а не форма кода
 * колбэка: `oauth-login`, `phone-provider-proof` и перенос гостевых записей
 * здесь настоящие, а Prisma — двойник, записывающий ЛЮБОЕ обращение к любой
 * модели. Поэтому красным становится любой путь записи — вернувшийся вызов
 * `linkOAuthIdentity`, прямой `applyProviderVerifiedPhoneSafe`, перенос
 * записей, поиск владельца intent «для проверки» — как бы он ни был назван и
 * импортирован.
 *
 * @probe   что сломать: в ветку `if (flow.linkUserId)` колбэка
 *          (`lib/auth/oauth-mobile-callback.ts`) перед выдачей кода вернуть
 *          `await linkOAuthIdentity({ identity, user: { id: flow.linkUserId,
 *          roles: [AccountType.CLIENT] }, consent: { flags: input.consentFlags,
 *          ipAddress: null, userAgent: null } })` — то есть прежнюю
 *          «привязку в колбэке», только без поиска владельца.
 *          наблюдалось: оба теста красные — «expected [ 'vkLink.findUnique' ]
 *          to deeply equal []» (VK) и «[ 'yandexLink.findUnique' ]» (Яндекс):
 *          `upsertOAuthLink` начинает с чтения связки, и двойник его видит
 *          раньше, чем дело доходит до записи. Вторая проба — оставить только
 *          `applyProviderVerifiedPhoneSafe({ userId: flow.linkUserId, … })`:
 *          красный, «[ 'userProfile.findUnique' ]» (Safe-обёртка глотает
 *          исключение двойника, но обращение уже записано).
 */

const state = vi.hoisted(() => ({
  redis: new Map<string, string>(),
  dbCalls: [] as string[],
}));

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "s".repeat(64), AUTH_COOKIE_NAME: "bh_session" },
  isProduction: false,
}));
vi.mock("@/lib/prisma", () => {
  // Любое `prisma.<модель>.<метод>(…)` и `prisma.$transaction(…)` — запись в
  // журнал и отказ: колбэк привязки не имеет права дойти ни до одного.
  const touch = (name: string) => {
    state.dbCalls.push(name);
    throw new Error(`DB touched: ${name}`);
  };
  const model = (modelName: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) =>
          typeof method === "string" ? () => touch(`${modelName}.${method}`) : undefined,
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (typeof key !== "string" || key === "then") return undefined;
        return key.startsWith("$") ? () => touch(key) : model(key);
      },
    },
  );
  return { prisma };
});
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () => ({
    set: async (key: string, value: string, options?: { NX?: boolean }) => {
      if (options?.NX && state.redis.has(key)) return null;
      state.redis.set(key, value);
      return "OK";
    },
    getDel: async (key: string) => {
      const value = state.redis.get(key) ?? null;
      state.redis.delete(key);
      return value;
    },
  })),
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { completeMobileOAuthCallback } from "@/lib/auth/oauth-mobile-callback";
import type { OAuthIdentity, OAuthProviderProfile } from "@/lib/auth/oauth-login";

const CHALLENGE = createHash("sha256").update("app-verifier-0123456789-abcdefghijklmnopqrstuvwxyz").digest("base64url");

/** Профиль жертвы: подтверждённый провайдером номер — то, что раньше уезжало к владельцу ссылки. */
const VICTIM_PROFILE: OAuthProviderProfile = {
  id: "provider-victim",
  firstName: "Вера",
  lastName: "Жертвова",
  phone: "+79991234567",
  email: "vera@example.test",
  avatarUrl: "https://cdn.example.test/vera.jpg",
};

function linkFlowCallback(identity: OAuthIdentity) {
  return completeMobileOAuthCallback(
    new Request(`http://localhost/api/auth/${identity.provider}/callback?code=c&state=s`),
    { state: "s", provider: identity.provider, codeChallenge: CHALLENGE, linkUserId: "u-intent-owner" },
    {
      consentFlags: { terms: false, pdProcessing: false, marketing: false },
      obtainIdentity: async () => identity,
    },
  );
}

beforeEach(() => {
  state.redis.clear();
  state.dbCalls.length = 0;
});

describe("колбэк привязки приложения (linkUserId) — без шага приложения ничего не пишется", () => {
  it.each<[string, OAuthIdentity]>([
    ["VK", { provider: "vk", profile: VICTIM_PROFILE, deviceId: "vk-device" }],
    ["Яндекс", { provider: "yandex", profile: VICTIM_PROFILE }],
  ])("%s: ни одного обращения к БД — только код привязки в Redis", async (_label, identity) => {
    const res = await linkFlowCallback(identity);

    // Ни связки, ни телефона, ни переноса записей, ни даже чтения.
    expect(state.dbCalls).toEqual([]);

    const location = new URL(res.headers.get("location") as string);
    expect(`${location.protocol}//${location.host}${location.pathname}`).toBe("masterryadom://auth/callback");
    expect(location.searchParams.get("link")).toBe(identity.provider);
    expect(location.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(location.searchParams.has("error")).toBe(false);

    // Личность ждёт шага приложения: владелец intent, челлендж старта, id и
    // номер — и ничего сверх того, что нужно связке.
    const records = [...state.redis.values()].map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(records).toEqual([
      {
        linkUserId: "u-intent-owner",
        codeChallenge: CHALLENGE,
        identity:
          identity.provider === "vk"
            ? { provider: "vk", profile: { id: "provider-victim", phone: "+79991234567" }, deviceId: "vk-device" }
            : { provider: "yandex", profile: { id: "provider-victim", phone: "+79991234567" } },
        consentFlags: { terms: false, pdProcessing: false, marketing: false },
      },
    ]);
  });
});

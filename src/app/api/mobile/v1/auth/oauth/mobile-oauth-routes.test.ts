import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A2 — вход и привязка VK ID / Яндекс ID из нативного приложения.
 *
 * Что пиннится:
 *  · старт: килсвитч, форма `codeChallenge`, гейт согласий (кроме `intent`),
 *    те же куки, что у веба, + подписанная кука мобильного флоу; сессия
 *    браузера не читается; любой отказ — переход на `masterryadom://`;
 *  · колбэк (общий с вебом): флоу приложения получает одноразовый код, а не
 *    куки сессии, и игнорирует веб-сессию браузера; привязка — только к
 *    пользователю из intent; отказы — `?error=` в приложение; веб-флоу (и
 *    чужая/протухшая мобильная кука) идут прежним путём;
 *  · обмен: PKCE S256, код одноразовый при любом исходе, один код ошибки;
 *  · link-intent: только с сессией, одноразовый, привязан к провайдеру.
 *
 * Redis подменён картой с семантикой `SET NX EX` / `GETDEL`; куки — банкой,
 * которую видят и `cookies()` старта, и колбэк (как браузер между ними).
 */

const state = vi.hoisted(() => ({
  vkEnabled: true,
  yandexEnabled: true,
  redisUp: true,
  redis: new Map<string, string>(),
  jar: new Map<string, string>(),
  users: new Map<string, { id: string; phone: string | null; roles: string[] }>(),
}));

const spies = vi.hoisted(() => ({
  getSessionUser: vi.fn(async (): Promise<unknown> => null),
  setSessionCookies: vi.fn(async () => undefined),
  issueSession: vi.fn(async () => ({
    accessToken: "access.jwt",
    accessTokenExpiresAt: new Date("2026-10-03T12:00:00.000Z"),
    refreshToken: "refresh.jwt",
    refreshTokenExpiresAt: new Date("2026-11-02T10:00:00.000Z"),
  })),
  exchangeVkCodeForToken: vi.fn(async () => ({ accessToken: "provider-access", deviceId: "vk-device" })),
  fetchVkProfile: vi.fn(async () => ({ id: "vk-1", firstName: "Анна", lastName: "К" })),
  exchangeYandexCodeForToken: vi.fn(async () => ({ accessToken: "provider-access" })),
  fetchYandexProfile: vi.fn(async () => ({ id: "ya-1", firstName: "Анна", lastName: "К" })),
  resolveOAuthLogin: vi.fn(async (): Promise<unknown> => ({
    ok: true,
    user: { id: "u-oauth", phone: null, roles: ["CLIENT"] },
  })),
  linkOAuthIdentity: vi.fn(async (): Promise<unknown> => null),
  nextRedirect: vi.fn(
    (_req: Request, target: string) => new Response(null, { status: 307, headers: { location: target } }),
  ),
  getMeIdentityFromDb: vi.fn(async (id: string) => ({ id, roles: ["CLIENT"], displayName: null })),
}));

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "s".repeat(64), AUTH_COOKIE_NAME: "bh_session" },
  isProduction: false,
  get isVkAuthEnabled() {
    return state.vkEnabled;
  },
  get isYandexAuthEnabled() {
    return state.yandexEnabled;
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) as string } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (value === "" || options?.maxAge === 0) state.jar.delete(name);
      else state.jar.set(name, value);
    },
  })),
}));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn(async () =>
    state.redisUp
      ? {
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
        }
      : null,
  ),
  withRedisCommandTimeout: (_operation: string, promise: Promise<unknown>) => promise,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: spies.getSessionUser,
  setSessionCookies: spies.setSessionCookies,
  issueSession: spies.issueSession,
}));
vi.mock("@/lib/auth/oauth-login", () => ({
  resolveOAuthLogin: spies.resolveOAuthLogin,
  linkOAuthIdentity: spies.linkOAuthIdentity,
}));
vi.mock("@/lib/auth/otp-login", () => ({ completeOtpLogin: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => state.users.get(where.id) ?? null),
    },
  },
}));
vi.mock("@/lib/vk/oauth", () => ({
  exchangeVkCodeForToken: spies.exchangeVkCodeForToken,
  fetchVkProfile: spies.fetchVkProfile,
  requireVkRedirectUri: () => "https://masterryadom.test/api/auth/vk/callback",
  buildVkAuthorizeUrl: ({ state: flowState }: { state: string }) => `https://id.vk.ru/authorize?state=${flowState}`,
}));
vi.mock("@/lib/yandex/oauth", () => ({
  exchangeYandexCodeForToken: spies.exchangeYandexCodeForToken,
  fetchYandexProfile: spies.fetchYandexProfile,
  requireYandexRedirectUri: () => "https://masterryadom.test/api/auth/yandex/callback",
  buildYandexAuthorizeUrl: ({ state: flowState }: { state: string }) =>
    `https://oauth.yandex.ru/authorize?state=${flowState}`,
}));
vi.mock("@/lib/http/origin", () => ({ nextRedirect: spies.nextRedirect }));
vi.mock("@/lib/auth/cabinet-redirect", () => ({ resolveCabinetRedirect: vi.fn(async () => ({ target: "/cabinet" })) }));
vi.mock("@/lib/auth/phone-verify-return", () => ({
  PHONE_VERIFY_START_PARAM: "verifyPhone",
  rememberPhoneVerifyReturn: vi.fn(async () => undefined),
  takePhoneVerifyReturn: vi.fn(async () => null),
  phoneVerifyResultPath: vi.fn(() => "/cabinet"),
}));
vi.mock("@/lib/users/me", () => ({ getMeIdentityFromDb: spies.getMeIdentityFromDb }));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

import { AppError } from "@/lib/api/errors";
import { GET as mobileStart } from "@/app/api/mobile/v1/auth/oauth/[provider]/start/route";
import { POST as linkIntent } from "@/app/api/mobile/v1/auth/oauth/[provider]/link-intent/route";
import { POST as exchange } from "@/app/api/mobile/v1/auth/oauth/exchange/route";
import { GET as vkCallback } from "@/app/api/auth/vk/callback/route";
import { GET as yandexCallback } from "@/app/api/auth/yandex/callback/route";
import { MOBILE_OAUTH_FLOW_COOKIE, signMobileOAuthFlowCookieValue } from "@/lib/auth/mobile-oauth-flow";
import { readSignedVkCookieValue, signVkCookieValue, VK_ID_STATE_COOKIE, VK_ID_VERIFIER_COOKIE } from "@/lib/vk/cookies";
import { readSignedYandexCookieValue, YANDEX_STATE_COOKIE } from "@/lib/yandex/cookies";
import { readConsentCookieValue, signConsentCookieValue, VK_CONSENT_COOKIE } from "@/lib/legal/oauth-consent-cookie";

const VERIFIER = "app-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const CONSENTED = "terms=1&pd=1&marketing=0";

type Provider = "vk" | "yandex";

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

async function start(provider: string, query: string) {
  return mobileStart(
    new Request(`http://localhost/api/mobile/v1/auth/oauth/${provider}/start?${query}`),
    params({ provider }),
  );
}

/** `masterryadom://auth/callback?…` → параметры; падает, если это не переход в приложение. */
function appOutcome(res: Response): URLSearchParams {
  const location = res.headers.get("location");
  expect(location, `ожидался переход в приложение, статус ${res.status}`).toMatch(/^masterryadom:\/\/auth\/callback\?/);
  expect(res.status).toBe(302);
  return new URL(location as string).searchParams;
}

function vkState(): string {
  return readSignedVkCookieValue(state.jar.get(VK_ID_STATE_COOKIE)) as string;
}

async function vkCallbackFor(flowState: string, extra = "") {
  return vkCallback(
    new Request(`http://localhost/api/auth/vk/callback?code=provider-code&state=${flowState}&device_id=dev${extra}`, {
      headers: { "user-agent": "Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36" },
    }),
  );
}

function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

async function exchangeCode(code: string, codeVerifier = VERIFIER) {
  return exchange(
    postJson("/api/mobile/v1/auth/oauth/exchange", { code, codeVerifier }, { "x-client-platform": "android" }),
  );
}

async function issueIntent(provider: Provider): Promise<string> {
  spies.getSessionUser.mockResolvedValueOnce({ id: "u-app", phone: null, roles: ["CLIENT"] });
  const res = await linkIntent(postJson(`/api/mobile/v1/auth/oauth/${provider}/link-intent`, {}), params({ provider }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { intent: string } }).data.intent;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.vkEnabled = true;
  state.yandexEnabled = true;
  state.redisUp = true;
  state.redis.clear();
  state.jar.clear();
  state.users.clear();
  state.users.set("u-oauth", { id: "u-oauth", phone: null, roles: ["CLIENT"] });
  state.users.set("u-app", { id: "u-app", phone: "+79990000000", roles: ["CLIENT"] });
  spies.getSessionUser.mockResolvedValue(null);
  spies.resolveOAuthLogin.mockResolvedValue({ ok: true, user: { id: "u-oauth", phone: null, roles: ["CLIENT"] } });
  spies.linkOAuthIdentity.mockResolvedValue(null);
});

// ── Старт ────────────────────────────────────────────────────────────────────

describe("GET /api/mobile/v1/auth/oauth/{provider}/start", () => {
  it("успех: уход к провайдеру, веб-куки + подписанная кука флоу, сессия браузера не читается", async () => {
    const res = await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);

    const location = res.headers.get("location") as string;
    expect(location).toMatch(/^https:\/\/id\.vk\.ru\/authorize\?state=/);
    const flowState = vkState();
    expect(location).toContain(flowState);
    // Те же куки, что ставит веб-старт: колбэк общий.
    expect(readSignedVkCookieValue(state.jar.get(VK_ID_VERIFIER_COOKIE))).toBeTruthy();
    expect(readConsentCookieValue(state.jar.get(VK_CONSENT_COOKIE), flowState)).toEqual({
      terms: true,
      pdProcessing: true,
      marketing: false,
    });
    expect(state.jar.get(MOBILE_OAUTH_FLOW_COOKIE.vk)).toBeTruthy();
    expect(spies.getSessionUser).not.toHaveBeenCalled();
  });

  it("без согласий и без intent → consent_required, куки не ставятся", async () => {
    const res = await start("vk", `codeChallenge=${CHALLENGE}&terms=1`);
    expect(appOutcome(res).get("error")).toBe("consent_required");
    expect(state.jar.size).toBe(0);
  });

  it.each([
    ["нет codeChallenge", "vk", CONSENTED],
    ["codeChallenge не той формы", "vk", `codeChallenge=short&${CONSENTED}`],
    ["неизвестный провайдер", "google", `codeChallenge=${CHALLENGE}&${CONSENTED}`],
  ])("%s → invalid_request", async (_label, provider, query) => {
    const res = await start(provider, query);
    expect(appOutcome(res).get("error")).toBe("invalid_request");
  });

  it("килсвитч провайдера → provider_unavailable, до любой работы", async () => {
    state.yandexEnabled = false;
    const res = await start("yandex", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    expect(appOutcome(res).get("error")).toBe("provider_unavailable");
    expect(state.jar.size).toBe(0);
  });

  it("intent: согласия не нужны, intent сгорает (повтор → intent_invalid)", async () => {
    const intent = await issueIntent("vk");

    const first = await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);
    expect(first.headers.get("location")).toMatch(/^https:\/\/id\.vk\.ru\//);

    state.jar.clear();
    const second = await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);
    expect(appOutcome(second).get("error")).toBe("intent_invalid");
  });

  it("intent другого провайдера → intent_invalid", async () => {
    const intent = await issueIntent("yandex");
    const res = await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);
    expect(appOutcome(res).get("error")).toBe("intent_invalid");
  });

  it("Redis недоступен при intent → start_failed (не тупик в браузере)", async () => {
    const intent = await issueIntent("vk");
    state.redisUp = false;
    const res = await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);
    expect(appOutcome(res).get("error")).toBe("start_failed");
  });
});

// ── Колбэк: ветка приложения ────────────────────────────────────────────────

describe("колбэк провайдера, флоу приложения", () => {
  it("вход: одноразовый код в приложение, без кук сессии; веб-сессия браузера игнорируется", async () => {
    // В Custom Tabs может жить веб-сессия ДРУГОГО человека.
    spies.getSessionUser.mockResolvedValue({ id: "someone-else", phone: null, roles: ["CLIENT"] });
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);

    const res = await vkCallbackFor(vkState());

    const code = appOutcome(res).get("code");
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(spies.getSessionUser).not.toHaveBeenCalled();
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
    expect(spies.linkOAuthIdentity).not.toHaveBeenCalled();
    expect(spies.resolveOAuthLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { provider: "vk", profile: expect.objectContaining({ id: "vk-1" }), deviceId: "vk-device" },
        consent: expect.objectContaining({ flags: { terms: true, pdProcessing: true, marketing: false } }),
      }),
    );
    // Одноразовые куки флоу погашены.
    expect(state.jar.has(VK_ID_STATE_COOKIE)).toBe(false);
    expect(state.jar.has(MOBILE_OAUTH_FLOW_COOKIE.vk)).toBe(false);
    // Код — не токен провайдера и не id пользователя.
    expect(res.headers.get("location")).not.toContain("provider-access");
    expect(res.headers.get("location")).not.toContain("u-oauth");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("код + verifier → { tokens, user } как у OTP-входа; повтор кода → OAUTH_CODE_INVALID", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const code = appOutcome(await vkCallbackFor(vkState())).get("code") as string;

    const res = await exchangeCode(code);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
    const body = (await res.json()) as { data: { tokens: { accessToken: string }; user: { id: string } } };
    expect(body.data.tokens.accessToken).toBe("access.jwt");
    expect(body.data.user.id).toBe("u-oauth");
    expect(spies.issueSession).toHaveBeenCalledWith(
      { sub: "u-oauth", phone: null, roles: ["CLIENT"] },
      expect.objectContaining({ clientType: "MOBILE", platform: "android" }),
    );

    const replay = await exchangeCode(code);
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as { error: { code: string } }).error.code).toBe("OAUTH_CODE_INVALID");
    expect(spies.issueSession).toHaveBeenCalledTimes(1);
  });

  it("чужой verifier → OAUTH_CODE_INVALID, и код сгорел (верный verifier после — тоже отказ)", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const code = appOutcome(await vkCallbackFor(vkState())).get("code") as string;

    const wrong = await exchangeCode(code, "x".repeat(43));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe("OAUTH_CODE_INVALID");

    const late = await exchangeCode(code);
    expect(late.status).toBe(400);
    expect(spies.issueSession).not.toHaveBeenCalled();
  });

  it("протухший/неизвестный код → тот же OAUTH_CODE_INVALID; кривое тело → VALIDATION_ERROR", async () => {
    const unknown = await exchangeCode("A".repeat(43));
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe("OAUTH_CODE_INVALID");

    const malformed = await exchange(postJson("/api/mobile/v1/auth/oauth/exchange", { code: "x" }));
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("пользователь удалён между колбэком и обменом → OAUTH_CODE_INVALID, сессии нет", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const code = appOutcome(await vkCallbackFor(vkState())).get("code") as string;
    state.users.delete("u-oauth");

    const res = await exchangeCode(code);
    expect(res.status).toBe(400);
    expect(spies.issueSession).not.toHaveBeenCalled();
  });

  it("привязка по intent: связка к пользователю intent, а не к сессии браузера → ?linked=vk", async () => {
    const intent = await issueIntent("vk");
    spies.getSessionUser.mockResolvedValue({ id: "someone-else", phone: null, roles: ["CLIENT"] });
    await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);

    const res = await vkCallbackFor(vkState());

    expect(appOutcome(res).get("linked")).toBe("vk");
    expect(spies.linkOAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u-app" }) }),
    );
    expect(spies.resolveOAuthLogin).not.toHaveBeenCalled();
    expect(spies.setSessionCookies).not.toHaveBeenCalled();
    expect(state.redis.size).toBe(0); // ни intent, ни кода входа не осталось
  });

  it("аккаунт VK уже у другого пользователя → ?error=vk_already_linked", async () => {
    const intent = await issueIntent("vk");
    await start("vk", `codeChallenge=${CHALLENGE}&intent=${intent}`);
    spies.linkOAuthIdentity.mockRejectedValueOnce(
      new AppError("Этот аккаунт VK уже привязан к другому пользователю.", 409, "VK_ALREADY_LINKED"),
    );

    const res = await vkCallbackFor(vkState());
    expect(appOutcome(res).get("error")).toBe("vk_already_linked");
  });

  it("согласий нет, а вход создал бы аккаунт → ?error=consent_required", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    spies.resolveOAuthLogin.mockResolvedValueOnce({ ok: false, reason: "consent_required" });

    const res = await vkCallbackFor(vkState());
    expect(appOutcome(res).get("error")).toBe("consent_required");
  });

  it("отказ на странице провайдера → ?error=access_denied, обмена кода нет", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const res = await vkCallback(
      new Request(`http://localhost/api/auth/vk/callback?error=access_denied&state=${vkState()}`),
    );
    expect(appOutcome(res).get("error")).toBe("access_denied");
    expect(spies.exchangeVkCodeForToken).not.toHaveBeenCalled();
  });

  it("state в адресе не совпал с флоу → ?error=state_invalid", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    // Кука флоу привязана к state из куки; адрес принёс другой.
    const res = await vkCallback(
      new Request("http://localhost/api/auth/vk/callback?code=c&state=forged-state&device_id=d"),
    );
    expect(appOutcome(res).get("error")).toBe("state_invalid");
    expect(spies.exchangeVkCodeForToken).not.toHaveBeenCalled();
  });

  it("килсвитч на колбэке: флоу приложения получает отказ в приложение, веб — прежний 503", async () => {
    await start("vk", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const flowState = vkState();
    state.vkEnabled = false;

    expect(appOutcome(await vkCallbackFor(flowState)).get("error")).toBe("provider_unavailable");

    state.jar.clear();
    const web = await vkCallbackFor(flowState);
    expect(web.status).toBe(503);
  });

  it("Яндекс: тот же путь — код в приложение, затем обмен", async () => {
    await start("yandex", `codeChallenge=${CHALLENGE}&${CONSENTED}`);
    const flowState = readSignedYandexCookieValue(state.jar.get(YANDEX_STATE_COOKIE)) as string;

    const res = await yandexCallback(
      new Request(`http://localhost/api/auth/yandex/callback?code=provider-code&state=${flowState}`),
    );
    const code = appOutcome(res).get("code") as string;
    expect(spies.resolveOAuthLogin).toHaveBeenCalledWith(
      expect.objectContaining({ identity: { provider: "yandex", profile: expect.objectContaining({ id: "ya-1" }) } }),
    );

    const exchanged = await exchangeCode(code);
    expect(exchanged.status).toBe(200);
  });
});

// ── Колбэк: веб-флоу не изменился ───────────────────────────────────────────

describe("колбэк провайдера, веб-флоу", () => {
  function seedWebFlow(flowState: string) {
    state.jar.set(VK_ID_STATE_COOKIE, signVkCookieValue(flowState));
    state.jar.set(VK_ID_VERIFIER_COOKIE, signVkCookieValue("web-verifier"));
    state.jar.set(VK_CONSENT_COOKIE, signConsentCookieValue(flowState, { terms: true, pdProcessing: true, marketing: false }));
  }

  it("без куки флоу приложения — куки сессии и редирект в кабинет, как до A2", async () => {
    seedWebFlow("web-state");
    const res = await vkCallbackFor("web-state");

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/cabinet");
    expect(spies.setSessionCookies).toHaveBeenCalledTimes(1);
    expect(state.redis.size).toBe(0);
  });

  it("кука флоу приложения от ДРУГОГО state (брошенный мобильный вход) не перехватывает веб-вход", async () => {
    seedWebFlow("web-state");
    state.jar.set(
      MOBILE_OAUTH_FLOW_COOKIE.vk,
      signMobileOAuthFlowCookieValue({ state: "old-mobile-state", provider: "vk", codeChallenge: CHALLENGE, linkUserId: null }),
    );

    const res = await vkCallbackFor("web-state");

    expect(res.headers.get("location")).toBe("/cabinet");
    expect(spies.setSessionCookies).toHaveBeenCalledTimes(1);
    expect(state.jar.has(MOBILE_OAUTH_FLOW_COOKIE.vk)).toBe(false); // одноразовая пачка погашена
  });

  it("веб-привязка по-прежнему идёт к сессии браузера", async () => {
    seedWebFlow("web-state");
    spies.getSessionUser.mockResolvedValue({ id: "web-user", phone: null, roles: ["CLIENT"] });

    await vkCallbackFor("web-state");

    expect(spies.linkOAuthIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "web-user" }) }),
    );
  });
});

// ── link-intent ──────────────────────────────────────────────────────────────

describe("POST /api/mobile/v1/auth/oauth/{provider}/link-intent", () => {
  it("без сессии → 401", async () => {
    const res = await linkIntent(postJson("/api/mobile/v1/auth/oauth/vk/link-intent", {}), params({ provider: "vk" }));
    expect(res.status).toBe(401);
  });

  it("с сессией → { intent }, no-store, в Redis лежит хэш, а не сам токен", async () => {
    spies.getSessionUser.mockResolvedValueOnce({ id: "u-app", phone: null, roles: ["CLIENT"] });
    const res = await linkIntent(postJson("/api/mobile/v1/auth/oauth/vk/link-intent", {}), params({ provider: "vk" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { intent } = ((await res.json()) as { data: { intent: string } }).data;
    expect(intent).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const keys = [...state.redis.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(intent);
    expect(JSON.parse(state.redis.get(keys[0]) as string)).toEqual({ userId: "u-app", provider: "vk" });
  });

  it("неизвестный провайдер → 404; выключенный → 503", async () => {
    spies.getSessionUser.mockResolvedValue({ id: "u-app", phone: null, roles: ["CLIENT"] });
    const unknown = await linkIntent(
      postJson("/api/mobile/v1/auth/oauth/google/link-intent", {}),
      params({ provider: "google" }),
    );
    expect(unknown.status).toBe(404);

    state.vkEnabled = false;
    const disabled = await linkIntent(postJson("/api/mobile/v1/auth/oauth/vk/link-intent", {}), params({ provider: "vk" }));
    expect(disabled.status).toBe(503);
  });

  it("Redis недоступен → 503 SERVICE_UNAVAILABLE", async () => {
    spies.getSessionUser.mockResolvedValue({ id: "u-app", phone: null, roles: ["CLIENT"] });
    state.redisUp = false;
    const res = await linkIntent(postJson("/api/mobile/v1/auth/oauth/vk/link-intent", {}), params({ provider: "vk" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

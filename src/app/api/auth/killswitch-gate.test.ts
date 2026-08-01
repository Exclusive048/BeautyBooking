import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * AUTH-KILLSWITCH-ENFORCE-01 — server-side enabled-flag gating on the auth
 * provider routes (VK / Yandex OAuth start+callback, VK integrations connect,
 * Telegram connect link). Proves the FZ-199 kill-switch is enforced at the
 * ROUTE, not just hidden in the UI:
 *  - flag DISABLED → the route refuses (503 / redirect) and the foreign-auth
 *    mechanism (OAuth exchange, hash verify, link, session) is NEVER invoked,
 *    even with creds present;
 *  - flag ENABLED → the route is NOT short-circuited (the gate doesn't leak
 *    into the working flow);
 *  - unlink (a removal, not a mechanism invocation) stays working when disabled.
 *
 * Route handlers are exercised directly with the provider flags mocked; the
 * Phase-0 characterization tests (vk/yandex cookies+oauth, telegram) cover the
 * enabled linking/session internals and stay green unchanged.
 */

const flags = vi.hoisted(() => ({ vk: false, yandex: false, tg: false }));

const spies = vi.hoisted(() => ({
  buildVkAuthorizeUrl: vi.fn(() => "https://vk.com/authorize?x=1"),
  exchangeVkCodeForToken: vi.fn(),
  fetchVkProfile: vi.fn(),
  buildYandexAuthorizeUrl: vi.fn(() => "https://oauth.yandex.ru/authorize?x=1"),
  exchangeYandexCodeForToken: vi.fn(),
  fetchYandexProfile: vi.fn(),
  verifyTelegramLogin: vi.fn(() => true),
  getSessionUser: vi.fn(async () => null as unknown),
  setSessionCookies: vi.fn(),
  requireAuth: vi.fn(async () => ({ ok: true, user: { id: "u1", roles: ["CLIENT"], phone: null } })),
  vkLinkUpdateMany: vi.fn(async () => ({ count: 1 })),
  generateTelegramLinkToken: vi.fn(async () => ({ token: "tok", expiresAt: "2026-01-01T00:00:00.000Z" })),
}));

vi.mock("@/lib/env", () => ({
  get isVkAuthEnabled() {
    return flags.vk;
  },
  get isYandexAuthEnabled() {
    return flags.yandex;
  },
  isProduction: false,
  env: {
    TELEGRAM_BOT_TOKEN: "bot-token",
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: "mybot",
    // RKN-FIX-01: the start routes now also sign a consent cookie (HMAC over
    // this secret), so the mocked env has to carry it.
    AUTH_JWT_SECRET: "x".repeat(64),
  },
}));

vi.mock("@/lib/telegram/feature", () => ({
  getTelegramEnabled: vi.fn(async () => flags.tg),
}));

// Quiet the 5xx alert side-effect of `fail(..., 503, ...)`.
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

const cookieStore = { get: vi.fn(() => undefined), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vkLink: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: spies.vkLinkUpdateMany },
    yandexLink: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    userProfile: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    telegramLink: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: spies.getSessionUser,
  setSessionCookies: spies.setSessionCookies,
}));
vi.mock("@/lib/auth/guards", () => ({ requireAuth: spies.requireAuth }));
vi.mock("@/lib/auth/cabinet-redirect", () => ({
  resolveCabinetRedirect: vi.fn(async () => ({ target: "/cabinet" })),
}));
vi.mock("@/lib/auth/roles", () => ({ ensureClientRoleForUser: vi.fn(async (_id: string, r: unknown) => r) }));
vi.mock("@/lib/billing/ensure-free-subscription", () => ({ ensureFreeSubscriptionsForRoles: vi.fn() }));
vi.mock("@/lib/http/origin", () => ({ nextRedirect: vi.fn(() => new Response(null, { status: 307 })) }));

vi.mock("@/lib/vk/oauth", () => ({
  buildVkAuthorizeUrl: spies.buildVkAuthorizeUrl,
  requireVkRedirectUri: vi.fn(() => "https://app.example/callback"),
  exchangeVkCodeForToken: spies.exchangeVkCodeForToken,
  fetchVkProfile: spies.fetchVkProfile,
}));
vi.mock("@/lib/vk/pkce", () => ({ generateCodeChallenge: () => "chal", generateCodeVerifier: () => "ver" }));
vi.mock("@/lib/vk/cookies", () => ({
  signVkCookieValue: (v: string) => v,
  readSignedVkCookieValue: (v?: string) => v,
  VK_ID_STATE_COOKIE: "vk_state",
  VK_ID_VERIFIER_COOKIE: "vk_ver",
  VK_ID_STATE_TTL_SECONDS: 600,
}));

vi.mock("@/lib/yandex/oauth", () => ({
  buildYandexAuthorizeUrl: spies.buildYandexAuthorizeUrl,
  requireYandexRedirectUri: vi.fn(() => "https://app.example/yandex/callback"),
  exchangeYandexCodeForToken: spies.exchangeYandexCodeForToken,
  fetchYandexProfile: spies.fetchYandexProfile,
}));
vi.mock("@/lib/yandex/pkce", () => ({ generateCodeChallenge: () => "chal", generateCodeVerifier: () => "ver" }));
vi.mock("@/lib/yandex/cookies", () => ({
  signYandexCookieValue: (v: string) => v,
  readSignedYandexCookieValue: (v?: string) => v,
  YANDEX_STATE_COOKIE: "y_state",
  YANDEX_VERIFIER_COOKIE: "y_ver",
  YANDEX_STATE_TTL_SECONDS: 600,
}));

vi.mock("@/lib/auth/telegram", () => ({ verifyTelegramLogin: spies.verifyTelegramLogin }));
vi.mock("@/lib/telegram/config", () => ({ getTelegramBotUsername: () => "mybot" }));
vi.mock("@/lib/telegram/linking", () => ({ generateTelegramLinkToken: spies.generateTelegramLinkToken }));
vi.mock("@/lib/telegram/links", () => ({ getTelegramLinkSummary: vi.fn(async () => ({ linked: false, enabled: false })) }));

import { GET as vkStart } from "@/app/api/auth/vk/start/route";
import { GET as vkCallback } from "@/app/api/auth/vk/callback/route";
import { POST as vkUnlink } from "@/app/api/auth/vk/unlink/route";
import { GET as vkIntStart } from "@/app/api/integrations/vk/start/route";
import { GET as vkIntCallback } from "@/app/api/integrations/vk/callback/route";
import { GET as yandexStart } from "@/app/api/auth/yandex/start/route";
import { GET as yandexCallback } from "@/app/api/auth/yandex/callback/route";
import { POST as tgLinkPost, GET as tgLinkGet } from "@/app/api/auth/telegram/link/route";
import { GET as tgConnectLink } from "@/app/api/telegram/link/route";

function req(url = "http://localhost/api/test"): Request {
  return new Request(url);
}
async function code(res: Response): Promise<string> {
  return JSON.stringify(await res.json());
}

describe("AUTH-KILLSWITCH-ENFORCE-01 — route-level enabled-flag gating", () => {
  beforeEach(() => {
    flags.vk = false;
    flags.yandex = false;
    flags.tg = false;
    vi.clearAllMocks();
    spies.getSessionUser.mockResolvedValue(null);
    spies.requireAuth.mockResolvedValue({ ok: true, user: { id: "u1", roles: ["CLIENT"], phone: null } });
    spies.verifyTelegramLogin.mockReturnValue(true);
    spies.buildVkAuthorizeUrl.mockReturnValue("https://vk.com/authorize?x=1");
    spies.buildYandexAuthorizeUrl.mockReturnValue("https://oauth.yandex.ru/authorize?x=1");
    spies.vkLinkUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("VK (isVkAuthEnabled)", () => {
    it("start disabled → 503, no authorize URL built", async () => {
      const res = await vkStart(req());
      expect(res.status).toBe(503);
      expect(await code(res)).toContain("SERVICE_UNAVAILABLE");
      expect(spies.buildVkAuthorizeUrl).not.toHaveBeenCalled();
    });

    it("callback disabled → 503, no token exchange / session (creds present)", async () => {
      const res = await vkCallback(
        req("http://localhost/api/auth/vk/callback?code=c&state=s&device_id=d"),
      );
      expect(res.status).toBe(503);
      expect(spies.exchangeVkCodeForToken).not.toHaveBeenCalled();
      expect(spies.setSessionCookies).not.toHaveBeenCalled();
    });

    it("integrations start disabled → 503, no authorize URL built", async () => {
      const res = await vkIntStart();
      expect(res.status).toBe(503);
      expect(spies.buildVkAuthorizeUrl).not.toHaveBeenCalled();
      expect(spies.requireAuth).not.toHaveBeenCalled();
    });

    it("integrations callback disabled → 503, no link (payload present)", async () => {
      const payload = encodeURIComponent(JSON.stringify({ code: "c", state: "s", device_id: "d" }));
      const res = await vkIntCallback(req(`http://localhost/api/integrations/vk/callback?payload=${payload}`));
      expect(res.status).toBe(503);
      expect(spies.exchangeVkCodeForToken).not.toHaveBeenCalled();
    });

    it("enabled → NOT short-circuited (redirects to VK, gate doesn't leak)", async () => {
      flags.vk = true;
      // RKN-FIX-01 added a consent gate to `start`; this test is about the
      // kill-switch, so it supplies the consent the login form would.
      const res = await vkStart(req("http://localhost/api/auth/vk/start?terms=1&pd=1&marketing=0"));
      expect(spies.buildVkAuthorizeUrl).toHaveBeenCalledOnce();
      expect([302, 307, 308]).toContain(res.status);
      expect(res.headers.get("location")).toContain("vk.com");
    });

    it("unlink stays working when disabled (removal is not gated)", async () => {
      flags.vk = false;
      spies.getSessionUser.mockResolvedValue({ id: "u1", roles: ["CLIENT"], phone: null });
      const res = await vkUnlink(req());
      expect(res.status).toBe(200);
      expect(spies.vkLinkUpdateMany).toHaveBeenCalledOnce();
    });
  });

  describe("Yandex (isYandexAuthEnabled)", () => {
    it("start disabled → 503, no authorize URL built", async () => {
      const res = await yandexStart(req());
      expect(res.status).toBe(503);
      expect(await code(res)).toContain("SERVICE_UNAVAILABLE");
      expect(spies.buildYandexAuthorizeUrl).not.toHaveBeenCalled();
    });

    it("callback disabled → 503, no token exchange / session", async () => {
      const res = await yandexCallback(req("http://localhost/api/auth/yandex/callback?code=c&state=s"));
      expect(res.status).toBe(503);
      expect(spies.exchangeYandexCodeForToken).not.toHaveBeenCalled();
      expect(spies.setSessionCookies).not.toHaveBeenCalled();
    });

    it("enabled → NOT short-circuited (redirects to Yandex)", async () => {
      flags.yandex = true;
      // RKN-FIX-01 consent params — see the VK case above.
      const res = await yandexStart(req("http://localhost/api/auth/yandex/start?terms=1&pd=1&marketing=0"));
      expect(spies.buildYandexAuthorizeUrl).toHaveBeenCalledOnce();
      expect([302, 307, 308]).toContain(res.status);
      expect(res.headers.get("location")).toContain("yandex.ru");
    });
  });

  describe("Telegram (getTelegramEnabled)", () => {
    it("connect link POST disabled → 503 SYSTEM_FEATURE_DISABLED, no hash verify / session", async () => {
      const res = await tgLinkPost(
        new Request("http://localhost/api/auth/telegram/link", {
          method: "POST",
          body: JSON.stringify({}),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(503);
      expect(await code(res)).toContain("SYSTEM_FEATURE_DISABLED");
      expect(spies.verifyTelegramLogin).not.toHaveBeenCalled();
      expect(spies.getSessionUser).not.toHaveBeenCalled();
    });

    it("connect link GET (redirect mode) disabled → back to profile with telegram=unconfigured", async () => {
      const res = await tgLinkGet(
        new NextRequest("http://localhost/api/auth/telegram/link?id=1&first_name=A&auth_date=1&hash=h"),
      );
      expect([302, 307, 308]).toContain(res.status);
      expect(res.headers.get("location")).toContain("telegram=unconfigured");
      expect(spies.getSessionUser).not.toHaveBeenCalled();
    });

    it("bot-DM connect-link generation disabled → 503, no token / auth", async () => {
      const res = await tgConnectLink();
      expect(res.status).toBe(503);
      expect(spies.generateTelegramLinkToken).not.toHaveBeenCalled();
      expect(spies.requireAuth).not.toHaveBeenCalled();
    });

    it("enabled → NOT short-circuited (generates the connect link)", async () => {
      flags.tg = true;
      const res = await tgConnectLink();
      expect(spies.requireAuth).toHaveBeenCalledOnce();
      expect(spies.generateTelegramLinkToken).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
    });
  });
});

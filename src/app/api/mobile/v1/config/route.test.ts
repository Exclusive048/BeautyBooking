import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A — `GET /api/mobile/v1/config`.
 *
 * Пиннится: форма ответа (её разбирает приложение до входа), версии — из env,
 * флаги — действующие значения тех же источников, что у веба, `push` —
 * выключатель отправки И хотя бы один провайдер (MOBILE-B2), правовые ссылки —
 * от канонического адреса, ответ — в разделяемом кэше справочников.
 */

const state = vi.hoisted(() => ({
  paymentsEnabled: true,
  onlinePaymentsRow: { value: true } as { value: unknown } | null,
  visualSearch: true,
  pushSwitch: false,
  fcm: false,
  apns: false,
  rustore: false,
}));
const findUnique = vi.hoisted(() => vi.fn(async () => state.onlinePaymentsRow));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "https://masterryadom.ru",
    MOBILE_MIN_VERSION_IOS: "1.0.0",
    MOBILE_MIN_VERSION_ANDROID: "1.1.0",
    MOBILE_LATEST_VERSION_IOS: "1.2.0",
    MOBILE_LATEST_VERSION_ANDROID: "1.3.0",
  },
  isProduction: false,
  get isPaymentsEnabled() {
    return state.paymentsEnabled;
  },
  // MOBILE-B2: те же формулы, что в `env.ts`.
  get isMobilePushSwitchOn() {
    return state.pushSwitch;
  },
  get isFcmConfigured() {
    return state.fcm;
  },
  get isApnsConfigured() {
    return state.apns;
  },
  get isRustorePushConfigured() {
    return state.rustore;
  },
  get isMobilePushEnabled() {
    return state.pushSwitch && (state.fcm || state.apns || state.rustore);
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { systemConfig: { findUnique } } }));
vi.mock("@/lib/auth/auth-methods", () => ({
  resolveAuthMethods: vi.fn(async () => ({ phone: true, email: true, vk: false, yandex: true, telegram: false })),
}));
vi.mock("@/lib/visual-search/config", () => ({ getVisualSearchEnabled: vi.fn(async () => state.visualSearch) }));

import { PUBLIC_REFERENCE_CACHE_CONTROL } from "@/lib/api/cache-headers";
import { GET } from "@/app/api/mobile/v1/config/route";

beforeEach(() => {
  state.paymentsEnabled = true;
  state.onlinePaymentsRow = { value: true };
  state.visualSearch = true;
  state.pushSwitch = false;
  state.fcm = false;
  state.apns = false;
  state.rustore = false;
  findUnique.mockClear();
});

describe("GET /api/mobile/v1/config", () => {
  it("полная форма ответа + кэш справочников", async () => {
    const res = await GET(
      new Request("http://localhost/api/mobile/v1/config", { headers: { "x-forwarded-host": "evil.example" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(PUBLIC_REFERENCE_CACHE_CONTROL);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        minVersion: { ios: "1.0.0", android: "1.1.0" },
        latestVersion: { ios: "1.2.0", android: "1.3.0" },
        authMethods: { phone: true, email: true, vk: false, yandex: true, telegram: false },
        features: { visualSearch: true, onlinePayments: true, push: false },
        pushProviders: { fcm: false, apns: false, rustore: false },
        legal: {
          // Канонический адрес из env, а не подставленный x-forwarded-host.
          termsUrl: "https://masterryadom.ru/terms",
          privacyUrl: "https://masterryadom.ru/privacy",
          consentUrl: "https://masterryadom.ru/consent",
        },
      },
    });
  });

  it("онлайн-оплата: без кредов ЮKassa — false, БД не спрашивается", async () => {
    state.paymentsEnabled = false;
    const body = await (await GET(new Request("http://localhost/api/mobile/v1/config"))).json();
    expect(body.data.features.onlinePayments).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("онлайн-оплата: тумблер админа не выставлен — по умолчанию выключено", async () => {
    state.onlinePaymentsRow = null;
    const body = await (await GET(new Request("http://localhost/api/mobile/v1/config"))).json();
    expect(body.data.features.onlinePayments).toBe(false);
  });

  it("визуальный поиск — действующее значение", async () => {
    state.visualSearch = false;
    const body = await (await GET(new Request("http://localhost/api/mobile/v1/config"))).json();
    expect(body.data.features.visualSearch).toBe(false);
  });

  describe("push (MOBILE-B2)", () => {
    const read = async () =>
      (await (await GET(new Request("http://localhost/api/mobile/v1/config"))).json()) as {
        data: { features: { push: boolean }; pushProviders: Record<string, boolean> };
      };

    it("провайдеры настроены, выключатель выключен (по умолчанию) — push false, провайдеров нет", async () => {
      state.fcm = true;
      state.apns = true;
      state.rustore = true;
      const { data } = await read();
      expect(data.features.push).toBe(false);
      expect(data.pushProviders).toEqual({ fcm: false, apns: false, rustore: false });
    });

    it("выключатель включён, но ни одного провайдера — push false", async () => {
      state.pushSwitch = true;
      const { data } = await read();
      expect(data.features.push).toBe(false);
      expect(data.pushProviders).toEqual({ fcm: false, apns: false, rustore: false });
    });

    it("выключатель включён и есть провайдер — push true, отмечены только настроенные", async () => {
      state.pushSwitch = true;
      state.apns = true;
      state.rustore = true;
      const { data } = await read();
      expect(data.features.push).toBe(true);
      expect(data.pushProviders).toEqual({ fcm: false, apns: true, rustore: true });
    });
  });
});

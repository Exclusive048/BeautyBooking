import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `/.well-known/assetlinks.json` и
 * `/.well-known/apple-app-site-association`: настоящие обработчики App Router
 * с подменённым env. Тест лежит вне `.well-known`: каталоги с точкой не
 * попадают в поиск тестов vitest, сами модули импортируются обычным путём.
 */

const mockEnv = vi.hoisted(() => ({
  MOBILE_ANDROID_PACKAGE: undefined as string | undefined,
  MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: undefined as string | undefined,
  MOBILE_IOS_APP_IDS: undefined as string | undefined,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: mockEnv };
});

import { GET as getAssetLinks } from "./.well-known/assetlinks.json/route";
import { GET as getAppleAssociation } from "./.well-known/apple-app-site-association/route";

const FINGERPRINT = Array.from({ length: 32 }, () => "1F").join(":");

beforeEach(() => {
  mockEnv.MOBILE_ANDROID_PACKAGE = undefined;
  mockEnv.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS = undefined;
  mockEnv.MOBILE_IOS_APP_IDS = undefined;
});

describe("GET /.well-known/assetlinks.json", () => {
  it("не настроено — 404 без тела и без кэша", async () => {
    const response = getAssetLinks();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("настроено — 200 application/json, публичный кэш на час", async () => {
    mockEnv.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS = FINGERPRINT.toLowerCase();
    const response = getAssetLinks();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("location")).toBeNull();
    const body = await response.json();
    expect(body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: {
          namespace: "android_app",
          package_name: "ru.masterryadom",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it("пакет из env", async () => {
    mockEnv.MOBILE_ANDROID_PACKAGE = "ru.masterryadom.dev";
    mockEnv.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS = FINGERPRINT;
    const body = await getAssetLinks().json();
    expect(body[0].target.package_name).toBe("ru.masterryadom.dev");
  });
});

describe("GET /.well-known/apple-app-site-association", () => {
  it("не настроено — 404 без тела и без кэша", async () => {
    const response = getAppleAssociation();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("настроено — 200 application/json: appIDs, components /u/* и /models/*, webcredentials", async () => {
    mockEnv.MOBILE_IOS_APP_IDS = "ABCDE12345.ru.masterryadom";
    const response = getAppleAssociation();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = await response.json();
    expect(body).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDE12345.ru.masterryadom"],
            components: [
              { "/": "/u/*", comment: "Страница мастера или студии" },
              { "/": "/models/*", comment: "Предложение для моделей" },
            ],
          },
        ],
      },
      webcredentials: { apps: ["ABCDE12345.ru.masterryadom"] },
    });
  });

  it("Android настроен, iOS нет — iOS-файл всё равно 404", () => {
    mockEnv.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS = FINGERPRINT;
    expect(getAppleAssociation().status).toBe(404);
    expect(getAssetLinks().status).toBe(200);
  });
});

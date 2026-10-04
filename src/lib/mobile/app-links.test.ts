import { describe, expect, it } from "vitest";
import { envSchemaForTests } from "@/lib/env";
import {
  APP_LINK_PATHS,
  DEFAULT_ANDROID_PACKAGE,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  readAppLinksConfig,
} from "@/lib/mobile/app-links";

/**
 * MOBILE-POLISH — содержимое файлов App Links / Universal Links. Ответы
 * роутов (статус, заголовки) — `src/app/well-known-app-links.test.ts`.
 */

const FP_A = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");
const FP_B = Array.from({ length: 32 }, () => "AB").join(":");

describe("readAppLinksConfig", () => {
  it("пусто — пакет по умолчанию, списков нет", () => {
    expect(readAppLinksConfig({})).toEqual({
      androidPackage: DEFAULT_ANDROID_PACKAGE,
      androidFingerprints: [],
      iosAppIds: [],
    });
  });

  it("списки через запятую: пробелы, повторы и регистр отпечатков", () => {
    const config = readAppLinksConfig({
      MOBILE_ANDROID_PACKAGE: " ru.masterryadom.beta ",
      MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: ` ${FP_A} , ${FP_B},${FP_A.toUpperCase()},`,
      MOBILE_IOS_APP_IDS: "ABCDE12345.ru.masterryadom, ABCDE12345.ru.masterryadom",
    });
    expect(config.androidPackage).toBe("ru.masterryadom.beta");
    expect(config.androidFingerprints).toEqual([FP_A.toUpperCase(), FP_B]);
    expect(config.iosAppIds).toEqual(["ABCDE12345.ru.masterryadom"]);
  });

  it("непохожее отбрасывается (в dev env не парсится)", () => {
    const config = readAppLinksConfig({
      MOBILE_ANDROID_PACKAGE: "not a package",
      MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB, sha256-garbage",
      MOBILE_IOS_APP_IDS: "ru.masterryadom, abcde12345.ru.masterryadom",
    });
    expect(config).toEqual({ androidPackage: DEFAULT_ANDROID_PACKAGE, androidFingerprints: [], iosAppIds: [] });
  });
});

describe("assetlinks.json", () => {
  it("без отпечатков — не настроено", () => {
    expect(buildAssetLinks(readAppLinksConfig({}))).toBeNull();
  });

  it("пакет, отпечатки и связь «все ссылки домена»", () => {
    const doc = buildAssetLinks(
      readAppLinksConfig({ MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: `${FP_A},${FP_B}` }),
    );
    expect(doc).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
        target: {
          namespace: "android_app",
          package_name: "ru.masterryadom",
          sha256_cert_fingerprints: [FP_A.toUpperCase(), FP_B],
        },
      },
    ]);
  });
});

describe("apple-app-site-association", () => {
  it("без App ID — не настроено", () => {
    expect(buildAppleAppSiteAssociation(readAppLinksConfig({}))).toBeNull();
  });

  it("современная форма: appIDs + components на /u/* и /models/*, плюс webcredentials", () => {
    const doc = buildAppleAppSiteAssociation(
      readAppLinksConfig({ MOBILE_IOS_APP_IDS: "ABCDE12345.ru.masterryadom,ZYXWV98765.ru.masterryadom" }),
    );
    const appIds = ["ABCDE12345.ru.masterryadom", "ZYXWV98765.ru.masterryadom"];
    expect(doc?.applinks.details).toHaveLength(1);
    expect(doc?.applinks.details[0]?.appIDs).toEqual(appIds);
    expect(doc?.applinks.details[0]?.components.map((c) => c["/"])).toEqual(["/u/*", "/models/*"]);
    expect(doc?.webcredentials).toEqual({ apps: appIds });
    expect(APP_LINK_PATHS).toEqual(["/u/*", "/models/*"]);
  });
});

describe("env: формат проверяется на старте", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    AUTH_JWT_SECRET: "x".repeat(32),
    OTP_HMAC_SECRET: "y".repeat(16),
  };

  const issuesFor = (extra: Record<string, string>) => {
    const parsed = envSchemaForTests.safeParse({ ...base, ...extra });
    return parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0]));
  };

  it("верные значения и пустые проходят", () => {
    const keys = ["MOBILE_ANDROID_PACKAGE", "MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS", "MOBILE_IOS_APP_IDS"];
    const configured = issuesFor({
      MOBILE_ANDROID_PACKAGE: "ru.masterryadom",
      MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: `${FP_A}, ${FP_B}`,
      MOBILE_IOS_APP_IDS: "ABCDE12345.ru.masterryadom",
    });
    const empty = issuesFor({ MOBILE_ANDROID_PACKAGE: "", MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: "", MOBILE_IOS_APP_IDS: "" });
    expect(configured.filter((key) => keys.includes(key))).toEqual([]);
    expect(empty.filter((key) => keys.includes(key))).toEqual([]);
  });

  it.each([
    ["MOBILE_ANDROID_PACKAGE", "masterryadom"],
    ["MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS", "AA:BB:CC"],
    ["MOBILE_IOS_APP_IDS", "ru.masterryadom"],
  ])("%s=%s отвергается", (key, value) => {
    expect(issuesFor({ [key]: value })).toContain(key);
  });
});

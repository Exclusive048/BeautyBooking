import "server-only";

import { NextResponse } from "next/server";
import {
  ANDROID_CERT_FINGERPRINT_PATTERN,
  ANDROID_PACKAGE_PATTERN,
  IOS_APP_ID_PATTERN,
  env,
  splitEnvList,
} from "@/lib/env";

/**
 * MOBILE-POLISH — файлы App Links (Android) и Universal Links (iOS).
 *
 * По ним система решает, открывать ли ссылку `https://masterryadom.ru/…` сразу
 * в приложении. В приложение ведут ровно две ветки сайта — те же адреса, что у
 * веба (`app/routes.dart`):
 *   · `/u/*` — страница мастера или студии (и запись к ним);
 *   · `/models/*` — предложение для моделей.
 * Всё остальное (кабинеты, вход, оплата) остаётся в браузере.
 *
 * Где лежат: `src/app/.well-known/{assetlinks.json,apple-app-site-association}/route.ts`
 * — обычные обработчики App Router (Next отдаёт `.well-known` как есть: каталог
 * с точкой не считается приватным, `trailingSlash` его не трогает). Прокси их
 * не держит: путь не `/api` (ни лимита, ни CSRF), сессия не обновляется
 * (`/.well-known` в `PUBLIC_PATHS` прокси — ответ кэшируемый, кука к нему
 * прилипать не должна). Редиректов нет: `next.config` их на этот путь не ставит.
 *
 * Не настроено (нет отпечатков / нет App ID) — 404 без тела и без кэша: так
 * обе платформы честно видят «у домена нет приложения», а включение не ждёт
 * истечения часа. Настроено — 200 `application/json`, публичный кэш на час.
 */

export const APP_LINK_PATHS = ["/u/*", "/models/*"] as const;

export const DEFAULT_ANDROID_PACKAGE = "ru.masterryadom";

const CACHE_CONFIGURED = "public, max-age=3600";
const CACHE_NOT_CONFIGURED = "no-store";

export type AppLinksConfig = {
  androidPackage: string;
  /** Отпечатки в верхнем регистре, `AA:BB:…`. */
  androidFingerprints: string[];
  iosAppIds: string[];
};

type AppLinksEnv = Pick<
  typeof env,
  "MOBILE_ANDROID_PACKAGE" | "MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS" | "MOBILE_IOS_APP_IDS"
>;

/**
 * Значения из env. Формат уже проверен на старте (`env.ts`), но в dev/тестах
 * env отдаётся без парса — поэтому непохожее отбрасывается и здесь, а не
 * попадает в файл, который читают Google и Apple.
 */
export function readAppLinksConfig(source: AppLinksEnv = env): AppLinksConfig {
  const rawPackage = source.MOBILE_ANDROID_PACKAGE?.trim() ?? "";
  return {
    androidPackage: ANDROID_PACKAGE_PATTERN.test(rawPackage) ? rawPackage : DEFAULT_ANDROID_PACKAGE,
    androidFingerprints: Array.from(
      new Set(
        splitEnvList(source.MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS)
          .filter((item) => ANDROID_CERT_FINGERPRINT_PATTERN.test(item))
          .map((item) => item.toUpperCase()),
      ),
    ),
    iosAppIds: splitEnvList(source.MOBILE_IOS_APP_IDS).filter((item) => IOS_APP_ID_PATTERN.test(item)),
  };
}

export type AssetLinksStatement = {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

/**
 * `assetlinks.json`: приложению доверены ссылки домена (`handle_all_urls`;
 * какие именно пути — решает intent-filter манифеста: `/u/`, `/models/`) и
 * сохранённые на сайте учётные данные (`get_login_creds` — пара к
 * `webcredentials` у iOS, вреда нет: вход у нас по коду, паролей нет).
 * `null` — Android не настроен.
 */
export function buildAssetLinks(config: AppLinksConfig): AssetLinksStatement[] | null {
  if (config.androidFingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: config.androidPackage,
        sha256_cert_fingerprints: config.androidFingerprints,
      },
    },
  ];
}

export type AppleAppSiteAssociation = {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: Array<{ "/": string; comment: string }>;
    }>;
  };
  webcredentials: { apps: string[] };
};

const COMPONENT_COMMENTS: Record<(typeof APP_LINK_PATHS)[number], string> = {
  "/u/*": "Страница мастера или студии",
  "/models/*": "Предложение для моделей",
};

/**
 * `apple-app-site-association` в современной форме (iOS 13+): `appIDs` +
 * `components`; `*` в пути покрывает и вложенные сегменты (`/u/{ник}/book`).
 * `webcredentials` — автозаполнение входа с сайта, безвредно. `null` — iOS не
 * настроен.
 */
export function buildAppleAppSiteAssociation(config: AppLinksConfig): AppleAppSiteAssociation | null {
  if (config.iosAppIds.length === 0) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: config.iosAppIds,
          components: APP_LINK_PATHS.map((path) => ({ "/": path, comment: COMPONENT_COMMENTS[path] })),
        },
      ],
    },
    webcredentials: { apps: config.iosAppIds },
  };
}

/** 200 `application/json` с часовым публичным кэшем либо 404 без тела. */
export function wellKnownJsonResponse(document: unknown | null): NextResponse {
  if (document === null) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": CACHE_NOT_CONFIGURED } });
  }
  return NextResponse.json(document, {
    status: 200,
    headers: { "Cache-Control": CACHE_CONFIGURED },
  });
}

export function assetLinksResponse(config: AppLinksConfig = readAppLinksConfig()): NextResponse {
  return wellKnownJsonResponse(buildAssetLinks(config));
}

export function appleAppSiteAssociationResponse(config: AppLinksConfig = readAppLinksConfig()): NextResponse {
  return wellKnownJsonResponse(buildAppleAppSiteAssociation(config));
}

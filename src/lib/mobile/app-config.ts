import "server-only";

import { prisma } from "@/lib/prisma";
import { resolveAuthMethods } from "@/lib/auth/auth-methods";
import { env, isPaymentsEnabled } from "@/lib/env";
import { getVisualSearchEnabled } from "@/lib/visual-search/config";
import { getNativePushAvailability } from "@/lib/notifications/native-push/config";

/**
 * MOBILE-AUTH-A — конфиг нативного приложения (`GET /api/mobile/v1/config`).
 *
 * Один ответ на всех: ни сессии, ни роли, ни заголовков клиента он не читает
 * (кроме базового адреса для правовых ссылок, который в проде — канонический
 * `NEXT_PUBLIC_APP_URL`), поэтому кэшируется разделяемо, как справочники
 * (`PUBLIC_REFERENCE_API_PATHS`).
 *
 * Флаги — ДЕЙСТВУЮЩИЕ значения, те же формулы, что у веба: методы входа — из
 * `resolveAuthMethods()` (AUTH-GATE-01, телефон/почта/VK/Яндекс/Telegram);
 * визуальный поиск — env-потолок + тумблер админа (`getVisualSearchEnabled`);
 * онлайн-оплата — креды ЮKassa + тумблер `onlinePaymentsEnabled`.
 *
 * `push` (MOBILE-B2) — push в нативное приложение реально уходит: включён
 * выключатель `MOBILE_PUSH_SENDING_ENABLED` И настроен хотя бы один провайдер
 * (FCM / APNs / RuStore). `isPushEnabled` — это веб-push (VAPID), не он. Пока
 * `false`, приложение не просит разрешения на уведомления: на iOS системный
 * запрос показывается один раз, тратить его на push, который не придёт, нельзя.
 * `pushProviders` — через какие сервисы push сейчас уходит: приложение
 * регистрирует токен того, что есть на устройстве и отмечено здесь (Android
 * без сервисов Google — RuStore).
 */

export type MobilePlatformVersions = { ios: string; android: string };

export type MobileAppConfig = {
  minVersion: MobilePlatformVersions;
  latestVersion: MobilePlatformVersions;
  authMethods: { phone: boolean; email: boolean; vk: boolean; yandex: boolean; telegram: boolean };
  features: { visualSearch: boolean; onlinePayments: boolean; push: boolean };
  pushProviders: { fcm: boolean; apns: boolean; rustore: boolean };
  legal: { termsUrl: string; privacyUrl: string; consentUrl: string };
};

const ONLINE_PAYMENTS_SYSTEM_CONFIG_KEY = "onlinePaymentsEnabled";

async function getOnlinePaymentsEnabled(): Promise<boolean> {
  // Потолок — креды ЮKassa: без них тумблер админа ничего не включает, и БД
  // не спрашиваем вовсе.
  if (!isPaymentsEnabled) return false;
  const row = await prisma.systemConfig.findUnique({
    where: { key: ONLINE_PAYMENTS_SYSTEM_CONFIG_KEY },
    select: { value: true },
  });
  // Дефолт выключен — как у админки (`flags.service.ts`) и биллинга.
  return row?.value === true;
}

export async function buildMobileAppConfig(publicOrigin: string): Promise<MobileAppConfig> {
  const [methods, visualSearch, onlinePayments] = await Promise.all([
    resolveAuthMethods(),
    getVisualSearchEnabled(),
    getOnlinePaymentsEnabled(),
  ]);
  const push = getNativePushAvailability();

  return {
    minVersion: { ios: env.MOBILE_MIN_VERSION_IOS, android: env.MOBILE_MIN_VERSION_ANDROID },
    latestVersion: { ios: env.MOBILE_LATEST_VERSION_IOS, android: env.MOBILE_LATEST_VERSION_ANDROID },
    authMethods: {
      phone: methods.phone,
      email: methods.email,
      vk: methods.vk,
      yandex: methods.yandex,
      telegram: methods.telegram,
    },
    features: { visualSearch, onlinePayments, push: push.sending },
    pushProviders: push.providers,
    legal: {
      termsUrl: `${publicOrigin}/terms`,
      privacyUrl: `${publicOrigin}/privacy`,
      consentUrl: `${publicOrigin}/consent`,
    },
  };
}

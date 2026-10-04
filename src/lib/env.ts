import "server-only"; // ENV-SPLIT-01: серверная половина env — в клиентском бандле ей делать нечего
import { z } from "zod";

/**
 * ENV-SPLIT-01 — БЭК-половина env. Полная Zod-схема + fail-fast на старте.
 *
 * Клиентская половина — `src/lib/env.client.ts` (литерально-инлайнящийся
 * `NEXT_PUBLIC_*`-набор). `"use client"`-модулям импортировать ЭТОТ файл
 * нельзя — `server-only` уронит сборку, и это намеренно: раньше один модуль
 * обслуживал обе стороны через `typeof window`-фолбэки (QA-108/FIX-09/FIX-10),
 * и клиентский код свободно тянул серверные экспорты.
 *
 * Фиче-флагов здесь больше нет (решение владельца 2026-08-30): фича включена
 * тогда, когда она сконфигурирована. Удалены NEXT_PUBLIC_TELEGRAM_ENABLED,
 * NEXT_PUBLIC_VK_ENABLED, NEXT_PUBLIC_YANDEX_ENABLED,
 * NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED, PHONE_AUTH_ENABLED, EMAIL_AUTH_ENABLED,
 * SMS_PROVIDER_ENABLED, VISUAL_SEARCH_ENABLED, AI_FEATURES_ENABLED,
 * YOOKASSA_IP_ALLOWLIST_ENFORCED. Их инварианты переехали в computed-флаги
 * (см. блок внизу) и рефайны «id задан → остальные креды обязательны».
 */

/**
 * Канонические хосты публичного адреса (FIX-D1).
 *
 * Смена домена завершена (2026-09-01, DOMAIN-CUTOVER-01): прод — только
 * `masterryadom.ru`, все формы прежнего кириллического `мастеррядом.online`
 * (unicode + punycode) вычищены по команде владельца — в локстепе с
 * `PRODUCTION_ORIGINS` в `src/proxy.ts`. Значение `NEXT_PUBLIC_APP_URL` на
 * старом домене теперь роняет старт — это и есть желаемое поведение: откат
 * env к погашенному домену молча уводил бы письма, пуши и OAuth в никуда.
 *
 * `masterryadom.ru` — латиница, punycode-формы нет. `www` — на случай, если
 * фронт окажется за ним; лишним не будет, а его отсутствие стоило бы отказа
 * старта на верном по сути значении.
 */
const CANONICAL_PUBLIC_HOSTS = new Set([
  "masterryadom.ru",
  "www.masterryadom.ru",
]);

/** MOBILE-AUTH-A — версия приложения `MAJOR.MINOR.PATCH` (без `+build`). */
const MOBILE_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function mobileVersionSchema(fallback: string) {
  return z
    .string()
    .trim()
    .regex(MOBILE_VERSION_PATTERN, "must be MAJOR.MINOR.PATCH, e.g. 1.2.0")
    .default(fallback);
}

/**
 * MOBILE-POLISH — значения для файлов App Links / Universal Links
 * (`lib/mobile/app-links.ts`). Формат проверяется на старте; сам модуль ссылок
 * ещё раз отбрасывает непохожее (в dev/тестах env отдаётся без парса).
 */
export const ANDROID_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
export const ANDROID_CERT_FINGERPRINT_PATTERN = /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/;
export const IOS_APP_ID_PATTERN = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** Список из env через запятую: без пробелов по краям, без пустых и повторов. */
export function splitEnvList(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

/** Сравнение `MAJOR.MINOR.PATCH`: отрицательное — `a` раньше `b`, 0 — равны, положительное — `a` новее. */
export function compareMobileVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const envSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ── Required always ──────────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required — postgresql://user:pass@host:5432/db"),
  AUTH_JWT_SECRET: z
    .string()
    .min(32, "AUTH_JWT_SECRET must be at least 32 chars (generate: openssl rand -hex 64)"),
  OTP_HMAC_SECRET: z
    .string()
    .min(16, "OTP_HMAC_SECRET must be at least 16 chars (generate: openssl rand -hex 32)"),

  // ── Database ──────────────────────────────────────────────────────────────
  DIRECT_URL: z.string().optional(),

  // ── App URL ───────────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  APP_PUBLIC_URL: z.url().optional(),

  // ── Auth ──────────────────────────────────────────────────────────────────
  AUTH_COOKIE_NAME: z.string().min(1).default("bh_session"),

  // ── Trusted proxy / client-IP derivation (HARDENING-08 FIX-17) ────────────
  // Number of trusted reverse-proxy hops in front of the app. The client IP is
  // taken `TRUSTED_PROXY_HOPS` entries from the RIGHT of X-Forwarded-For (never
  // the client-spoofable leftmost). Default 1 = a single reverse proxy (the
  // docker-compose `127.0.0.1:3000` topology). Set to match prod exactly
  // (e.g. 2 for CDN+LB) — too-high re-opens the OTP rate-limit spoof.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
  // Optional dedicated real-IP header the edge OVERWRITES (e.g. "x-real-ip").
  // Only set when the edge is confirmed to set it — otherwise it's spoofable.
  TRUSTED_REAL_IP_HEADER: z.string().trim().default(""),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // ── Worker / cron ─────────────────────────────────────────────────────────
  WORKER_SECRET: z.string().optional(),
  BILLING_RENEW_SECRET: z.string().optional(),
  MRR_SNAPSHOT_SECRET: z.string().optional(),
  // CATALOG-AVAILABLE-TODAY: token gating the availableToday recompute trigger.
  // Fail-closed — the endpoint refuses when unset (never runs unauthenticated).
  AVAILABILITY_CRON_TOKEN: z.string().optional(),

  // ── Storage ───────────────────────────────────────────────────────────────
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_ROOT: z.string().optional(),
  MEDIA_LOCAL_PUBLIC_URL: z.string().optional(),
  MEDIA_DELIVERY_SECRET: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  // ── Telegram ──────────────────────────────────────────────────────────────
  // ENV-SPLIT-01: флаг NEXT_PUBLIC_TELEGRAM_ENABLED удалён. Пользовательский
  // Telegram включён наличием NEXT_PUBLIC_TELEGRAM_BOT_USERNAME (см.
  // `isTelegramEnabled` внизу); рефайн ниже требует к нему TELEGRAM_BOT_TOKEN
  // в проде. Выключить Telegram = убрать username из env; операционный
  // рантайм-выключатель остаётся у админа (SystemConfig, telegram/feature.ts) —
  // он работает НИЖЕ env-потолка, как и раньше. Внутренний ops-мониторинг
  // (MONITORING_TELEGRAM_*) — отдельная система, этим не затрагивается.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // SEC-14: жила мимо Zod (читалась через `process.env[...]` в
  // `telegram/config.ts`). Цена промаха конкретна: `getTelegramWebhookSecret`
  // при опечатке в имени возвращает null, а вебхук трактует null как «проверки
  // подлинности нет» и пропускает весь блок.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),

  // ── VK OAuth ──────────────────────────────────────────────────────────────
  // VK creds accept two name sets: the canonical `VK_*` (what the prod template
  // ships) and the `VK_ID_*` aliases (local dev / VK ID console naming). Both are
  // declared here so NEITHER bypasses Zod (VK_ID_*-SCHEMA-GAP fix): `vk/config.ts`
  // reads them via `env` (not `process.env`), alias-first then canonical.
  // ENV-SPLIT-01: флаг NEXT_PUBLIC_VK_ENABLED удалён — VK-вход включён наличием
  // client id (`isVkAuthEnabled` внизу); полноту кредов в проде требует рефайн.
  VK_CLIENT_ID: z.string().optional(),
  VK_CLIENT_SECRET: z.string().optional(),
  VK_REDIRECT_URI: z.string().optional(),
  VK_ID_CLIENT_ID: z.string().optional(),
  VK_ID_CLIENT_SECRET: z.string().optional(),
  VK_ID_REDIRECT_URI: z.string().optional(),

  // ── YooKassa ─────────────────────────────────────────────────────────────
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  // HARDENING-02: optional merchant-controlled URL query secret for the webhook,
  // NOT a signature/bearer token (YooKassa does not sign notifications). When set,
  // configure the ЛК webhook URL as
  // `https://<host>/api/payments/yookassa/webhook?token=<value>` and the route
  // requires a matching `?token=`. When unset the route still accepts and relies
  // on the worker's API re-fetch for authenticity.
  //
  // ENV-SPLIT-01: YOOKASSA_IP_ALLOWLIST_ENFORCED удалён — IP-allowlist вебхука
  // теперь ВСЕГДА log-only (это и была принятая прод-поза, см. PAY-SEC-01 в
  // webhook/route.ts: подлинность держит worker API re-fetch, инв. #5).
  YOOKASSA_WEBHOOK_TOKEN: z.string().optional(),

  // ── Push (VAPID) ─────────────────────────────────────────────────────────
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),

  // ── Native push в приложение (MOBILE-B2) ─────────────────────────────────
  // 🔴 Выключатель ОТПРАВКИ, а не конфигурации. Исключение из принципа
  // ENV-SPLIT-01 («включено = сконфигурировано») сделано осознанно и по
  // решению владельца: FCM и APNs — серверы Google и Apple за пределами РФ,
  // и до вердикта юриста по RKN-AUDIT-01 (152-ФЗ ст. 12) отправка выключена,
  // даже когда креды заведены (их заводят заранее — для стенда и проверки).
  // Регистрация устройств (`/api/mobile/v1/devices`) от него не зависит:
  // токены копятся, чтобы включение не ждало переустановки приложения.
  // Только `"true"` включает; пусто / `"false"` — выключено. Иное значение
  // («yes», «1», опечатка) отвергается на старте, а не трактуется молча.
  MOBILE_PUSH_SENDING_ENABLED: z.enum(["", "true", "false"]).optional(),
  // FCM HTTP v1 (Android с Google-сервисами): сервисный аккаунт Firebase —
  // `project_id`, `client_email`, `private_key` из JSON-ключа (Firebase
  // Console → Project settings → Service accounts → Generate new private key).
  // Ключ — PEM; переводы строк можно записать как `\n` в одну строку.
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  // APNs (iOS), токенная авторизация: ключ .p8 (Apple Developer → Keys →
  // «Apple Push Notifications service»), его Key ID, Team ID аккаунта и bundle
  // id приложения (= `apns-topic`). Окружение (sandbox / production) — у
  // каждого устройства своё, из регистрации.
  APNS_TEAM_ID: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  // RuStore Push (Android без Google-сервисов): консоль RuStore → приложение →
  // Push-уведомления → проекты: ID проекта и сервисный токен.
  RUSTORE_PUSH_PROJECT_ID: z.string().optional(),
  RUSTORE_PUSH_SERVICE_TOKEN: z.string().optional(),

  // ── Yandex ────────────────────────────────────────────────────────────────
  YANDEX_GEOCODER_API_KEY: z.string().optional(),
  YANDEX_SUGGEST_API_KEY: z.string().optional(),
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: z.string().optional(),

  // ── Yandex OAuth (Yandex ID) ───────────────────────────────────────────────
  // FIX-YANDEX-OAUTH; ENV-SPLIT-01: флаг NEXT_PUBLIC_YANDEX_ENABLED удалён —
  // кнопка появляется с регистрацией OAuth-приложения (наличие client id),
  // полноту кредов в проде требует рефайн ниже.
  YANDEX_OAUTH_CLIENT_ID: z.string().optional(),
  YANDEX_OAUTH_SECRET: z.string().optional(),
  YANDEX_OAUTH_REDIRECT_URI: z.string().optional(),

  // FIX-EXP-CONTENT-GRAMMAR (EXP-005): real legal ИНН for the footer requisites.
  // Optional — the footer shows an obvious "[не указан]" placeholder when unset
  // (never a fake-looking number). Set the real value before production launch
  // (see deploy-checklist «legal requisites»).
  NEXT_PUBLIC_LEGAL_INN: z.string().optional(),

  // FOOTER-VK: the platform's VK community URL for the footer social link.
  // Optional — the footer OMITS the VK icon entirely when unset, rather than
  // linking a stale/wrong handle. Set the real community URL before production
  // launch (see deploy-checklist «social links»).
  NEXT_PUBLIC_VK_COMMUNITY_URL: z.string().optional(),

  // ── AI — chat + visual-search both on Yandex ─────────────────────────────────
  // Chat surfaces (review-summary / review-reply / service-description / advisor)
  // flow through `src/lib/ai/client.ts`; visual search flows through
  // `src/lib/visual-search/provider.ts` (VISUAL-SEARCH-YANDEX-MIGRATION-01). Both
  // are wired to Yandex Cloud using YANDEX_API_KEY + YANDEX_FOLDER_ID.
  // ENV-SPLIT-01: флаги VISUAL_SEARCH_ENABLED / AI_FEATURES_ENABLED удалены —
  // обе фичи включены наличием этой пары ключей (`isAiFeaturesEnabled` /
  // `isVisualSearchEnabled` внизу). Рантайм-выключатели остаются у админа
  // (SystemConfig: aiFeaturesEnabled / visualSearchEnabled).
  YANDEX_API_KEY: z.string().optional(),
  YANDEX_FOLDER_ID: z.string().optional(),

  // ── SMTP ──────────────────────────────────────────────────────────────────
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SUPPORT_TO: z.string().optional(),
  // Partnership inquiries from /partners. Falls back to SUPPORT_TO when unset.
  SUPPORT_TO_PARTNERSHIP: z.string().optional(),

  // ── SMS provider (SMSC.ru — https://smsc.ru/api/) ─────────────────────────
  // ENV-SPLIT-01: SMS_PROVIDER_ENABLED удалён — провайдер включён наличием
  // логина+пароля (`isSmsConfigured` внизу). Вход по телефону в проде включён
  // ровно тогда же (`isPhoneAuthEnabled`) — см. инвариант OTP-in-logs там.
  SMS_PROVIDER_LOGIN: z.string().optional(),
  SMS_PROVIDER_PASSWORD: z.string().optional(),
  SMS_PROVIDER_SENDER: z.string().optional(),
  SMS_LOW_BALANCE_THRESHOLD: z.coerce.number().nonnegative().default(500),

  // ── Monitoring ────────────────────────────────────────────────────────────
  MONITORING_TELEGRAM_BOT_TOKEN: z.string().optional(),
  MONITORING_TELEGRAM_CHAT_ID: z.string().optional(),

  // ── Error tracking — GlitchTip (OBSERVABILITY-GLITCHTIP-01) ───────────────
  // GlitchTip is a self-hosted, Sentry-ingest-compatible backend. Self-hosting
  // keeps error payloads in-country (152-ФЗ), which SaaS Sentry cannot.
  //
  // Named GLITCHTIP_* rather than SENTRY_* deliberately: the Sentry SDK falls
  // back to reading `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE`
  // straight from `process.env`, which would bypass this schema (rule 11).
  // With these names the ONLY path into the SDK is `observability/config.ts`.
  //
  // Every var is optional and error tracking is OFF while the DSN is unset —
  // dev and CI behave exactly as they did before this feature landed.
  //
  // Server + worker DSN. Unset → `Sentry.init` is never called server-side.
  GLITCHTIP_DSN: z.string().optional(),
  // SEO-01: коды подтверждения прав на сайт — значение `content` мета-тега
  // из Яндекс Вебмастера и Google Search Console. Пусто — тега нет. Читает
  // только серверный root layout, поэтому без NEXT_PUBLIC_.
  YANDEX_SITE_VERIFICATION: z.string().trim().max(200).optional(),
  GOOGLE_SITE_VERIFICATION: z.string().trim().max(200).optional(),
  // Browser DSN — separate var (and can be a separate GlitchTip project) so
  // frontend noise never buries backend failures, and so enabling backend
  // tracking does not automatically ship a DSN to every visitor.
  NEXT_PUBLIC_GLITCHTIP_DSN: z.string().optional(),
  // Deployment label shown in GlitchTip. Defaults to NODE_ENV when unset.
  NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT: z.string().optional(),
  // Release identifier for grouping events by deploy (e.g. the git SHA).
  // Optional: readable stacks from minified client code additionally need
  // source-map upload, which is deferred to DevOps (see BACKLOG).
  NEXT_PUBLIC_GLITCHTIP_RELEASE: z.string().optional(),
  // Server-side error sampling. 1 = send everything (the right default for a
  // pre-launch product); lower it only if event volume becomes a disk problem.
  GLITCHTIP_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),

  // ── Timezone ─────────────────────────────────────────────────────────────
  DEFAULT_TIMEZONE: z.string().min(1).default("Europe/Moscow"),

  // ── Mobile app (MOBILE-AUTH-A) ─────────────────────────────────────────────
  // Отдаются приложению в `GET /api/mobile/v1/config`. Ниже `MIN` — экран
  // «Обновите приложение» (жёсткий барьер), ниже `LATEST` — мягкое
  // предложение обновиться. Формат — `MAJOR.MINOR.PATCH` без build-суффикса
  // (`+12` в `X-App-Version` клиент сравнивает сам). Дефолты безопасны:
  // `0.0.0` не блокирует ни одну сборку. Рефайн ниже не даёт выставить
  // минимум выше последней версии — иначе обновиться было бы не на что.
  MOBILE_MIN_VERSION_IOS: mobileVersionSchema("0.0.0"),
  MOBILE_MIN_VERSION_ANDROID: mobileVersionSchema("0.0.0"),
  MOBILE_LATEST_VERSION_IOS: mobileVersionSchema("1.0.0"),
  MOBILE_LATEST_VERSION_ANDROID: mobileVersionSchema("1.0.0"),

  // ── App Links / Universal Links (MOBILE-POLISH) ───────────────────────────
  // Файлы `/.well-known/assetlinks.json` (Android) и
  // `/.well-known/apple-app-site-association` (iOS): по ним система открывает
  // ссылки `https://<домен>/u/*` и `/models/*` сразу в приложении. Списки —
  // через запятую. Нет отпечатков — Android-файл отвечает 404, нет App ID —
  // iOS-файл отвечает 404 (ссылки открываются в браузере, как раньше).
  // Пакет Android; пусто — `ru.masterryadom`.
  MOBILE_ANDROID_PACKAGE: z
    .string()
    .optional()
    .refine(
      (value) => !value?.trim() || ANDROID_PACKAGE_PATTERN.test(value.trim()),
      "must be an Android application id, e.g. ru.masterryadom",
    ),
  // SHA-256 отпечатки сертификатов подписи (Play Console → Целостность
  // приложения → сертификат ключа подписи; плюс ключ загрузки / отладки, если
  // нужен), формат `AA:BB:…` (32 байта), регистр не важен.
  MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS: z
    .string()
    .optional()
    .refine(
      (value) => splitEnvList(value).every((item) => ANDROID_CERT_FINGERPRINT_PATTERN.test(item)),
      "must be comma-separated SHA-256 fingerprints, e.g. AA:BB:…:FF (32 bytes)",
    ),
  // App ID приложения iOS: `<TEAMID>.<bundle id>`, например
  // `ABCDE12345.ru.masterryadom` (Team ID — Apple Developer → Membership).
  MOBILE_IOS_APP_IDS: z
    .string()
    .optional()
    .refine(
      (value) => splitEnvList(value).every((item) => IOS_APP_ID_PATTERN.test(item)),
      "must be comma-separated TEAMID.bundle.id values, e.g. ABCDE12345.ru.masterryadom",
    ),
});

const has = (value: string | undefined): boolean => Boolean(value?.trim());

// ── Conditional refinements ───────────────────────────────────────────────────
const refinedSchema = envSchema
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.REDIS_URL),
    "REDIS_URL is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.WORKER_SECRET),
    "WORKER_SECRET is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.MEDIA_DELIVERY_SECRET),
    "MEDIA_DELIVERY_SECRET is required in production"
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || Boolean(e.NEXT_PUBLIC_APP_URL ?? e.APP_PUBLIC_URL),
    "NEXT_PUBLIC_APP_URL is required in production"
  )
  /**
   * 🔴 FIX-D1 — публичный URL проверяется по ФОРМЕ И ХОСТУ, а не только на наличие.
   *
   * Отказ здесь молчаливый и наружу направленный: значение выставляет человек в
   * деплое, и **верное по форме, но чужое по хосту** значение приложение
   * принимало без единого признака. Наблюдалось живьём (SMOKE-02): локальный
   * `.env` держал `https://beautyhub.art` — домен, которого у продукта нет, — и
   * `GET /logout` отвечал `302` на него, то есть рутинное действие уводило
   * пользователя к третьей стороне.
   *
   * Из этого значения строится СЕМЬЯ исходящих ссылок, а не один редирект:
   * база OAuth-редиректов и logout (`http/origin.ts`), канонические и OG-адреса
   * (`app/layout.tsx` → `metadataBase`, публичные профили), ссылки в письмах
   * (`email/templates/notification.ts`), ссылки в Telegram/push-уведомлениях
   * (`telegram/config.ts` → hot-slots, slot-freed, weekly-stats, booking), и
   * ссылка «поделиться страницей» в кабинете мастера. Ошибка в одном значении
   * уезжает во все шесть, причём письма и пуши уходят наружу навсегда.
   *
   * Проверяются три свойства, и все три — только в production (dev обязан
   * работать на `http://localhost:3000`):
   *   1. разбирается как абсолютный URL (у `z.url()` это уже есть, здесь —
   *      защита от значения, пришедшего вторым именем `APP_PUBLIC_URL`);
   *   2. схема `https:` — иначе ссылки в письмах уедут по http;
   *   3. хост из списка канонических.
   */
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      const raw = (e.NEXT_PUBLIC_APP_URL ?? e.APP_PUBLIC_URL)?.trim();
      if (!raw) return true; // отсутствие ловит рефайн выше — не дублируем сообщение
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return false;
      }
      if (url.protocol !== "https:") return false;
      return CANONICAL_PUBLIC_HOSTS.has(url.host.toLowerCase());
    },
    `NEXT_PUBLIC_APP_URL/APP_PUBLIC_URL must be an absolute https URL on a canonical host in production (${[...CANONICAL_PUBLIC_HOSTS].join(", ")}). A well-formed value pointing at the wrong host silently sends users, emails and push links to a third party — see FIX-D1.`
  )
  .refine(
    (e) =>
      e.STORAGE_PROVIDER !== "s3" ||
      (Boolean(e.S3_BUCKET) && Boolean(e.S3_ACCESS_KEY) && Boolean(e.S3_SECRET_KEY)),
    "S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY are required when STORAGE_PROVIDER=s3"
  )
  // ── ENV-SPLIT-01: «id задан → остальные креды обязательны» ────────────────
  // Замена гарантий, которые раньше давали фиче-флаги: фича включается самим
  // наличием ключевого creds-значения, поэтому ПОЛНОТА набора проверяется на
  // старте — иначе включённая наличием id кнопка отдавала бы 500 на клике
  // (oauth.ts бросает при отсутствующем redirect_uri/secret). Только в
  // production: в dev допустима частичная конфигурация.
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      if (!has(e.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME)) return true;
      return has(e.TELEGRAM_BOT_TOKEN);
    },
    "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is set (Telegram UI is ON) but TELEGRAM_BOT_TOKEN is missing — " +
      "the login widget and notification delivery cannot work. Set the token or remove the username " +
      "(removing it is how Telegram is switched off since ENV-SPLIT-01)."
  )
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      const vkId = has(e.VK_ID_CLIENT_ID) || has(e.VK_CLIENT_ID);
      if (!vkId) return true;
      const secret = has(e.VK_ID_CLIENT_SECRET) || has(e.VK_CLIENT_SECRET);
      const redirect = has(e.VK_ID_REDIRECT_URI) || has(e.VK_REDIRECT_URI);
      return secret && redirect;
    },
    "VK client id is set (VK login is ON) but the credential set is incomplete — " +
      "VK_CLIENT_SECRET and VK_REDIRECT_URI (or their VK_ID_* aliases) are required. " +
      "Set them or remove the client id (removing it is how VK login is switched off since ENV-SPLIT-01)."
  )
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      if (!has(e.YANDEX_OAUTH_CLIENT_ID)) return true;
      return has(e.YANDEX_OAUTH_SECRET) && has(e.YANDEX_OAUTH_REDIRECT_URI);
    },
    "YANDEX_OAUTH_CLIENT_ID is set (Yandex login is ON) but YANDEX_OAUTH_SECRET / " +
      "YANDEX_OAUTH_REDIRECT_URI are missing. Set them or remove the client id " +
      "(removing it is how Yandex login is switched off since ENV-SPLIT-01)."
  )
  // MOBILE-B2: native push — тот же принцип «якорь задан → набор полон».
  // Неполный набор не падал бы, а тихо выключал провайдера (`config.ts`
  // считает его ненастроенным), то есть «включили FCM» на деле означало бы
  // «Android без пушей» без единой ошибки. Только в production.
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      if (!has(e.FCM_PROJECT_ID)) return true;
      return has(e.FCM_CLIENT_EMAIL) && has(e.FCM_PRIVATE_KEY);
    },
    "FCM_PROJECT_ID is set but FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are missing — FCM push cannot " +
      "authenticate. Set all three (service-account JSON key) or remove FCM_PROJECT_ID."
  )
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      if (!has(e.APNS_KEY_ID)) return true;
      return has(e.APNS_TEAM_ID) && has(e.APNS_PRIVATE_KEY) && has(e.APNS_BUNDLE_ID);
    },
    "APNS_KEY_ID is set but APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID are missing — APNs push " +
      "cannot authenticate. Set all four (.p8 token auth) or remove APNS_KEY_ID."
  )
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      if (!has(e.RUSTORE_PUSH_PROJECT_ID)) return true;
      return has(e.RUSTORE_PUSH_SERVICE_TOKEN);
    },
    "RUSTORE_PUSH_PROJECT_ID is set but RUSTORE_PUSH_SERVICE_TOKEN is missing. Set the service token " +
      "or remove the project id."
  )
  // HARDENING-MISC-01 (из PAY-SEC-01) — раньше незаданный вебхук-токен просто
  // отключал URL-проверку с однократным warn'ом в проде: тихая деградация
  // конфига, которую никто не замечал. Теперь это отказ на старте.
  //
  // Гейт по production (как у REDIS_URL / WORKER_SECRET / MEDIA_DELIVERY_SECRET
  // выше), а НЕ по одному лишь `isPaymentsEnabled`: платёжные креды заданы и в
  // dev (`YOOKASSA_SHOP_ID` есть в `.env`), поэтому безусловное требование
  // уронило бы локальную разработку, ничего не улучшив — вебхук туда всё равно
  // не приходит.
  //
  // ⚠️ Формулировка намеренная: токен — **не** якорь подлинности. Подлинность
  // держит worker API re-fetch (инв. #5), а `?token=` — дешёвый pre-filter.
  // Требуем его, чтобы pre-filter не выключался молча, а не потому, что на нём
  // что-то держится.
  .refine(
    (e) =>
      e.NODE_ENV !== "production" ||
      !(e.YOOKASSA_SHOP_ID && e.YOOKASSA_SECRET_KEY) ||
      Boolean(e.YOOKASSA_WEBHOOK_TOKEN?.trim()),
    "YOOKASSA_WEBHOOK_TOKEN is required in production when payments are enabled " +
      "(YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY set). It is a cheap URL pre-filter, " +
      "NOT the authenticity anchor — authenticity is the worker API re-fetch (invariant #5). " +
      "Set it, or unset the YooKassa credentials to run without payments."
  )
  // SEC-23: локальное дисковое хранилище в production — отказ на старте.
  //
  // Дело не в надёжности диска, а в ACL: файлы local-провайдера отдаются как
  // обычные файлы файловой системы, и если корень лежит внутри `public/`, Next
  // раздаёт их статикой мимо `ensureCanReadMedia` — а `proxy.ts` исключает
  // картиночные расширения из matcher'а, так что и прокси такого запроса не
  // видит. Приватность вложения чата или фото клиентской карточки держалась бы
  // на непредсказуемости имени файла. `STORAGE_PROVIDER` по умолчанию `"local"`,
  // то есть забытая переменная в проде давала бы ровно этот режим молча.
  // MOBILE-AUTH-A: минимум выше последней версии = экран «Обновите
  // приложение», с которого обновиться не на что. Во всех окружениях: значения
  // не зависят от инфраструктуры, ошибка одинаково вредна везде.
  .refine(
    (e) =>
      compareMobileVersions(e.MOBILE_MIN_VERSION_IOS, e.MOBILE_LATEST_VERSION_IOS) <= 0 &&
      compareMobileVersions(e.MOBILE_MIN_VERSION_ANDROID, e.MOBILE_LATEST_VERSION_ANDROID) <= 0,
    "MOBILE_MIN_VERSION_{IOS,ANDROID} must not exceed MOBILE_LATEST_VERSION_{IOS,ANDROID} — " +
      "the app would demand an update to a version that does not exist."
  )
  .refine(
    (e) => e.NODE_ENV !== "production" || e.STORAGE_PROVIDER !== "local",
    "STORAGE_PROVIDER=local is not allowed in production — set STORAGE_PROVIDER=s3. " +
      "Local-disk media is served as plain files, bypassing ensureCanReadMedia (and the " +
      "proxy matcher excludes image extensions), so chat attachments and client-card photos " +
      "would be protected only by the unpredictability of their filenames."
  );

// ── Parse ─────────────────────────────────────────────────────────────────────
// ENV-SPLIT-01: модуль серверный (`server-only` выше), поэтому QA-108-гимнастика
// с `typeof window` и клиентским фолбэком удалена — здесь всегда серверный
// рантайм (vitest шимит server-only в no-op, worker проходит по условию
// react-server). Never crash during Next static build or Vitest runs.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isTestEnv = process.env.NODE_ENV === "test";
const isProdRuntime = process.env.NODE_ENV === "production" && !isBuildPhase;

const _parsed = refinedSchema.safeParse(process.env);

if (!_parsed.success) {
  const lines = _parsed.error.issues
    .map((i) => `  • ${i.path.length ? i.path.join(".") : "root"}: ${i.message}`)
    .join("\n");

  if (isProdRuntime) {
    console.error(`\n❌ Invalid environment variables:\n${lines}\n\nCheck .env.example for required variables.\n`);
    process.exit(1);
  } else if (!isTestEnv) {
    console.warn(`\n⚠️  Environment variables:\n${lines}\n`);
  }
}

export type AppEnv = z.infer<typeof refinedSchema>;

/**
 * HARDENING-MISC-01 — экспорт СХЕМЫ (не значений) для тестов рефайнов.
 *
 * Модуль намеренно не падает под vitest (`isTestEnv`), поэтому проверить
 * «упадёт ли старт в проде» через импорт нельзя — нужен доступ к самой схеме.
 * Экспортируется только она; на рантайм это не влияет.
 */
export const envSchemaForTests = refinedSchema;

/**
 * ENV-FALLBACK-DEFAULTS — фолбэк отдаёт ДЕФОЛТЫ схемы для отсутствующих переменных.
 *
 * Прежний фолбэк был сырым `process.env`, то есть без дефолтов: в CI (`.env`
 * нет, `DATABASE_URL=""` валит парс) `env.AUTH_COOKIE_NAME` был `undefined`, и
 * `clearSessionCookies` гасил куку с именем `"undefined"` — сессионная кука
 * переживала выход. Локально это не воспроизводилось: импорт Prisma подгружает
 * `.env` в `process.env` уже ПОСЛЕ парса, а фолбэк — ссылка на него.
 *
 * Поэтому здесь прокси, а не снимок: чтение остаётся живым (на нём держатся
 * тесты с `vi.stubEnv` и тот самый поздний `.env` от Prisma), а заданные
 * значения отдаются сырыми, как раньше. Меняется ровно одно — отсутствующая
 * переменная получает дефолт своего поля вместо `undefined`.
 */
function withSchemaDefaults(source: NodeJS.ProcessEnv): AppEnv {
  const shape: Record<string, z.ZodType> = envSchema.shape;
  return new Proxy(source, {
    get(target, key, receiver) {
      const raw: unknown = Reflect.get(target, key, receiver);
      if (raw !== undefined || typeof key !== "string" || !Object.hasOwn(shape, key)) return raw;
      const fallback = shape[key].safeParse(undefined);
      return fallback.success ? fallback.data : undefined;
    },
  }) as unknown as AppEnv;
}

// Parse провалился, но мы не в прод-рантайме (vitest / dev с недо-конфигом /
// build-phase): отдаём process.env, чтобы серверные секреты
// (AUTH_JWT_SECRET, OTP_HMAC_SECRET, …) остались доступны (FIX-10), — с
// дефолтами схемы для незаданных переменных (ENV-FALLBACK-DEFAULTS).
export const env: AppEnv = _parsed.success ? _parsed.data : withSchemaDefaults(process.env);

// ── Computed flags ────────────────────────────────────────────────────────────
// ENV-SPLIT-01: единый принцип — фича включена, когда сконфигурирована.
// Отдельных env-переключателей нет; выключение = убрать креды из env.
// Рантайм-переключатели (без редеплоя) живут в админке (SystemConfig).
export const isPushEnabled = Boolean(
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_EMAIL
);
/**
 * MOBILE-B2 — native push в приложение. Провайдер «настроен», когда задан
 * ПОЛНЫЙ набор его кредов (неполный в проде отвергает рефайн выше, в dev
 * провайдер просто пропускается). Отправка — только при включённом
 * `MOBILE_PUSH_SENDING_ENABLED` (юридический выключатель, см. схему) И хотя бы
 * одном настроенном провайдере: ровно это отдаёт приложению
 * `GET /api/mobile/v1/config` → `features.push`. `isPushEnabled` выше — веб
 * (VAPID) и к приложению отношения не имеет.
 */
export const isFcmConfigured = has(env.FCM_PROJECT_ID) && has(env.FCM_CLIENT_EMAIL) && has(env.FCM_PRIVATE_KEY);
export const isApnsConfigured =
  has(env.APNS_TEAM_ID) && has(env.APNS_KEY_ID) && has(env.APNS_PRIVATE_KEY) && has(env.APNS_BUNDLE_ID);
export const isRustorePushConfigured = has(env.RUSTORE_PUSH_PROJECT_ID) && has(env.RUSTORE_PUSH_SERVICE_TOKEN);
export const isMobilePushSwitchOn = env.MOBILE_PUSH_SENDING_ENABLED?.trim() === "true";
export const isMobilePushEnabled =
  isMobilePushSwitchOn && (isFcmConfigured || isApnsConfigured || isRustorePushConfigured);
export const isPaymentsEnabled = Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
export const isTelegramAuthEnabled = Boolean(env.TELEGRAM_BOT_TOKEN);
/**
 * Пользовательский Telegram (логин, connect в кабинете, доставка уведомлений,
 * футер). Включён наличием username бота; рефайн выше гарантирует, что в проде
 * при этом задан и токен. Админский SystemConfig-переключатель
 * (`getTelegramEnabled`, telegram/feature.ts) действует НИЖЕ этого потолка —
 * включить Telegram поверх пустого username он не может.
 *
 * ⚠️ Обязан давать тот же ответ, что `isTelegramEnabled` в env.client.ts
 * (клиентские секции гейтятся там) — оба считаются от одного username.
 */
export const isTelegramEnabled = Boolean(env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim());
/**
 * VK-CLIENT-ID-ALIAS-GATE-MISMATCH — ONE resolved VK client id for both the
 * gate and the runtime resolver (`vk/config.ts` re-exports this). Precedence:
 * alias first (`VK_ID_CLIENT_ID`), then canonical (`VK_CLIENT_ID`).
 */
export const vkClientId: string | null =
  [env.VK_ID_CLIENT_ID, env.VK_CLIENT_ID]
    .map((value) => value?.trim())
    .find((value) => Boolean(value)) ?? null;
/**
 * ENV-SPLIT-01: VK-вход включён наличием client id (бывший
 * NEXT_PUBLIC_VK_ENABLED удалён). Полноту кредов в проде держит рефайн.
 * Server-only — клиентские кнопки получают значение пропом от серверных
 * компонентов (resolveAuthMethods → login/page.tsx и др.).
 */
export const isVkAuthEnabled = Boolean(vkClientId);
/**
 * FIX-YANDEX-OAUTH; ENV-SPLIT-01: Yandex-вход включён наличием client id
 * (бывший NEXT_PUBLIC_YANDEX_ENABLED удалён). Полноту кредов держит рефайн.
 * Server-only — та же проп-схема, что у VK.
 */
export const isYandexAuthEnabled = Boolean(env.YANDEX_OAUTH_CLIENT_ID?.trim());
export const isEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
/**
 * Runtime mode flag. Used by log-discipline call sites (e.g. OTP routes) to
 * gate dev-only payload fields like the raw OTP code behind a production
 * check — so the code is visible in logs locally / on staging (testing
 * convenience, also saves SMSC.ru credits) but never lands in production
 * logs (152-ФЗ / secret-in-logs hygiene; see invariant about OTP-in-logs).
 */
export const isProduction = env.NODE_ENV === "production";
/**
 * SMS-GATEWAY-A; ENV-SPLIT-01: провайдер SMSC.ru включён наличием пары
 * логин+пароль (бывший SMS_PROVIDER_ENABLED удалён). Без кредов фабрика в
 * `src/lib/sms` отдаёт mock-провайдер (OTP в логах) — dev-вход работает без
 * SMS-аккаунта.
 */
export const isSmsConfigured = Boolean(env.SMS_PROVIDER_LOGIN && env.SMS_PROVIDER_PASSWORD);
/**
 * AUTH-GATE-01; ENV-SPLIT-01: tri-state PHONE_AUTH_ENABLED удалён. Новое
 * правило выводится из конфигурации:
 *
 *   dev/test → ON всегда (mock-провайдер логирует код — это и есть локальный
 *              сценарий входа, seed-аккаунты + `.qa/`-harness);
 *   production → ON ровно тогда, когда настроен реальный SMS-провайдер.
 *
 * Инвариант QA-003 («прод + вход по телефону + SMS не настроен = plaintext-OTP
 * в логах») теперь держится КОНСТРУКТИВНО: в проде без кредов phone-роуты
 * отвечают 503 до генерации кода, mock-провайдер недостижим. Отдельный рефайн
 * больше не нужен.
 *
 * 🔴 SERVER-ONLY (см. resolveAuthMethods) — клиент получает значение пропом.
 */
export const isPhoneAuthEnabled = !isProduction || isSmsConfigured;
/**
 * OBSERVABILITY-GLITCHTIP-01 — error tracking is enabled purely by the presence
 * of a DSN. No DSN → `Sentry.init` is never called → zero behaviour change.
 * Браузерная половина (`isBrowserErrorTrackingEnabled`) живёт в env.client.ts.
 */
export const isServerErrorTrackingEnabled = Boolean(env.GLITCHTIP_DSN);
export const isS3Enabled = env.STORAGE_PROVIDER === "s3";
/**
 * ENV-SPLIT-01: обе AI-фичи включены наличием пары YANDEX_API_KEY +
 * YANDEX_FOLDER_ID (бывшие VISUAL_SEARCH_ENABLED / AI_FEATURES_ENABLED
 * удалены). Рантайм-выключатели — SystemConfig (aiFeaturesEnabled /
 * visualSearchEnabled), env-значение служит дефолтом, пока админ не решил.
 */
export const isAiFeaturesEnabled = Boolean(
  env.YANDEX_API_KEY?.trim() && env.YANDEX_FOLDER_ID?.trim()
);
export const isVisualSearchEnabled = isAiFeaturesEnabled;

// ── Backward compat shim (used in src/lib/startup.ts, src/lib/master/profile.service.ts) ─
export type ValidatedEnv = AppEnv;
export function validateEnv(): AppEnv {
  return env;
}

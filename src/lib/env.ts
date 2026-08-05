import { z } from "zod";

// String env var → boolean. Accepts any string; only "true" (case-insensitive) → true.
const boolFlag = z
  .string()
  .optional()
  .default("false")
  .transform((v) => v.trim().toLowerCase() === "true");

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

  // AUTH-GATE-01 — phone (OTP) auth kill-switch. The SMS gateway is not wired
  // to a live account yet, so production must be able to run with phone login
  // hidden AND with no user-facing claim that we send SMS.
  //
  // Deliberately NOT `boolFlag`: this flag is TRI-state, because unset must
  // mean different things per environment —
  //   unset  → ON in dev/test (seed accounts + `.qa/` harness log in by phone),
  //            OFF in production (fail-safe: never ship a login that silently
  //            drops OTPs into logs instead of delivering them).
  //   "true" → ON everywhere (flip this once SMSC is live and funded).
  //   anything else → OFF.
  // The resolver is `isPhoneAuthEnabled` below.
  //
  // Server-only on purpose (no NEXT_PUBLIC_ prefix): a public var is baked at
  // BUILD time, and this repo has already shipped a production incident where
  // eight NEXT_PUBLIC_* vars were never passed as Docker build args and baked
  // empty (DOCKER-READINESS-AUDIT-01). Client surfaces receive the resolved
  // value as a prop from a server component instead — see
  // `src/lib/auth/auth-methods.ts`.
  PHONE_AUTH_ENABLED: z.string().optional(),

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
  // Flip the YooKassa webhook IP allowlist from log-only to REJECT.
  //
  // PAY-SEC-01 (2026-07-31) — default false is the ACCEPTED PRODUCTION POSTURE,
  // not a temporary "until we confirm the hop count" state. Two failure modes
  // make IP enforcement fragile behind an ALB: a wrong `TRUSTED_PROXY_HOPS`
  // resolves every request to an edge IP, and YooKassa can change its published
  // ranges without notice. Either one silently drops LEGITIMATE payment
  // notifications — the worst available outcome for a billing webhook.
  //
  // This is only safe because authenticity does NOT rest on the source IP:
  // `webhook-processor.ts` re-fetches the object from the YooKassa API and acts
  // solely on the API-reported status/amount/metadata (invariant #5). The
  // allowlist is cheap, reversible defence-in-depth on top of that — kept in
  // the code path, off by default, flippable per-env with no redeploy of logic.
  YOOKASSA_IP_ALLOWLIST_ENFORCED: boolFlag,

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
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // SEC-14: жила мимо Zod (читалась через `process.env[...]` в
  // `telegram/config.ts`). Цена промаха конкретна: `getTelegramWebhookSecret`
  // при опечатке в имени возвращает null, а вебхук трактует null как «проверки
  // подлинности нет» и пропускает весь блок.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  // FIX-TELEGRAM-KILLSWITCH: legal kill-switch for *user-facing* Telegram
  // (login, cabinet-connect, notification delivery, footer). Defaults to false
  // (fail-safe OFF) — an unset/misread flag must never leave Telegram on.
  // Public flag so the client gates UI without a server round-trip (mirrors
  // NEXT_PUBLIC_VK_ENABLED). Does NOT touch the internal ops-monitoring
  // Telegram (MONITORING_TELEGRAM_*) — separate system.
  NEXT_PUBLIC_TELEGRAM_ENABLED: boolFlag,

  // ── VK OAuth ──────────────────────────────────────────────────────────────
  // VK creds accept two name sets: the canonical `VK_*` (what the prod template
  // ships) and the `VK_ID_*` aliases (local dev / VK ID console naming). Both are
  // declared here so NEITHER bypasses Zod (VK_ID_*-SCHEMA-GAP fix): `vk/config.ts`
  // reads them via `env` (not `process.env`), alias-first then canonical. All
  // optional — gating stays on `isVkAuthEnabled` (canonical `VK_CLIENT_ID`).
  VK_CLIENT_ID: z.string().optional(),
  VK_CLIENT_SECRET: z.string().optional(),
  VK_REDIRECT_URI: z.string().optional(),
  VK_ID_CLIENT_ID: z.string().optional(),
  VK_ID_CLIENT_SECRET: z.string().optional(),
  VK_ID_REDIRECT_URI: z.string().optional(),
  NEXT_PUBLIC_VK_ENABLED: boolFlag,
  // VK-NOTIFICATIONS-FLAG-A: independent flag for the VK push-notifications
  // subsystem. VK login (`NEXT_PUBLIC_VK_ENABLED`) and VK notifications
  // are deliberately split — existing users still log in via VK, but
  // push delivery stays off until the subsystem ships. Defaults to false
  // (off). Public flag because the cabinet UI gates the toggle client-side.
  NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED: boolFlag,

  // ── YooKassa ─────────────────────────────────────────────────────────────
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),
  // HARDENING-02: optional merchant-controlled URL query secret for the webhook,
  // NOT a signature/bearer token (YooKassa does not sign notifications). When set,
  // configure the ЛК webhook URL as
  // `https://<host>/api/payments/yookassa/webhook?token=<value>` and the route
  // requires a matching `?token=`. When unset the route still accepts and relies
  // on the worker's API re-fetch for authenticity.
  YOOKASSA_WEBHOOK_TOKEN: z.string().optional(),

  // ── Push (VAPID) ─────────────────────────────────────────────────────────
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_EMAIL: z.string().optional(),

  // ── Yandex ────────────────────────────────────────────────────────────────
  YANDEX_GEOCODER_API_KEY: z.string().optional(),
  YANDEX_SUGGEST_API_KEY: z.string().optional(),
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: z.string().optional(),

  // ── Yandex OAuth (Yandex ID) ───────────────────────────────────────────────
  // FIX-YANDEX-OAUTH: new auth provider, bespoke-parallel to VK. Register a
  // Yandex OAuth app (oauth.yandex.ru), set the creds + redirect_uri, and flip
  // NEXT_PUBLIC_YANDEX_ENABLED=true. Default OFF → button absent until creds.
  YANDEX_OAUTH_CLIENT_ID: z.string().optional(),
  YANDEX_OAUTH_SECRET: z.string().optional(),
  YANDEX_OAUTH_REDIRECT_URI: z.string().optional(),
  NEXT_PUBLIC_YANDEX_ENABLED: boolFlag,

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
  // are wired to Yandex Cloud — chat via the Foundation Models OpenAI-compatible
  // endpoint, visual search via AI Studio multimodal `qwen3.6-35b-a3b` +
  // `text-search-doc`/`text-search-query` embeddings — all using YANDEX_API_KEY +
  // YANDEX_FOLDER_ID. The refines below require both when AI_FEATURES_ENABLED or
  // VISUAL_SEARCH_ENABLED is on. (OPENAI-CLEANUP-A 2026-05-31 moved chat to Yandex;
  // OPENAI_API_KEY was dropped by VISUAL-SEARCH-YANDEX-MIGRATION-01 2026-07-13 —
  // nothing reads it anymore. Zod strips any leftover from existing `.env` files.)
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
  SMS_PROVIDER_ENABLED: boolFlag,
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

  // ── Feature flags (boolean after transform) ───────────────────────────────
  VISUAL_SEARCH_ENABLED: boolFlag,
  AI_FEATURES_ENABLED: boolFlag,
  // FIX-SEC-EMAIL-IDENTITY-01: намеренно НЕ `boolFlag` — тот дефолтит в
  // `"false"`, а email — единственный рабочий канал входа закрытого деплоя
  // (phone off tri-state'ом). Дефолт OFF означал бы, что незаданная переменная
  // гасит вход всем. Резолвер — `isEmailAuthEnabled` ниже: unset → ON.
  EMAIL_AUTH_ENABLED: z.string().optional(),

  // ── Timezone ─────────────────────────────────────────────────────────────
  DEFAULT_TIMEZONE: z.string().min(1).default("Europe/Moscow"),
});

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
  .refine(
    (e) =>
      e.STORAGE_PROVIDER !== "s3" ||
      (Boolean(e.S3_BUCKET) && Boolean(e.S3_ACCESS_KEY) && Boolean(e.S3_SECRET_KEY)),
    "S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY are required when STORAGE_PROVIDER=s3"
  )
  .refine(
    (e) =>
      !e.VISUAL_SEARCH_ENABLED || (Boolean(e.YANDEX_API_KEY) && Boolean(e.YANDEX_FOLDER_ID)),
    "VISUAL_SEARCH_ENABLED=true requires YANDEX_API_KEY + YANDEX_FOLDER_ID (visual search hits Yandex AI Studio qwen3.6-35b-a3b + text-search embeddings)."
  )
  // Post-migration: Yandex is the single provider for BOTH chat and visual search
  // — `client.ts` and `visual-search/provider.ts` always construct Yandex clients,
  // so YANDEX credentials are required unconditionally when AI features are on.
  .refine(
    (e) => !e.AI_FEATURES_ENABLED || (Boolean(e.YANDEX_API_KEY) && Boolean(e.YANDEX_FOLDER_ID)),
    "AI_FEATURES_ENABLED=true requires YANDEX_API_KEY + YANDEX_FOLDER_ID (chat surfaces hit Yandex Cloud Foundation Models)."
  )
  .refine(
    (e) =>
      !e.SMS_PROVIDER_ENABLED ||
      (Boolean(e.SMS_PROVIDER_LOGIN) && Boolean(e.SMS_PROVIDER_PASSWORD)),
    "SMS_PROVIDER_LOGIN and SMS_PROVIDER_PASSWORD are required when SMS_PROVIDER_ENABLED=true"
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
  // QA-003 pre-step — mock-SMS-провайдер логирует ТЕЛО сообщения вместе с
  // plaintext-OTP (`src/lib/sms/mock-provider.ts`) и выбирается по
  // `!isSmsConfigured`, то есть по КОНФИГУ, а не по окружению. Значит связка
  // «прод + вход по телефону включён + SMS не настроен» = коды подтверждения в
  // проде уезжают в логи.
  //
  // До сих пор от этого защищал только дефолт tri-state `PHONE_AUTH_ENABLED`
  // (в проде unset ⇒ OFF) плюс строка в чеклисте. Строка в чеклисте — не
  // enforcement; предыдущая волна ровно этому и научила. Теперь — отказ на старте.
  //
  // Override-флага «я знаю, что делаю» намеренно НЕТ: сценарий, в котором
  // осмысленно хотеть plaintext-OTP в проде, не существует.
  .refine(
    (e) => {
      if (e.NODE_ENV !== "production") return true;
      // В проде phone-auth включается ТОЛЬКО явным "true" (unset ⇒ OFF).
      const phoneAuthOn = String(e.PHONE_AUTH_ENABLED ?? "").trim().toLowerCase() === "true";
      if (!phoneAuthOn) return true;
      // Зеркалит `isSmsConfigured`: флаг И логин И пароль.
      const smsConfigured =
        Boolean(e.SMS_PROVIDER_ENABLED) &&
        Boolean(e.SMS_PROVIDER_LOGIN) &&
        Boolean(e.SMS_PROVIDER_PASSWORD);
      return smsConfigured;
    },
    "PHONE_AUTH_ENABLED=true in production requires a configured SMS provider " +
      "(SMS_PROVIDER_ENABLED=true + SMS_PROVIDER_LOGIN + SMS_PROVIDER_PASSWORD). " +
      "Without it the app falls back to the MOCK provider, which logs the message body " +
      "INCLUDING THE PLAINTEXT OTP — a 152-ФЗ secret-in-logs incident. " +
      "Correct order: configure the SMS provider first, then flip PHONE_AUTH_ENABLED."
  )
  .refine(
    (e) =>
      e.NODE_ENV !== "production" ||
      !(e.YOOKASSA_SHOP_ID && e.YOOKASSA_SECRET_KEY) ||
      Boolean(e.YOOKASSA_WEBHOOK_TOKEN?.trim()),
    "YOOKASSA_WEBHOOK_TOKEN is required in production when payments are enabled " +
      "(YOOKASSA_SHOP_ID + YOOKASSA_SECRET_KEY set). It is a cheap URL pre-filter, " +
      "NOT the authenticity anchor — authenticity is the worker API re-fetch (invariant #5). " +
      "Set it, or unset the YooKassa credentials to run without payments."
  );

// ── Parse ─────────────────────────────────────────────────────────────────────
// Never crash the process during Next.js static build or Vitest runs.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const isTestEnv = process.env.NODE_ENV === "test";
const isProdRuntime = process.env.NODE_ENV === "production" && !isBuildPhase;

// QA-108 fix — validate the full schema + fail-fast ONLY on the server.
//
// This module is also evaluated in the CLIENT bundle so the browser can read the
// `NEXT_PUBLIC_*` values. But the full schema requires server-only secrets
// (`DATABASE_URL` / `AUTH_JWT_SECRET` / `OTP_HMAC_SECRET`) that are never sent to
// the browser, so a client-side parse ALWAYS fails. In a production build
// `NODE_ENV` inlines to "production" on the client too, so the previous
// unconditional fail-fast ran `process.exit(1)` in the browser — where
// `process.exit` does not exist — throwing at module-eval and replacing EVERY
// page with the error boundary.
//
// Gating on `typeof window === "undefined"` (a) preserves the real server-side
// fail-fast for a genuinely misconfigured server, and (b) lets Next/webpack
// dead-code-eliminate the validation + `process.exit` (incl. the error string)
// out of the client bundle. The client falls back to `process.env` (with the
// `NEXT_PUBLIC_*` values inlined) exactly as before. CLAUDE.md rules 11 & 13.
const isServerRuntime = typeof window === "undefined";
const _parsed = isServerRuntime ? refinedSchema.safeParse(process.env) : null;

if (isServerRuntime && _parsed && !_parsed.success) {
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

// QA-001 / FIX-09 — client env must reference each public var as a LITERAL
// `process.env.NEXT_PUBLIC_X`. Next/webpack only statically inlines that exact
// text; the previous `process.env as AppEnv` alias defeated the inlining, so
// every client read of `env.NEXT_PUBLIC_*` returned `undefined` (root cause of
// the /login #418 + broken push/maps/telegram on the client). Enumerate the
// FULL NEXT_PUBLIC_* set from the schema here — a missing key = undefined on the
// client. `NODE_ENV` is included so `isProduction` is correct client-side too
// (push-manager early-returns on `!isProduction`). Server-only vars are
// intentionally absent (their client consumers must run server-side).
// boolFlag/coerce vars arrive as raw strings here (not Zod-transformed) — the
// computed flags below string-coerce them.
//
// ⚠️ Do NOT "simplify" this back to `process.env as AppEnv` — it re-breaks every
// client NEXT_PUBLIC_* consumer (see CLAUDE.md rule 11 + 13).
const clientEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  NEXT_PUBLIC_TELEGRAM_ENABLED: process.env.NEXT_PUBLIC_TELEGRAM_ENABLED,
  NEXT_PUBLIC_VK_ENABLED: process.env.NEXT_PUBLIC_VK_ENABLED,
  NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED: process.env.NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED,
  NEXT_PUBLIC_YANDEX_ENABLED: process.env.NEXT_PUBLIC_YANDEX_ENABLED,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  NEXT_PUBLIC_YANDEX_MAPS_API_KEY: process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY,
  NEXT_PUBLIC_LEGAL_INN: process.env.NEXT_PUBLIC_LEGAL_INN,
  NEXT_PUBLIC_VK_COMMUNITY_URL: process.env.NEXT_PUBLIC_VK_COMMUNITY_URL,
  NEXT_PUBLIC_GLITCHTIP_DSN: process.env.NEXT_PUBLIC_GLITCHTIP_DSN,
  NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT: process.env.NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT,
  NEXT_PUBLIC_GLITCHTIP_RELEASE: process.env.NEXT_PUBLIC_GLITCHTIP_RELEASE,
};

export const env: AppEnv =
  _parsed && _parsed.success
    ? _parsed.data
    : isServerRuntime
      ? // Server runtime where the full parse failed (e.g. Vitest / a
        // misconfigured server): fall back to the COMPLETE `process.env` so
        // server-only secrets (AUTH_JWT_SECRET, OTP_HMAC_SECRET, …) remain
        // available. `clientEnv` would drop them. (FIX-10: FIX-09 wrongly used
        // clientEnv for this branch → broke auth/token unit tests.)
        (process.env as unknown as AppEnv)
      : // Client bundle: the literal-inlined NEXT_PUBLIC_* set (QA-001/FIX-09).
        (clientEnv as unknown as AppEnv);

// ── Computed flags ────────────────────────────────────────────────────────────
export const isPushEnabled = Boolean(
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_EMAIL
);
export const isPaymentsEnabled = Boolean(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY);
export const isTelegramAuthEnabled = Boolean(env.TELEGRAM_BOT_TOKEN);
/**
 * FIX-TELEGRAM-KILLSWITCH — env HARD CEILING for user-facing Telegram. When
 * false (the launch default), Telegram is absent from the UI and inert in
 * delivery everywhere. The admin SystemConfig toggle (see
 * `getTelegramEnabled` in src/lib/telegram/feature.ts) can only act BELOW this
 * ceiling — it can never re-enable Telegram past an env-OFF.
 *
 * String-coerced for client-safety: on the server `env` is Zod-parsed →
 * boolean; on the client the parse falls back to raw `process.env` (string).
 * `String(x) === "true"` normalises both (same rationale as
 * `isVkNotificationsEnabled`).
 *
 * Distinct from `isTelegramAuthEnabled` (token presence) — this is the
 * intent/legal switch, independent of whether a bot token is configured.
 */
export const isTelegramEnabled =
  String(env.NEXT_PUBLIC_TELEGRAM_ENABLED) === "true";
/**
 * VK-CLIENT-ID-ALIAS-GATE-MISMATCH — ONE resolved VK client id for both the
 * gate and the runtime resolver.
 *
 * VK creds ship under two name sets (canonical `VK_*`, VK-ID-console `VK_ID_*`).
 * `vk/config.ts` has always resolved them alias-first, but `isVkAuthEnabled`
 * used to read the canonical name ONLY — so an alias-configured deploy (which
 * is exactly what `.env`/`.env.local` look like) rendered no VK button and got
 * a 503 from `/api/auth/vk/start`, with working credentials sitting right
 * there. Resolving once here and having BOTH consumers read this value is what
 * keeps the gate and the resolver from disagreeing.
 *
 * Precedence is unchanged (alias first, then canonical) and this does NOT turn
 * VK on anywhere: `NEXT_PUBLIC_VK_ENABLED` still has to be true, and production
 * keeps it false.
 */
export const vkClientId: string | null =
  [env.VK_ID_CLIENT_ID, env.VK_CLIENT_ID]
    .map((value) => value?.trim())
    .find((value) => Boolean(value)) ?? null;
export const isVkAuthEnabled = env.NEXT_PUBLIC_VK_ENABLED && Boolean(vkClientId);
/**
 * FIX-YANDEX-OAUTH — Yandex ID auth provider gate. Mirrors `isVkAuthEnabled`:
 * both the public enable flag AND a configured client id must be present.
 * String-coerced for client-safety (server boolean vs client raw string). The
 * `YandexLoginButton` self-gates on this; the button is absent until a real
 * Yandex OAuth app is registered + `NEXT_PUBLIC_YANDEX_ENABLED=true`.
 */
export const isYandexAuthEnabled =
  String(env.NEXT_PUBLIC_YANDEX_ENABLED) === "true" && Boolean(env.YANDEX_OAUTH_CLIENT_ID);
/**
 * VK-NOTIFICATIONS-FLAG-A: VK push-notifications subsystem is incomplete
 * (no delivery path in `notifications/delivery.ts`). The flag gates the
 * cabinet UI toggle + the settings-write endpoint so a user can't enable
 * a no-op subscription. Default = off. Set
 * `NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED=true` once the delivery channel
 * lands (queue handler + VK send API) — no code change required to flip it.
 *
 * Independent of `isVkAuthEnabled` — login keeps working when this is off.
 *
 * String-coerced comparison: on the server `env` is Zod-parsed → boolean;
 * on the client the Zod parse fails (non-public secrets are missing) and
 * `env` falls back to raw `process.env` where the value is still a string.
 * `String(x) === "true"` normalises both to a real boolean so client-side
 * gating works in `vk-notifications.tsx`.
 */
export const isVkNotificationsEnabled =
  String(env.NEXT_PUBLIC_VK_NOTIFICATIONS_ENABLED) === "true";
export const isEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
/**
 * Runtime mode flag. Used by log-discipline call sites (e.g. OTP routes) to
 * gate dev-only payload fields like the raw OTP code behind a production
 * check — so the code is visible in logs locally / on staging (testing
 * convenience, also saves SMSC.ru credits) but never lands in production
 * logs (152-ФЗ / secret-in-logs hygiene; see invariant about OTP-in-logs).
 *
 * Pattern at call site:
 *   `logInfo("...", { ..., ...(isProduction ? {} : { code }) });`
 */
export const isProduction = env.NODE_ENV === "production";
/**
 * AUTH-GATE-01 — phone (OTP) auth gate. Resolves the tri-state
 * `PHONE_AUTH_ENABLED` (see the schema note above):
 *
 *   unset → `!isProduction` (ON in dev/test, OFF in production)
 *   "true" (case-insensitive) → ON
 *   anything else → OFF
 *
 * OFF means: no phone tab on `/login`, no phone-login CTA when it is the last
 * remaining method, and `POST /api/auth/otp/request` + `/verify` refuse with
 * 503 `SYSTEM_FEATURE_DISABLED` BEFORE any OTP is generated, persisted or
 * logged. Existing sessions are untouched — this gates ISSUANCE only, never
 * validation, refresh or logout.
 *
 * 🔴 SERVER-ONLY. `PHONE_AUTH_ENABLED` is intentionally absent from
 * `clientEnv`, so in a client bundle this expression degrades to
 * `!isProduction` and would disagree with the server → hydration mismatch.
 * Never import it from a `"use client"` module. Client surfaces get the
 * resolved value as a prop from a server component — resolve it through
 * `resolveAuthMethods()` (src/lib/auth/auth-methods.ts), which is the single
 * place that decides which auth methods a visitor may see. Same server-only
 * shape as `isVkAuthEnabled` (VK_CLIENT_ID) and `isEmailConfigured` (SMTP_*).
 */
export const isPhoneAuthEnabled = ((): boolean => {
  const raw = env.PHONE_AUTH_ENABLED;
  if (raw === undefined || String(raw).trim() === "") return env.NODE_ENV !== "production";
  return String(raw).trim().toLowerCase() === "true";
})();

/**
 * FIX-SEC-EMAIL-IDENTITY-01 — килсвитч email-входа.
 *
 * До этого коммита `EMAIL_AUTH_ENABLED` была **объявлена и не имела ни одного
 * потребителя** (единственное вхождение во всём `src/` — строка схемы выше),
 * то есть килсвитча email-входа не существовало, хотя снапшот §5/§7 утверждал
 * обратное. Теперь флаг подключён к обоим роутам email-OTP.
 *
 * **Семантика намеренно ЗЕРКАЛЬНА телефонной, а не одинакова с ней.**
 * `PHONE_AUTH_ENABLED` — tri-state с дефолтом OFF в проде: там выключенное
 * состояние безопаснее, потому что без SMS-провайдера код уходит в лог.
 * У email обратная ситуация: это **единственный рабочий канал входа закрытого
 * деплоя**, и дефолт OFF означал бы, что забытая переменная гасит вход всем.
 * Поэтому здесь простой boolean с **дефолтом ON** (`boolFlag` даёт `true` при
 * отсутствии значения — см. объявление), а выключение — всегда явное действие.
 *
 * Второй гейт — `isEmailConfigured` (SMTP) — остаётся независимым: он отвечает
 * на «можем ли мы физически отправить письмо», этот — на «разрешён ли канал».
 * Роут проверяет оба; порядок не важен, оба до генерации кода.
 */
export const isEmailAuthEnabled = ((): boolean => {
  const raw = env.EMAIL_AUTH_ENABLED;
  if (raw === undefined || String(raw).trim() === "") return true; // unset → ON
  return String(raw).trim().toLowerCase() !== "false";
})();
/**
 * SMS-GATEWAY-A: SMSC.ru provider gate. Both the toggle and the
 * credentials must be present — otherwise the factory in `src/lib/sms`
 * falls back to the mock provider (OTP-in-logs) so dev login keeps
 * working without an SMS account. Set `SMS_PROVIDER_ENABLED=true` plus
 * `SMS_PROVIDER_LOGIN`/`SMS_PROVIDER_PASSWORD` in prod to start sending
 * real SMS. The Zod refine above enforces the credential pair when the
 * flag is on, so misconfiguration fails fast at startup in production.
 */
export const isSmsConfigured =
  env.SMS_PROVIDER_ENABLED &&
  Boolean(env.SMS_PROVIDER_LOGIN) &&
  Boolean(env.SMS_PROVIDER_PASSWORD);
/**
 * OBSERVABILITY-GLITCHTIP-01 — error tracking is enabled purely by the presence
 * of a DSN. No DSN → `Sentry.init` is never called → zero behaviour change.
 * Server and browser are gated independently (see the schema notes above).
 */
export const isServerErrorTrackingEnabled = Boolean(env.GLITCHTIP_DSN);
export const isBrowserErrorTrackingEnabled = Boolean(env.NEXT_PUBLIC_GLITCHTIP_DSN);
export const isS3Enabled = env.STORAGE_PROVIDER === "s3";
export const isVisualSearchEnabled = env.VISUAL_SEARCH_ENABLED;
export const isAiFeaturesEnabled = env.AI_FEATURES_ENABLED;

// ── Backward compat shim (used in src/lib/startup.ts, src/lib/master/profile.service.ts) ─
export type ValidatedEnv = AppEnv;
export function validateEnv(): AppEnv {
  return env;
}

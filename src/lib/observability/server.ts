/**
 * OBSERVABILITY-GLITCHTIP-01 — server + worker error tracking (`@sentry/node`).
 *
 * GlitchTip speaks the Sentry ingest protocol, so the official SDK is the
 * client. What GlitchTip does NOT implement is switched off here rather than
 * left at its default — paying OpenTelemetry's overhead to produce data the
 * backend drops would be the worst of both worlds:
 *
 *   • tracing      — `tracesSampleRate` unset + `skipOpenTelemetrySetup: true`.
 *                    GlitchTip does store transactions, but this product has no
 *                    performance question it is trying to answer, and the OTel
 *                    auto-instrumentation is the single largest source of
 *                    startup cost, monkey-patching and PII capture.
 *   • sessions     — GlitchTip's own docs say sessions are unsupported. v10 has
 *                    no `autoSessionTracking` option; sessions ride on the http
 *                    integration, which is not installed.
 *   • replay/profiling — browser/native features with no GlitchTip counterpart.
 *
 * ⚠️ Loaded by two very different runtimes:
 *   1. the Next.js node server, via a dynamic import in `src/instrumentation.ts`
 *      (dynamic so the EDGE bundle never pulls `@sentry/node` in);
 *   2. `src/worker.ts`, a plain-Node process started with
 *      `--conditions=react-server`.
 *
 * Because of (2) this file must NOT `import "server-only"`, and must not reach
 * for anything Next-specific. Regression-guarded by `npm run check:worker-boot`.
 */

import * as Sentry from "@sentry/node";
import { env } from "@/lib/env";
import { resolveServerObservabilityConfig } from "@/lib/observability/config";
import { shouldDropError } from "@/lib/observability/noise";
import { createLiteralRedactor, scrubEvent, type LiteralRedactor } from "@/lib/observability/scrub";
import { setReporter, type ReportContext } from "@/lib/observability/report";

export type ServerRuntimeName = "next-server" | "worker";

let initialized = false;

/** See `browser.ts` — declared structurally, not imported from the SDK. */
type CaptureContextShape = {
  tags: Record<string, string | number | boolean>;
  extra: Record<string, unknown>;
  level: "fatal" | "error" | "warning" | "info";
};

/**
 * Literal values that must never appear in an event, whatever path they took
 * to get there. Pattern matching cannot catch a `DATABASE_URL` password inside
 * a Prisma connection error or a YooKassa shop secret echoed by a failed
 * request — exact-value redaction can.
 */
function collectSecretLiterals(): LiteralRedactor | undefined {
  return createLiteralRedactor([
    env.DATABASE_URL,
    env.DIRECT_URL,
    env.AUTH_JWT_SECRET,
    env.OTP_HMAC_SECRET,
    env.MEDIA_DELIVERY_SECRET,
    env.WORKER_SECRET,
    env.BILLING_RENEW_SECRET,
    env.MRR_SNAPSHOT_SECRET,
    env.AVAILABILITY_CRON_TOKEN,
    env.YOOKASSA_SECRET_KEY,
    env.YOOKASSA_WEBHOOK_TOKEN,
    env.S3_SECRET_KEY,
    env.S3_ACCESS_KEY,
    env.VAPID_PRIVATE_KEY,
    env.SMTP_PASS,
    env.SMS_PROVIDER_PASSWORD,
    env.VK_CLIENT_SECRET,
    env.VK_ID_CLIENT_SECRET,
    env.YANDEX_OAUTH_SECRET,
    env.YANDEX_API_KEY,
    env.YANDEX_GEOCODER_API_KEY,
    env.YANDEX_SUGGEST_API_KEY,
    env.TELEGRAM_BOT_TOKEN,
    env.MONITORING_TELEGRAM_BOT_TOKEN,
  ]);
}

/**
 * Build a per-capture `CaptureContext`.
 *
 * ⚠️ Deliberately NOT `Sentry.withScope`. `skipOpenTelemetrySetup: true` leaves
 * the SDK's OpenTelemetry-backed async-context strategy installed but without
 * an OTel context manager behind it, so `withScope` does not isolate — tags and
 * `extra` from one capture leak into the next (observed: a 5xx report arriving
 * with an unrelated earlier error's payload). A capture context is applied to a
 * FORKED scope for that single event, so nothing is shared and nothing leaks.
 */
function buildCaptureContext(runtime: ServerRuntimeName, context?: ReportContext): CaptureContextShape {
  const tags: Record<string, string | number | boolean> = { runtime };
  for (const [key, value] of Object.entries(context?.tags ?? {})) {
    if (value !== undefined) tags[key] = value;
  }
  // `extra` is deep-scrubbed by `scrubEvent` in `beforeSend` before it is sent.
  return { tags, extra: context?.extra ?? {}, level: context?.level ?? "error" };
}

/**
 * Initialise error tracking for a server-side runtime. Idempotent, and a no-op
 * when `GLITCHTIP_DSN` is unset — that is the dev/CI path, which stays byte-for
 * byte the same as before this feature existed.
 *
 * Never throws: an unusable DSN or an SDK failure leaves the process running
 * with reporting simply inactive.
 */
export function initServerObservability(runtime: ServerRuntimeName): boolean {
  if (initialized) return true;

  const config = resolveServerObservabilityConfig();
  if (!config) return false;

  try {
    const redactLiterals = collectSecretLiterals();

    const client = Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      sampleRate: config.sampleRate,

      // ── What GlitchTip does not support / we do not want ──────────────────
      // No `tracesSampleRate` → tracing off. No OTel SDK setup, no ESM loader
      // hooks: both exist to auto-instrument spans we are not collecting, and
      // the loader hooks have a history of breaking unusual runtimes (the
      // worker runs under tsx).
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
      enableLogs: false,

      // ── PII ───────────────────────────────────────────────────────────────
      // Stops the SDK ATTACHING ip/cookies/bodies automatically. The scrubber
      // below handles everything the application puts in by hand.
      sendDefaultPii: false,
      maxBreadcrumbs: 20,
      normalizeDepth: 5,
      maxValueLength: 2000,
      shutdownTimeout: 2000,

      // Curated integration set. Everything omitted is omitted on purpose:
      //  · http / nativeNodeFetch / prisma / redis / postgres / express — OTel
      //    auto-instrumentation for tracing (not enabled) that also captures
      //    URLs, queries and headers.
      //  · requestData — its entire job is attaching request headers/cookies/body.
      //  · captureConsole — would forward every `logInfo`/`logError`, including
      //    the deliberately-plaintext dev OTP line, as an event.
      //  · onUncaughtException / onUnhandledRejection — the worker installs its
      //    own handlers that log, alert and exit; two owners of a fatal path is
      //    worse than one. We capture explicitly instead.
      //  · localVariables — frame locals can hold an OTP, a password, a session.
      defaultIntegrations: false,
      integrations: [
        Sentry.eventFiltersIntegration(),
        Sentry.functionToStringIntegration(),
        Sentry.linkedErrorsIntegration({ limit: 3 }),
        Sentry.dedupeIntegration(),
        Sentry.nodeContextIntegration(),
        // Source lines around each frame — this is what makes a stack readable
        // without shipping source maps.
        Sentry.contextLinesIntegration(),
      ],

      beforeSend: (event, hint) => {
        try {
          if (shouldDropError(hint?.originalException ?? hint?.syntheticException)) return null;
          // `scrub.ts` mirrors the event shape structurally instead of
          // importing SDK types, so it stays dependency-free and testable.
          return scrubEvent(event as unknown as Record<string, unknown>, redactLiterals) as unknown as typeof event;
        } catch {
          // A scrubber failure must fail CLOSED — drop the event rather than
          // risk sending an unscrubbed one.
          return null;
        }
      },
    });

    // A malformed DSN does not throw — the SDK logs a warning and hands back a
    // client with no DSN that silently drops everything. Treat that as "not
    // enabled" so `isReportingActive()` tells the truth.
    if (!client || !client.getDsn()) return false;

    setReporter({
      captureException: (error, context) => {
        Sentry.captureException(error, { captureContext: buildCaptureContext(runtime, context) });
      },
      captureMessage: (message, context) => {
        Sentry.captureMessage(message, buildCaptureContext(runtime, context));
      },
      flush: (timeoutMs) => Sentry.flush(timeoutMs),
    });

    initialized = true;
    return true;
  } catch {
    // Misconfigured DSN, unreachable host, SDK failure — the application does
    // not care. Reporting stays inactive; `report.ts` no-ops.
    setReporter(null);
    return false;
  }
}

/**
 * OBSERVABILITY-GLITCHTIP-01 — browser error tracking (`@sentry/browser`).
 *
 * Loaded from `src/instrumentation-client.ts`, which Next.js 16 runs before any
 * application code on the client. `@sentry/browser` rather than `@sentry/nextjs`
 * keeps the build pipeline untouched — see `src/instrumentation.ts` for the
 * full rationale.
 *
 * Deliberately absent: `replayIntegration` (GlitchTip has no session replay —
 * it would ship a DOM recording of every user's session for a backend that
 * drops it, which is both wasted bandwidth and the largest PII surface in the
 * SDK), `browserTracingIntegration` / `webVitals` / profiling (tracing off),
 * and `browserSessionIntegration` (GlitchTip's docs state sessions are
 * unsupported).
 */

import * as Sentry from "@sentry/browser";
import { resolveBrowserObservabilityConfig } from "@/lib/observability/config";
import { BROWSER_DENY_URLS, BROWSER_IGNORE_ERRORS, shouldDropError } from "@/lib/observability/noise";
import { scrubEvent } from "@/lib/observability/scrub";
import { setReporter, type ReportContext } from "@/lib/observability/report";

let initialized = false;

/**
 * Structural shape of a Sentry `CaptureContext`. Declared locally rather than
 * imported: `@sentry/browser` does not re-export `ScopeContext`, and `tsc
 * --noEmit` resolves that differently from Next's build-time type check — a
 * named-type import passes one and fails the other.
 */
type CaptureContextShape = {
  tags: Record<string, string | number | boolean>;
  extra: Record<string, unknown>;
  level: "fatal" | "error" | "warning" | "info";
};

/**
 * Per-capture context applied to a forked scope — same reasoning as
 * `server.ts`: never mutate the shared current scope, so one capture's tags and
 * `extra` can never surface on the next one.
 */
function buildCaptureContext(context?: ReportContext): CaptureContextShape {
  const tags: Record<string, string | number | boolean> = { runtime: "browser" };
  for (const [key, value] of Object.entries(context?.tags ?? {})) {
    if (value !== undefined) tags[key] = value;
  }
  return { tags, extra: context?.extra ?? {}, level: context?.level ?? "error" };
}

/**
 * Initialise browser error tracking. No-op without
 * `NEXT_PUBLIC_GLITCHTIP_DSN`, idempotent, and never throws — a failure here
 * must not take the page down.
 */
export function initBrowserObservability(): boolean {
  if (initialized) return true;

  const config = resolveBrowserObservabilityConfig();
  if (!config) return false;

  try {
    const client = Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,

      // No tracing, no replay, no sessions, no logs — none of it is stored by
      // GlitchTip in a form we would use, and each one costs bundle size and
      // network on every visitor's device.
      enableLogs: false,

      sendDefaultPii: false,
      maxBreadcrumbs: 20,
      normalizeDepth: 5,
      maxValueLength: 2000,

      ignoreErrors: BROWSER_IGNORE_ERRORS,
      denyUrls: BROWSER_DENY_URLS,

      defaultIntegrations: false,
      integrations: [
        Sentry.eventFiltersIntegration(),
        Sentry.functionToStringIntegration(),
        Sentry.dedupeIntegration(),
        Sentry.linkedErrorsIntegration({ limit: 3 }),
        // The reason browser tracking works at all: window.onerror +
        // unhandledrejection.
        Sentry.globalHandlersIntegration(),
        // Restores useful stacks for errors thrown inside timers / event
        // handlers, which otherwise arrive as bare "Script error".
        Sentry.browserApiErrorsIntegration(),
        // Page URL + user agent. The URL's query string is stripped by the
        // scrubber before send.
        Sentry.httpContextIntegration(),
        Sentry.breadcrumbsIntegration({
          // 🚩 `console: false` is load-bearing. Console breadcrumbs capture
          // every logged argument — which at this stage includes the plaintext
          // OTP in dev/staging (CLAUDE.md rule 9).
          console: false,
          // DOM breadcrumbs serialise the interacted element; keep user input
          // out of the payload entirely.
          dom: false,
          fetch: true,
          xhr: true,
          history: true,
          sentry: true,
        }),
      ],

      beforeSend: (event, hint) => {
        try {
          if (shouldDropError(hint?.originalException ?? hint?.syntheticException)) return null;
          return scrubEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
        } catch {
          // Fail closed — never send an event the scrubber could not process.
          return null;
        }
      },
    });

    // Same as `server.ts`: a malformed DSN yields a client that drops
    // everything rather than throwing. Don't report it as active.
    if (!client || !client.getDsn()) return false;

    setReporter({
      captureException: (error, context) => {
        Sentry.captureException(error, { captureContext: buildCaptureContext(context) });
      },
      captureMessage: (message, context) => {
        Sentry.captureMessage(message, buildCaptureContext(context));
      },
      flush: (timeoutMs) => Sentry.flush(timeoutMs),
    });

    initialized = true;
    return true;
  } catch {
    setReporter(null);
    return false;
  }
}

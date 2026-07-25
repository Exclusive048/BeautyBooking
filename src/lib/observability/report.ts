/**
 * OBSERVABILITY-GLITCHTIP-01 — runtime-neutral reporting facade.
 *
 * Zero imports on purpose. This module is safe to import from ANY runtime —
 * Next.js node server, Next.js edge (`proxy.ts` / `instrumentation.ts`), the
 * browser bundle, and the plain-Node worker — because it pulls in no SDK. The
 * concrete reporter is installed at startup by `server.ts` (`@sentry/node`) or
 * `browser.ts` (`@sentry/browser`); until then every call here is a no-op.
 *
 * That is the whole failure model: **error tracking is never a dependency.**
 * No DSN, a bogus DSN, an unreachable GlitchTip, an SDK that failed to load —
 * all of them leave these functions as silent no-ops. Nothing throws, nothing
 * blocks, nothing awaits a network round-trip on a request path.
 */

export type ReportContext = {
  /** Indexed, low-cardinality labels (`job_type`, `runtime`, `status`). */
  tags?: Record<string, string | number | boolean | undefined>;
  /** Free-form payload — deep-scrubbed by `scrubEvent` before it is sent. */
  extra?: Record<string, unknown>;
  level?: "fatal" | "error" | "warning" | "info";
};

export type Reporter = {
  captureException: (error: unknown, context?: ReportContext) => void;
  captureMessage: (message: string, context?: ReportContext) => void;
  flush: (timeoutMs: number) => Promise<boolean>;
};

let reporter: Reporter | null = null;

/** Called once per process by `server.ts` / `browser.ts` after a successful init. */
export function setReporter(next: Reporter | null): void {
  reporter = next;
}

export function isReportingActive(): boolean {
  return reporter !== null;
}

/**
 * Report an unexpected error. Fire-and-forget: the SDK queues the event on its
 * own transport, so this returns immediately even when GlitchTip is down.
 */
export function reportError(error: unknown, context?: ReportContext): void {
  if (!reporter) return;
  try {
    reporter.captureException(error, context);
  } catch {
    // A reporting failure must never become an application failure.
  }
}

/**
 * Report a condition that has no `Error` object — e.g. a handled 5xx that was
 * already converted into an API response.
 */
export function reportMessage(message: string, context?: ReportContext): void {
  if (!reporter) return;
  try {
    reporter.captureMessage(message, context);
  } catch {
    // Ditto.
  }
}

/**
 * Drain the queue before the process exits. Always resolves — on timeout, on
 * transport failure, and instantly when reporting is inactive — so a shutdown
 * path can `await` it without risking a hang.
 */
export function flushReports(timeoutMs = 2000): Promise<boolean> {
  if (!reporter) return Promise.resolve(true);
  try {
    return reporter.flush(timeoutMs).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

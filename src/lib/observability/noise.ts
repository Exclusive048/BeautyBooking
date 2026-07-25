/**
 * OBSERVABILITY-GLITCHTIP-01 — noise control.
 *
 * An alerting channel that cries wolf gets muted, and a muted channel is worse
 * than none. Everything dropped here is either (a) a normal business outcome
 * the app models as an error object, (b) framework control flow that is not an
 * error at all, or (c) environment noise the team cannot act on.
 *
 * Anything genuinely unexpected must still get through — when in doubt, keep it.
 *
 * Dependency-free by design (client-safe, worker-safe, unit-testable).
 */

/** Structural probe for `AppError` (`src/lib/api/errors.ts`) without importing it. */
type AppErrorLike = { status: number; code: string; message?: string };

function asAppErrorLike(value: unknown): AppErrorLike | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "number" || typeof candidate.code !== "string") return null;
  return candidate as unknown as AppErrorLike;
}

/**
 * Next.js throws these to implement `redirect()`, `notFound()` and dynamic
 * bailouts. They travel as exceptions and surface in `onRequestError`, but they
 * are control flow — reporting them would swamp everything else.
 */
const FRAMEWORK_CONTROL_FLOW = [
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  "DYNAMIC_SERVER_USAGE",
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
] as const;

/**
 * The client hung up. Common, unactionable, and entirely outside our control.
 */
const CLIENT_DISCONNECT = ["ECONNRESET", "ECONNABORTED", "EPIPE", "ABORT_ERR", "ResponseAborted"] as const;

/**
 * 5xx codes that mean "deliberately unavailable", not "broken":
 *  - `SERVICE_UNAVAILABLE` 503 is what the AUTH-KILLSWITCH-ENFORCE-01 gates
 *    return when VK / Yandex / Telegram auth is switched off (FZ-199). Every
 *    login attempt against a disabled provider would otherwise page someone.
 * These stay in the structured logs and the ops Telegram channel.
 */
const NON_ACTIONABLE_SERVER_CODES = new Set(["SERVICE_UNAVAILABLE"]);

/**
 * Should a *handled* 5xx API response (`fail()` in `src/lib/api/response.ts`)
 * be reported? 4xx never is — it is the client's problem by definition.
 */
export function shouldReportFailure(status: number, code?: string): boolean {
  if (status < 500) return false;
  if (status === 503) return false;
  if (code && NON_ACTIONABLE_SERVER_CODES.has(code)) return false;
  return true;
}

function collectErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const candidate = error as Record<string, unknown>;
  const parts = [candidate.message, candidate.digest, candidate.name, candidate.code];
  return parts.filter((part) => typeof part === "string").join(" ");
}

/**
 * The `beforeSend` gate. `hint.originalException` is the thrown value before
 * the SDK flattened it into an event, which is the only place the `AppError`
 * status/code survives.
 */
export function shouldDropError(error: unknown): boolean {
  const appError = asAppErrorLike(error);
  if (appError) {
    // Expected business outcomes: validation 400s, 401/403 on guarded routes,
    // BOOKING_CONFLICT / SLOT_CONFLICT 409s, PACKAGE_CANCEL_WHOLE,
    // REVIEW_ALREADY_EXISTS, DUPLICATE_REQUEST, RATE_LIMITED …
    if (appError.status < 500) return true;
    if (NON_ACTIONABLE_SERVER_CODES.has(appError.code)) return true;
  }

  const text = collectErrorText(error);
  if (!text) return false;

  if (FRAMEWORK_CONTROL_FLOW.some((marker) => text.includes(marker))) return true;
  if (CLIENT_DISCONNECT.some((marker) => text.includes(marker))) return true;

  return false;
}

/**
 * Browser-side string filters handed to `inboundFiltersIntegration`.
 * Rationale per group:
 *  - ResizeObserver: a benign spec artifact browsers report as an error.
 *  - Network/abort: user connectivity and navigations that cancel in-flight
 *    fetches. Real API failures surface server-side with far better context.
 *  - Chunk loading: after a deploy, an open tab requests chunks that no longer
 *    exist; the service worker serves `NetworkOnly` HTML so a reload fixes it.
 *    Includes the HMR `__webpack_modules__` desync seen in dev.
 *  - Extension noise: injected scripts throwing inside our page.
 */
export const BROWSER_IGNORE_ERRORS: (string | RegExp)[] = [
  // Benign browser artifacts
  /ResizeObserver loop/i,
  "Non-Error promise rejection captured with value: undefined",
  // Connectivity / navigation aborts
  /Failed to fetch/i,
  /NetworkError when attempting to fetch resource/i,
  /Load failed/i,
  /The operation was aborted/i,
  /AbortError/,
  // Deploy / HMR chunk desync
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/,
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /__webpack_modules__/,
  /Cannot read properties of undefined \(reading 'call'\)/,
  // Browser extensions and injected scripts
  /^Script error\.?$/,
  /top\.GLOBALS/,
  /webkit-masked-url/,
  /Extension context invalidated/i,
];

/** Stack-frame origins we never want events from. */
export const BROWSER_DENY_URLS: RegExp[] = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(?:web-)?extension:\/\//i,
  /^webkit-masked-url:/i,
  /extensions\//i,
];

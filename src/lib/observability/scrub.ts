/**
 * OBSERVABILITY-GLITCHTIP-01 — PII scrubbing for error-tracking events.
 *
 * `sendDefaultPii: false` only stops the SDK from *automatically* attaching
 * IPs / cookies / request bodies. It does nothing about the data this product
 * puts into error messages, `extra` payloads and breadcrumbs by hand. Shipping
 * those to a self-hosted GlitchTip is still a leak — just a relocated one.
 *
 * Design: **allowlist first, denylist second.**
 *  1. Containers with a known shape (`request`, `contexts`, `user`, top-level
 *     event keys) are REBUILT from an allowlist — anything not named is dropped,
 *     so a future SDK version adding a new field cannot leak by default.
 *  2. Free-form containers (`extra`, `tags`, `breadcrumb.data`, `request.data`)
 *     get key-based redaction — a key whose name implies user data or auth
 *     material loses its value regardless of content.
 *  3. Every surviving string then goes through value-level patterns (phones,
 *     emails, JWTs, `Bearer`, cookie pairs, `secret=…`, URL query strings) plus
 *     an optional literal-secret redactor the server wires up from `env.ts`.
 *
 * 🚩 OTP codes: this stage deliberately logs them in plaintext (CLAUDE.md rule
 * 9) under the key `code`. `code` is ALSO the app's error-code key
 * (`BOOKING_CONFLICT`), so a blanket redaction would gut triage. The rule here
 * is value-shaped: `code` is redacted when it looks like an OTP (4–8 digits)
 * and preserved when it looks like an error code. See `scrub.test.ts`.
 *
 * This module is intentionally dependency-free (no `@sentry/*`, no `env`) so it
 * is client-safe, worker-safe and unit-testable in isolation. Event shapes are
 * mirrored structurally rather than imported.
 */

export const REDACTED = "[redacted]";
export const REDACTED_PHONE = "[phone]";
export const REDACTED_EMAIL = "[email]";

/** Recursion / size guards so a pathological payload can't stall the scrubber. */
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 4000;

// ── Structural mirrors of the Sentry event shape (no SDK import) ─────────────

export type ScrubbableFrame = Record<string, unknown>;
export type ScrubbableBreadcrumb = Record<string, unknown>;
export type ScrubbableEvent = Record<string, unknown>;

/** Optional second-pass redactor for literal secret VALUES (see `server.ts`). */
export type LiteralRedactor = (value: string) => string;

// ── Key-based redaction (free-form containers only) ──────────────────────────

/** Normalise `client_phone` / `clientPhone` / `Client-Phone` → `clientphone`. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Keys redacted on an EXACT normalised match. Short tokens live here rather
 * than in the substring list so `inn` doesn't match `beginning`, `pin` doesn't
 * match `pinned`, and `ip` doesn't match `description`.
 */
const EXACT_SENSITIVE_KEYS = new Set([
  // Identity / contact — phone is the primary user identity in this product.
  "name",
  "firstname",
  "lastname",
  "middlename",
  "patronymic",
  "fullname",
  "displayname",
  "phone",
  "tel",
  "mobile",
  "msisdn",
  "email",
  "mail",
  "address",
  "ip",
  "inn",
  // Auth material.
  "auth",
  "authorization",
  "cookie",
  "cookies",
  "jwt",
  "session",
  "token",
  "secret",
  "password",
  "passwd",
  "pass",
  "key",
  "hash",
  "state",
  "nonce",
  "verifier",
  "challenge",
  "signature",
  "sign",
  "otp",
  "pin",
  // Payment.
  "card",
  "pan",
  "cvc",
  "cvv",
  "first6",
  "last4",
  // Free text written by users / masters.
  "note",
  "notes",
  "comment",
  "comments",
  // Config that identifies the tenant / ingest endpoint.
  "dsn",
]);

/**
 * Keys redacted when the normalised name CONTAINS one of these. Deliberately
 * specific: bare `key` / `name` / `auth` would eat `cacheKey`, `jobName` and
 * `author`, which are useful and not sensitive.
 */
const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "privatekey",
  "secretkey",
  "authorization",
  "authheader",
  "cookie",
  "jwt",
  "sessionid",
  "sessiontoken",
  "bearer",
  "credential",
  "signature",
  "codehash",
  "codeverifier",
  "verifier",
  "challenge",
  "otpcode",
  "smscode",
  "verificationcode",
  "confirmationcode",
  "phone",
  "email",
  "firstname",
  "lastname",
  "fullname",
  "patronym",
  "clientname",
  "mastername",
  "username",
  "address",
  "idempotence",
  "shopid",
  "vapid",
  "hmac",
  "cardnumber",
  "clientnotes",
] as const;

/** Keys whose value is redacted only when it LOOKS like an OTP (4–8 digits). */
const OTP_SHAPED_KEYS = new Set(["code", "codes", "smscode", "value"]);
const OTP_SHAPE = /^\d{4,8}$/;

/** Error codes are SCREAMING_SNAKE — never mistaken for a secret. */
const ERROR_CODE_SHAPE = /^[A-Z][A-Z0-9_]*$/;

export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (EXACT_SENSITIVE_KEYS.has(normalized)) return true;
  return SENSITIVE_KEY_SUBSTRINGS.some((part) => normalized.includes(part));
}

// ── Value-level patterns ─────────────────────────────────────────────────────

/**
 * RU numbers in every shape the app handles: `+79991000000`, `+7 999 100 00 00`,
 * `8 (999) 100-00-00`. A leading boundary group is captured and re-emitted
 * instead of a lookbehind — Safari < 16.4 throws a SyntaxError on lookbehind at
 * PARSE time, which would kill the whole client bundle.
 */
const RU_PHONE_RE = /(^|[^\d+])((?:\+7|8|7)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-()]*\d{2}[\s\-()]*\d{2})(?!\d)/g;
/** Any other E.164 number (guest checkout accepts foreign numbers). */
const INTL_PHONE_RE = /(^|[^\d\w+])(\+\d{10,15})(?!\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Anchored on `ey` (base64url of `{"`) so `module.some.path` is not eaten. */
const JWT_RE = /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const AUTH_SCHEME_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
/** Session/OAuth cookies by name, wherever a raw Cookie header leaks into text. */
const COOKIE_PAIR_RE =
  /\b(bh_session|bh_refresh|tg_login_state|vk_oauth_state|vk_oauth_verifier|yandex_oauth_state|yandex_oauth_verifier)=[^;,\s"'[]+/gi;
/**
 * `user:password@host` in any connection string (Postgres, Redis, SMTP, S3).
 * The username is optional (`*`, not `+`): the common `redis://:password@host`
 * form has an empty user and was previously missed (SECURITY-EXPOSURE-AUDIT-01
 * · Y4). The password class stays `+` (a real secret is present).
 */
const URI_CREDENTIALS_RE = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@/]*:[^\s:@/]+@/gi;
/**
 * `token=…`, `client_secret=…` in query strings and log lines. The value class
 * excludes `[` so a second pass never re-matches an already-inserted
 * `[redacted]` marker (every replacement token here starts with `[`).
 */
const SENSITIVE_KV_RE =
  /\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|apikey|session|verifier|signature|jwt|codehash)[A-Za-z0-9_.-]*)(["']?\s*[=:]\s*["']?)([^&\s;,"'}\])[]+)/gi;
/**
 * 🚩 The OTP-in-text rule. `code` is overloaded — `code=BOOKING_CONFLICT` is
 * the most useful token in a triage payload, `code=483920` is a live OTP. The
 * discriminator is the VALUE's shape, so this pattern only fires on 4–8 bare
 * digits and leaves `status_code=500` and every error code untouched.
 */
const OTP_KV_RE = /\b([A-Za-z0-9_.-]*(?:code|otp|pin)[A-Za-z0-9_.-]*)(["']?\s*[=:]\s*["']?)(\d{4,8})(?!\d)/gi;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]}]+/gi;

/** Keep origin + path, drop query and fragment — that is where the PII rides. */
function stripUrlSecrets(rawUrl: string): string {
  const cut = rawUrl.search(/[?#]/);
  return cut === -1 ? rawUrl : rawUrl.slice(0, cut);
}

/**
 * Scrub a single free-text string. Ordering matters: URLs are truncated before
 * the KV pass so a query string is gone rather than partially rewritten.
 */
export function scrubString(input: string, redactLiterals?: LiteralRedactor): string {
  let out = input.length > MAX_STRING_LENGTH ? `${input.slice(0, MAX_STRING_LENGTH)}…` : input;

  // Literal secrets FIRST. Running them last let an earlier pattern mangle the
  // string (an email-shaped `user:pass@host` inside DATABASE_URL, say) so the
  // exact-value match no longer fired — defeating the one layer that catches
  // secrets no pattern knows about.
  if (redactLiterals) out = redactLiterals(out);

  out = out.replace(URL_RE, (url) => stripUrlSecrets(url));
  out = out.replace(URI_CREDENTIALS_RE, (_m, scheme: string) => `${scheme}${REDACTED}@`);
  out = out.replace(COOKIE_PAIR_RE, (_m, name: string) => `${name}=${REDACTED}`);
  out = out.replace(AUTH_SCHEME_RE, (_m, scheme: string) => `${scheme} ${REDACTED}`);
  out = out.replace(JWT_RE, REDACTED);
  out = out.replace(SENSITIVE_KV_RE, (match, key: string, sep: string, value: string) =>
    // Preserve `code=BOOKING_CONFLICT` — an error code is not a secret and is
    // the single most useful token when triaging.
    ERROR_CODE_SHAPE.test(value) ? match : `${key}${sep}${REDACTED}`
  );
  out = out.replace(OTP_KV_RE, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);
  out = out.replace(EMAIL_RE, REDACTED_EMAIL);
  out = out.replace(RU_PHONE_RE, (_m, lead: string) => `${lead}${REDACTED_PHONE}`);
  out = out.replace(INTL_PHONE_RE, (_m, lead: string) => `${lead}${REDACTED_PHONE}`);

  return out;
}

// ── Deep scrubbing of free-form containers ───────────────────────────────────

/**
 * `applyKeyRules` distinguishes the two containers:
 *  - free-form app data (`extra`, `tags`, breadcrumb `data`) → key rules ON;
 *  - known-shape SDK data (`contexts`) → key rules OFF, because `runtime.name`
 *    is "node" and `os.name` is "linux", not a person. Values are still
 *    pattern-scrubbed either way.
 */
function scrubUnknown(
  value: unknown,
  redactLiterals: LiteralRedactor | undefined,
  depth: number,
  applyKeyRules: boolean
): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return scrubString(value, redactLiterals);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return REDACTED;

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => scrubUnknown(item, redactLiterals, depth + 1, applyKeyRules));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message, redactLiterals),
      stack: value.stack ? scrubString(value.stack, redactLiterals) : undefined,
    };
  }

  if (typeof value === "object") {
    return scrubObject(value as Record<string, unknown>, redactLiterals, depth, applyKeyRules);
  }

  return REDACTED;
}

function scrubObject(
  record: Record<string, unknown>,
  redactLiterals: LiteralRedactor | undefined,
  depth: number,
  applyKeyRules: boolean
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (applyKeyRules) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
        continue;
      }
      if (OTP_SHAPED_KEYS.has(normalizeKey(key)) && OTP_SHAPE.test(String(value ?? ""))) {
        // 🚩 The OTP path: `{ code: "483920" }` from the auth routes.
        out[key] = REDACTED;
        continue;
      }
    }
    out[key] = scrubUnknown(value, redactLiterals, depth + 1, applyKeyRules);
  }
  return out;
}

/** Key-based redaction + recursive value scrubbing for a free-form object. */
export function scrubRecord(
  record: Record<string, unknown>,
  redactLiterals?: LiteralRedactor,
  depth = 0
): Record<string, unknown> {
  return scrubObject(record, redactLiterals, depth, true);
}

// ── Event-level allowlists ───────────────────────────────────────────────────

/**
 * Top-level event keys that survive. Everything else — `modules`,
 * `sdkProcessingMetadata` (which carries the SDK's normalised copy of the raw
 * request), `user`, `spans`, arbitrary future fields — is dropped.
 */
const ALLOWED_EVENT_KEYS = new Set([
  "event_id",
  "timestamp",
  "platform",
  "level",
  "logger",
  "server_name",
  "release",
  "dist",
  "environment",
  "transaction",
  "fingerprint",
  "type",
  "sdk",
  // Rebuilt / deep-scrubbed below rather than passed through verbatim.
  "message",
  "logentry",
  "exception",
  "request",
  "contexts",
  "tags",
  "extra",
  "breadcrumbs",
]);

/** Context blocks that carry runtime facts, never user data. */
const ALLOWED_CONTEXT_KEYS = new Set([
  "runtime",
  "os",
  "device",
  "app",
  "browser",
  "culture",
  "trace",
  "cloud_resource",
]);

/** Only header we keep — useful for browser triage, not a direct identifier. */
const ALLOWED_REQUEST_HEADERS = new Set(["user-agent"]);

function scrubRequest(request: unknown, redactLiterals?: LiteralRedactor): Record<string, unknown> | undefined {
  if (!request || typeof request !== "object") return undefined;
  const source = request as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  // Allowlist rebuild: `cookies`, `query_string`, `env` and any raw body are
  // dropped by omission — they are never copied across.
  if (typeof source.method === "string") out.method = source.method;
  if (typeof source.url === "string") out.url = scrubString(stripUrlSecrets(source.url), redactLiterals);

  if (source.headers && typeof source.headers === "object") {
    const headers: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(source.headers as Record<string, unknown>)) {
      if (ALLOWED_REQUEST_HEADERS.has(name.toLowerCase()) && typeof value === "string") {
        headers[name] = scrubString(value, redactLiterals);
      }
    }
    if (Object.keys(headers).length > 0) out.headers = headers;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function scrubContexts(contexts: unknown, redactLiterals?: LiteralRedactor): Record<string, unknown> | undefined {
  if (!contexts || typeof contexts !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [name, block] of Object.entries(contexts as Record<string, unknown>)) {
    if (!ALLOWED_CONTEXT_KEYS.has(name)) continue;
    // Value-pass only — key rules would redact `runtime.name` ("node") and
    // `os.name` ("linux"), which are runtime facts, not people.
    out[name] = scrubUnknown(block, redactLiterals, 1, false);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function scrubStacktrace(stacktrace: unknown, redactLiterals?: LiteralRedactor): unknown {
  if (!stacktrace || typeof stacktrace !== "object") return stacktrace;
  const source = stacktrace as Record<string, unknown>;
  const frames = Array.isArray(source.frames) ? source.frames : [];
  return {
    ...source,
    frames: frames.map((frame) => {
      if (!frame || typeof frame !== "object") return frame;
      const scrubbed: Record<string, unknown> = { ...(frame as ScrubbableFrame) };
      // `vars` (local variables) can hold literally anything — an OTP, a
      // password, a decoded session. Dropped unconditionally; we never enable
      // `includeLocalVariables`, this is defence in depth.
      delete scrubbed.vars;
      if (typeof scrubbed.pre_context === "object") {
        scrubbed.pre_context = scrubUnknown(scrubbed.pre_context, redactLiterals, 2, false);
      }
      if (typeof scrubbed.context_line === "string") {
        scrubbed.context_line = scrubString(scrubbed.context_line, redactLiterals);
      }
      if (typeof scrubbed.post_context === "object") {
        scrubbed.post_context = scrubUnknown(scrubbed.post_context, redactLiterals, 2, false);
      }
      return scrubbed;
    }),
  };
}

function scrubException(exception: unknown, redactLiterals?: LiteralRedactor): unknown {
  if (!exception || typeof exception !== "object") return exception;
  const source = exception as Record<string, unknown>;
  const values = Array.isArray(source.values) ? source.values : [];
  return {
    ...source,
    values: values.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const item = entry as Record<string, unknown>;
      return {
        ...item,
        value: typeof item.value === "string" ? scrubString(item.value, redactLiterals) : item.value,
        stacktrace: scrubStacktrace(item.stacktrace, redactLiterals),
      };
    }),
  };
}

function scrubBreadcrumbs(breadcrumbs: unknown, redactLiterals?: LiteralRedactor): ScrubbableBreadcrumb[] | undefined {
  if (!Array.isArray(breadcrumbs)) return undefined;
  return breadcrumbs.slice(-MAX_ARRAY_ITEMS).map((crumb) => {
    if (!crumb || typeof crumb !== "object") return {};
    const source = crumb as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const field of ["type", "category", "level", "timestamp", "event_id"]) {
      if (source[field] !== undefined) out[field] = source[field];
    }
    if (typeof source.message === "string") out.message = scrubString(source.message, redactLiterals);
    if (source.data && typeof source.data === "object") {
      out.data = scrubRecord(source.data as Record<string, unknown>, redactLiterals, 1);
    }
    return out;
  });
}

/**
 * The single entry point wired into `beforeSend`. Rebuilds the event from the
 * allowlist above, so anything this function does not explicitly copy never
 * leaves the process.
 */
export function scrubEvent(event: ScrubbableEvent, redactLiterals?: LiteralRedactor): ScrubbableEvent {
  const out: ScrubbableEvent = {};

  for (const [key, value] of Object.entries(event)) {
    if (!ALLOWED_EVENT_KEYS.has(key)) continue;
    out[key] = value;
  }

  if (typeof out.message === "string") out.message = scrubString(out.message, redactLiterals);
  if (out.logentry && typeof out.logentry === "object") {
    out.logentry = scrubRecord(out.logentry as Record<string, unknown>, redactLiterals, 1);
  }
  if (out.exception) out.exception = scrubException(out.exception, redactLiterals);
  if (typeof out.transaction === "string") out.transaction = scrubString(out.transaction, redactLiterals);

  const request = scrubRequest(out.request, redactLiterals);
  if (request) out.request = request;
  else delete out.request;

  const contexts = scrubContexts(out.contexts, redactLiterals);
  if (contexts) out.contexts = contexts;
  else delete out.contexts;

  if (out.tags && typeof out.tags === "object") {
    out.tags = scrubRecord(out.tags as Record<string, unknown>, redactLiterals, 1);
  }
  if (out.extra && typeof out.extra === "object") {
    out.extra = scrubRecord(out.extra as Record<string, unknown>, redactLiterals, 1);
  }

  const breadcrumbs = scrubBreadcrumbs(out.breadcrumbs, redactLiterals);
  if (breadcrumbs) out.breadcrumbs = breadcrumbs;
  else delete out.breadcrumbs;

  return out;
}

/**
 * Build a redactor for literal secret VALUES read from `env.ts` (see
 * `server.ts`). Catches the class of leak no pattern can: a `DATABASE_URL`
 * password inside a Prisma connection error, a YooKassa shop secret echoed by
 * a failed request, an HMAC key in a stack frame.
 */
export function createLiteralRedactor(secrets: readonly (string | undefined)[]): LiteralRedactor | undefined {
  const unique = Array.from(
    new Set(secrets.filter((s): s is string => typeof s === "string" && s.trim().length >= 8).map((s) => s.trim()))
  ).sort((a, b) => b.length - a.length);

  if (unique.length === 0) return undefined;

  return (value: string): string => {
    let out = value;
    for (const secret of unique) {
      if (out.includes(secret)) out = out.split(secret).join(REDACTED);
    }
    return out;
  };
}

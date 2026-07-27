import { describe, expect, it } from "vitest";
import { createLiteralRedactor, isSensitiveKey, REDACTED, scrubEvent, scrubString } from "./scrub";

/**
 * OBSERVABILITY-GLITCHTIP-01 — the scrubber is only an assurance until this
 * file passes. It feeds a realistic event carrying every category the product
 * must never ship to error tracking, then asserts none of it survives anywhere
 * in the serialised payload.
 */

// Values that must NEVER appear in a sent event. Asserted individually below
// and again as a whole-payload sweep at the end of the main test.
const PHONE = "+79991000000";
const PHONE_SPACED = "+7 999 100 00 00";
const PHONE_LOCAL = "8 (999) 100-00-00";
const OTP = "483920";
const EMAIL = "elena.petrova.91@yandex.ru";
const SESSION_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.s3cr3tS1gnatureValue";
const YOOKASSA_SECRET = "live_AAAAAAAAAAAAAAAAAAAAAAAA";
const DATABASE_URL = "postgresql://beautyhub:sup3rSecretPassw0rd@db.internal:5432/beautyhub";
const OAUTH_REFRESH = "1//0gRefreshTokenValueFromYandexOAuth";
const PKCE_VERIFIER = "dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CLIENT_NAME = "Елена Петрова";
const MASTER_NOTE = "Аллергия на гель-лак бренда X, приходит с опозданием";

/** A payload shaped like what this app actually produces. */
function buildRealisticEvent(): Record<string, unknown> {
  return {
    event_id: "abc123",
    level: "error",
    platform: "node",
    environment: "production",
    message: `OTP requested for ${PHONE} code=${OTP}`,
    exception: {
      values: [
        {
          type: "PrismaClientInitializationError",
          value: `Can't reach database server at ${DATABASE_URL}`,
          stacktrace: {
            frames: [
              {
                filename: "src/app/api/auth/otp/request/route.ts",
                lineno: 53,
                context_line: `logInfo("OTP requested", { phone: "${PHONE_SPACED}" })`,
                // Frame locals can hold literally anything.
                vars: { code: OTP, phone: PHONE, session: SESSION_JWT },
              },
            ],
          },
        },
      ],
    },
    request: {
      method: "POST",
      url: `https://xn--80aic0adlmagk0m.online/api/auth/otp/request?phone=${PHONE}&token=abc`,
      query_string: `phone=${PHONE}`,
      cookies: { bh_session: SESSION_JWT, bh_refresh: "refresh-jti-value-12345678" },
      headers: {
        "user-agent": "Mozilla/5.0",
        cookie: `bh_session=${SESSION_JWT}; bh_refresh=abc`,
        authorization: `Bearer ${SESSION_JWT}`,
      },
      // A YooKassa webhook body, verbatim.
      data: {
        event: "payment.succeeded",
        object: {
          id: "2f8c1b6e-000f-5000-9000-1b68e7b15f3a",
          amount: { value: "1490.00", currency: "RUB" },
          metadata: { userId: "clw1", planCode: "PRO" },
          receipt: { customer: { email: EMAIL, phone: PHONE } },
        },
        shopSecret: YOOKASSA_SECRET,
      },
    },
    // Sentry attaches its own normalised copy of the request here.
    sdkProcessingMetadata: {
      normalizedRequest: { headers: { cookie: `bh_session=${SESSION_JWT}` }, body: { phone: PHONE, code: OTP } },
    },
    user: { id: "clw1", email: EMAIL, ip_address: "203.0.113.7", username: PHONE },
    tags: {
      error_code: "BOOKING_CONFLICT",
      http_status: 500,
    },
    extra: {
      requestId: "b8f0-req",
      providerId: "clprov1",
      // 🚩 The OTP path — logged in plaintext by design at this stage.
      code: OTP,
      phone: PHONE,
      clientPhone: PHONE_LOCAL,
      clientName: CLIENT_NAME,
      email: EMAIL,
      notes: MASTER_NOTE,
      codeVerifier: PKCE_VERIFIER,
      state: "oauth-state-abcdef123456",
      refreshToken: OAUTH_REFRESH,
      YOOKASSA_SECRET_KEY: YOOKASSA_SECRET,
      nested: {
        deep: {
          bookingComment: `Позвоните на ${PHONE_SPACED}`,
          masterEmail: EMAIL,
        },
      },
    },
    breadcrumbs: [
      {
        category: "fetch",
        message: `POST https://xn--80aic0adlmagk0m.online/api/auth/otp/request?phone=${PHONE}`,
        data: { url: `https://x.online/api/bookings?clientPhone=${PHONE}`, status_code: 500, otpCode: OTP },
      },
      {
        category: "console",
        message: `{"level":"info","message":"OTP requested","phone":"${PHONE}","code":"${OTP}"}`,
      },
    ],
    contexts: {
      runtime: { name: "node", version: "v20.11.0" },
      os: { name: "linux" },
      // Not on the context allowlist — must be dropped wholesale.
      profile: { clientName: CLIENT_NAME, phone: PHONE },
    },
    modules: { next: "16.1.6" },
  };
}

describe("scrubEvent — PII must not survive", () => {
  const redactLiterals = createLiteralRedactor([DATABASE_URL, YOOKASSA_SECRET, "unused"]);
  const scrubbed = scrubEvent(buildRealisticEvent(), redactLiterals);
  const serialized = JSON.stringify(scrubbed);

  it("strips phone numbers in every shape the app produces", () => {
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(PHONE_SPACED);
    expect(serialized).not.toContain(PHONE_LOCAL);
    expect(serialized).not.toContain("9991000000");
  });

  it("🚩 strips the plaintext OTP code (CLAUDE.md rule 9 keeps it in logs)", () => {
    expect(serialized).not.toContain(OTP);
    expect((scrubbed.extra as Record<string, unknown>).code).toBe(REDACTED);
  });

  it("keeps a SCREAMING_SNAKE error code — `code` is overloaded, triage needs it", () => {
    expect((scrubbed.tags as Record<string, unknown>).error_code).toBe("BOOKING_CONFLICT");
  });

  it("strips emails, client names and master-private notes", () => {
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(CLIENT_NAME);
    expect(serialized).not.toContain(MASTER_NOTE);
  });

  it("strips session cookies, JWTs, Authorization and OAuth material", () => {
    expect(serialized).not.toContain(SESSION_JWT);
    expect(serialized).not.toContain(OAUTH_REFRESH);
    expect(serialized).not.toContain(PKCE_VERIFIER);
    expect(serialized).not.toContain("Bearer ey");
  });

  it("drops the whole request body — a YooKassa payload never survives", () => {
    const request = scrubbed.request as Record<string, unknown>;
    expect(request.data).toBeUndefined();
    expect(request.cookies).toBeUndefined();
    expect(request.query_string).toBeUndefined();
    expect(serialized).not.toContain(YOOKASSA_SECRET);
  });

  it("strips the query string but keeps the route path", () => {
    const request = scrubbed.request as Record<string, unknown>;
    expect(request.url).toBe("https://xn--80aic0adlmagk0m.online/api/auth/otp/request");
    expect(request.method).toBe("POST");
  });

  it("keeps only the user-agent header", () => {
    const headers = (scrubbed.request as Record<string, Record<string, unknown>>).headers;
    expect(Object.keys(headers)).toEqual(["user-agent"]);
  });

  it("redacts env-derived secret literals no pattern could match", () => {
    expect(serialized).not.toContain("sup3rSecretPassw0rd");
    expect(serialized).not.toContain(DATABASE_URL);
  });

  it("drops stack-frame local variables entirely", () => {
    const frames = (
      scrubbed.exception as { values: { stacktrace: { frames: Record<string, unknown>[] } }[] }
    ).values[0].stacktrace.frames;
    expect(frames[0].vars).toBeUndefined();
    // …while keeping what makes the stack readable.
    expect(frames[0].filename).toBe("src/app/api/auth/otp/request/route.ts");
    expect(frames[0].lineno).toBe(53);
  });

  it("drops non-allowlisted top-level keys (user, sdkProcessingMetadata, modules)", () => {
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.sdkProcessingMetadata).toBeUndefined();
    expect(scrubbed.modules).toBeUndefined();
  });

  it("drops non-allowlisted context blocks but keeps runtime facts", () => {
    const contexts = scrubbed.contexts as Record<string, unknown>;
    expect(contexts.profile).toBeUndefined();
    expect((contexts.runtime as Record<string, unknown>).name).toBe("node");
  });

  it("scrubs breadcrumbs, including nested data urls", () => {
    const crumbs = scrubbed.breadcrumbs as Record<string, unknown>[];
    expect(JSON.stringify(crumbs)).not.toContain(PHONE);
    expect(JSON.stringify(crumbs)).not.toContain(OTP);
  });

  it("scrubs arbitrarily nested extra payloads", () => {
    const nested = JSON.stringify((scrubbed.extra as Record<string, unknown>).nested);
    expect(nested).not.toContain(PHONE_SPACED);
    expect(nested).not.toContain(EMAIL);
  });

  it("keeps the operational keys that make an event useful", () => {
    const extra = scrubbed.extra as Record<string, unknown>;
    expect(extra.requestId).toBe("b8f0-req");
    expect(extra.providerId).toBe("clprov1");
    expect((scrubbed.tags as Record<string, unknown>).http_status).toBe(500);
    expect(scrubbed.event_id).toBe("abc123");
  });

  it("leaves nothing sensitive anywhere in the serialised payload", () => {
    for (const secret of [
      PHONE,
      PHONE_SPACED,
      PHONE_LOCAL,
      OTP,
      EMAIL,
      SESSION_JWT,
      YOOKASSA_SECRET,
      DATABASE_URL,
      OAUTH_REFRESH,
      PKCE_VERIFIER,
      CLIENT_NAME,
      MASTER_NOTE,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("scrubString", () => {
  it("redacts a raw Cookie header value by cookie name", () => {
    expect(scrubString(`bh_session=${SESSION_JWT}; other=keep`)).toBe(`bh_session=${REDACTED}; other=keep`);
  });

  it("redacts secret-shaped key=value pairs but preserves error codes", () => {
    expect(scrubString("client_secret=abc123def")).toContain(REDACTED);
    expect(scrubString("code=BOOKING_CONFLICT")).toBe("code=BOOKING_CONFLICT");
  });

  it("keeps a URL's path and drops its query", () => {
    expect(scrubString("see https://example.com/api/x?token=abc#frag now")).toBe(
      "see https://example.com/api/x now"
    );
  });

  it("does not eat dotted module paths as JWTs", () => {
    expect(scrubString("at observability.instrumentation.register")).toBe(
      "at observability.instrumentation.register"
    );
  });

  // SECURITY-EXPOSURE-AUDIT-01 · Y4 — the generic URI-credential pattern must
  // catch the password-only form (empty username), the shape REDIS_URL uses.
  it("redacts a password-only connection string (redis://:pw@host)", () => {
    const scrubbed = scrubString("connect ECONNREFUSED redis://:s3cretRedisPw@cache.internal:6379");
    expect(scrubbed).not.toContain("s3cretRedisPw");
    expect(scrubbed).toContain(`redis://${REDACTED}@`);
  });

  it("still redacts the user:password connection form", () => {
    const scrubbed = scrubString("rediss://default:An0therPw@managed.example:6380/0");
    expect(scrubbed).not.toContain("An0therPw");
    expect(scrubbed).toContain(`rediss://${REDACTED}@`);
  });
});

describe("REDIS_URL literal redaction (Y4)", () => {
  // A realistic Redis connection error carrying the full URL must not survive,
  // matching how DATABASE_URL is already covered — the credentials are killed
  // by the literal redactor built from env, and the empty-user form is also
  // caught by the generic URI pattern.
  const REDIS_URL = "redis://:sup3rSecretRedisPass@redis.internal:6379/2";
  const redact = createLiteralRedactor([REDIS_URL]);

  it("removes the password from a Redis connection error message", () => {
    const out = scrubString(`Redis connection failed: ${REDIS_URL}`, redact);
    expect(out).not.toContain("sup3rSecretRedisPass");
    expect(out).not.toContain(REDIS_URL);
  });
});

describe("isSensitiveKey", () => {
  it("matches identity, auth and payment keys across naming styles", () => {
    for (const key of [
      "phone",
      "clientPhone",
      "client_phone",
      "email",
      "userEmail",
      "name",
      "firstName",
      "Authorization",
      "cookie",
      "refreshToken",
      "codeVerifier",
      "codeHash",
      "state",
      "cardNumber",
      "notes",
      "idempotenceKey",
    ]) {
      expect(isSensitiveKey(key), key).toBe(true);
    }
  });

  it("leaves operational keys alone — over-redaction destroys triage", () => {
    for (const key of [
      "requestId",
      "providerId",
      "jobId",
      "jobType",
      "attempts",
      "status",
      "dateKey",
      "cacheKey",
      "durationMs",
      "bookingId",
    ]) {
      expect(isSensitiveKey(key), key).toBe(false);
    }
  });
});

describe("createLiteralRedactor", () => {
  it("returns undefined when there is nothing worth redacting", () => {
    expect(createLiteralRedactor([undefined, "", "short"])).toBeUndefined();
  });

  it("redacts the longest match first so overlapping secrets fully disappear", () => {
    const redact = createLiteralRedactor(["secretvalue", "secretvalue-extended"]);
    expect(redact?.("prefix secretvalue-extended suffix")).toBe(`prefix ${REDACTED} suffix`);
  });
});

import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "@/lib/api/errors";
import { env } from "@/lib/env";
import {
  parseConsentFlags,
  serializeConsentFlags,
  type ConsentFlags,
} from "@/lib/legal/consent-flags";

/**
 * RKN-FIX-01 — carrying the consent the user gave on `/login` across an OAuth
 * round-trip, with the same integrity as the CSRF state itself.
 *
 * Audit finding (Phase 0, item 3): this codebase does NOT keep an OAuth state
 * record in Redis. The `state` nonce lives in an HMAC-signed, HttpOnly cookie
 * (`vk/cookies.ts`, `yandex/cookies.ts`), and the callback trusts it because of
 * that signature. So the equivalent-trust vehicle for the consent flags is the
 * same construction, and the value is BOUND TO THE STATE:
 *
 *     cookie = `${state}:${flags}` + "." + HMAC-SHA256(AUTH_JWT_SECRET)
 *
 * The callback re-derives the signature and additionally requires the embedded
 * state to equal the state it just validated. So the flags cannot be forged,
 * swapped in from another flow, or replayed onto a different authorization —
 * unlike a bare `?consent=1` on the callback URL, which anyone could append.
 *
 * The flags still ENTER at `/start` as query params (that request is the user's
 * own click, and `/start` validates the required ones server-side before
 * signing anything); what matters is that the value the callback acts on is
 * server-signed and state-bound.
 */

export const VK_CONSENT_COOKIE = "vk_id_consent";
export const YANDEX_CONSENT_COOKIE = "yandex_oauth_consent";
export const TELEGRAM_CONSENT_COOKIE = "tg_login_consent";

function requireSigningSecret(): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new AppError("AUTH_JWT_SECRET is not configured", 500, "INTERNAL_ERROR");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", requireSigningSecret()).update(value).digest("base64url");
}

/** Signed cookie value binding the ticked boxes to this flow's `state` nonce. */
export function signConsentCookieValue(state: string, flags: ConsentFlags): string {
  const payload = `${state}:${serializeConsentFlags(flags)}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Authentic AND belongs to this exact flow. Returns null on a missing,
 * tampered, malformed or foreign-state cookie — callers treat null as "no
 * consent captured" and fail safe (never as "consent granted").
 */
export function readConsentCookieValue(
  cookieValue: string | null | undefined,
  expectedState: string,
): ConsentFlags | null {
  if (!cookieValue) return null;
  const index = cookieValue.lastIndexOf(".");
  if (index <= 0) return null;

  const payload = cookieValue.slice(0, index);
  const signature = cookieValue.slice(index + 1);
  if (!signature) return null;

  const expected = sign(payload);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const separator = payload.indexOf(":");
  if (separator < 0) return null;
  const state = payload.slice(0, separator);
  const serializedFlags = payload.slice(separator + 1);

  if (state.length !== expectedState.length) return null;
  if (!timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) return null;

  return parseConsentFlags(serializedFlags);
}

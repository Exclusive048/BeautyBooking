import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import * as cache from "@/lib/cache/cache";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";

/**
 * FIX-9 (HARDENING-06) — login-CSRF defenses for the Telegram login flow.
 *
 * Telegram has no OAuth `start`/`callback` round-trip and cannot echo a custom
 * `state` (the widget only signs its own fields), so the Yandex/VK state-cookie
 * pattern is adapted: `/api/auth/telegram/login-init` mints a nonce, sets it in
 * an HttpOnly signed cookie, and returns it to the widget, which round-trips it
 * via `data-auth-url=...?s=<nonce>`. The login GET requires the cookie to match
 * the `s` param → a captured-fresh Telegram payload can't force-login a victim's
 * browser (which never holds the attacker's nonce). Single-use: the cookie is
 * cleared on use and the auth `hash` is claimed in Redis (replay defense).
 */

export const TELEGRAM_LOGIN_STATE_COOKIE = "tg_login_state";
export const TELEGRAM_LOGIN_STATE_TTL_SECONDS = 10 * 60; // mirrors Yandex

// ≥ the 1h `auth_date` freshness window, so a captured payload can't be replayed
// within its validity.
const TELEGRAM_HASH_TTL_SECONDS = 2 * 60 * 60;

function signingSecret(): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is not configured");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("base64url");
}

function equalConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Mint a nonce + its signed cookie value. */
export function createTelegramLoginState(): { state: string; cookieValue: string } {
  const state = randomBytes(32).toString("hex");
  return { state, cookieValue: `${state}.${sign(state)}` };
}

/**
 * The signed cookie is authentic AND its nonce matches the returned `s` param.
 * Both comparisons are constant-time. Any missing/tampered/mismatched part → false.
 */
export function verifyTelegramLoginState(
  cookieValue: string | undefined | null,
  stateParam: string | undefined | null,
): boolean {
  if (!cookieValue || !stateParam) return false;
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return false;
  const raw = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  if (!signature) return false;
  if (!equalConstantTime(signature, sign(raw))) return false;
  return equalConstantTime(raw, stateParam);
}

/**
 * Single-use the Telegram auth hash. Returns `true` the FIRST time a hash is
 * seen, `false` on any replay within the TTL. Fail-OPEN on a Redis outage
 * (log + allow) — the browser-bound state cookie is the primary CSRF defense,
 * so a replay still requires the victim's (single-use, cleared) cookie.
 */
export async function claimTelegramAuthHash(hash: string): Promise<boolean> {
  const claim = await cache.claimLock(`auth:tg:hash:${hash}`, "1", TELEGRAM_HASH_TTL_SECONDS);
  // FIX-C11: fail-OPEN здесь — прежнее осознанное решение, а не побочный эффект.
  // Replay всё равно требует single-use state-cookie жертвы, поэтому цена отказа
  // (вход не работает) выше цены пропуска (защита деградирует до одного слоя).
  if (claim.status === "unavailable") {
    logError("telegram-login.hash-claim.redis-unavailable", {
      error: claim.error instanceof Error ? claim.error.message : String(claim.error),
    });
    return true;
  }
  return claim.status === "acquired";
}

import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * MASTER-CLIENTS-FIX-A #7а — opaque, master-scoped URL token for the
 * client identifier («Вся история» link). Replaces the previous pattern
 * which embedded the raw client key (`user:<cuid>` / `phone:<phone>`)
 * in the bookings-page query string.
 *
 * Why HMAC + master scope, not plain base64:
 *
 *   - the cuid leak is a real privacy concern (matches CHAT-FOUNDATION's
 *     attachment-URL fix in MASTER-CHAT-ATTACHMENT-FIX-A);
 *   - the token is scoped to one master via `masterProviderId` — another
 *     master cannot reuse the URL even if they intercept it;
 *   - `purpose: "client-history-filter"` claim isolates this token from
 *     the chat-attachment and any future signed URLs so they can't be
 *     replayed across surfaces;
 *   - no schema migration required — the master-scoped scope information
 *     is baked into the signed payload.
 *
 * Server-side only (uses `AUTH_JWT_SECRET`). The detail panel receives the
 * pre-signed token as part of `ClientDetailView`; the bookings page route
 * verifies it before applying the filter.
 */

const TOKEN_PURPOSE = "client-history-filter";
const TTL_SECONDS = 60 * 60 * 24; // 24h — long enough for cabinet bookmarks within a session

type TokenPayload = {
  k: string; // clientKey
  p: string; // masterProviderId
  exp: number;
  purpose: typeof TOKEN_PURPOSE;
};

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function hmac(data: string): string {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is not set");
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function signClientKeyToken(input: {
  clientKey: string;
  masterProviderId: string;
  nowSeconds?: number;
}): string {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    k: input.clientKey,
    p: input.masterProviderId,
    exp: issuedAt + TTL_SECONDS,
    purpose: TOKEN_PURPOSE,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifyClientKeyToken(input: {
  token: string;
  masterProviderId: string;
  nowSeconds?: number;
}): string | null {
  const parts = input.token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = hmac(body);
  // Timing-safe comparison — matches the JWT verifier pattern.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromBase64url(body).toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (payload.purpose !== TOKEN_PURPOSE) return null;
  if (payload.p !== input.masterProviderId) return null;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload.k;
}

import crypto from "crypto";
import { env } from "@/lib/env";

/**
 * STUDIO-MASTERS-PRIVACY-FIX-A — opaque, studio-scoped URL token for
 * studio-master deep-links («Расписание мастера» / «В календарь»).
 * Replaces the previous pattern which embedded the raw master cuid in
 * the query string (e.g. `/cabinet/studio/calendar?masterId=cmpa987`).
 *
 * Third application of the HMAC opaque-URL pattern established in:
 *   - `chat-attachment-token.ts` (CHAT-FOUNDATION attachment fix)
 *   - `client-key-token.ts` (MASTER-CLIENTS-FIX-A history-filter token)
 *
 * Why HMAC + studio scope, not plain base64:
 *
 *   - the cuid leak is a real privacy concern — studio admin can copy
 *     a URL with a prisma id and share it;
 *   - the token is scoped to one studio via `studioId` in the payload
 *     — a studio admin from another studio cannot reuse the URL even
 *     if they intercept it;
 *   - `purpose: "studio-master-view"` claim isolates this token from
 *     the chat-attachment + client-history flows so they cannot be
 *     replayed across surfaces;
 *   - no schema migration required — the studio scope is baked into
 *     the signed payload.
 *
 * Server-side only (uses `AUTH_JWT_SECRET`). UI receives the
 * pre-signed token from the server render of master list/detail; the
 * calendar route verifies it before applying the filter.
 */

const TOKEN_PURPOSE = "studio-master-view";
const TTL_SECONDS = 60 * 60 * 24; // 24h — mirrors `client-key-token.ts`

type TokenPayload = {
  mid: string; // masterProviderId (cuid)
  sid: string; // studioId scoping the token to ONE studio admin context
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

export function signStudioMasterViewToken(input: {
  masterId: string;
  studioId: string;
  nowSeconds?: number;
}): string {
  const issuedAt = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    mid: input.masterId,
    sid: input.studioId,
    exp: issuedAt + TTL_SECONDS,
    purpose: TOKEN_PURPOSE,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = hmac(body);
  return `${body}.${sig}`;
}

export function verifyStudioMasterViewToken(input: {
  token: string;
  studioId: string;
  nowSeconds?: number;
}): string | null {
  const parts = input.token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = hmac(body);
  // Timing-safe comparison — matches `client-key-token.ts` pattern.
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
  if (payload.sid !== input.studioId) return null;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload.mid;
}

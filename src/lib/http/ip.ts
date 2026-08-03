import { env } from "@/lib/env";

export type ClientIpOptions = {
  /** Trusted reverse-proxy hop count (defaults to `env.TRUSTED_PROXY_HOPS`). */
  trustedHops?: number;
  /** Dedicated real-IP header the edge SETS (defaults to `env.TRUSTED_REAL_IP_HEADER`). */
  realIpHeader?: string | null;
};

function firstNonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/**
 * FIX-17 (HARDENING-08): derive the client IP behind a trusted reverse proxy
 * WITHOUT trusting client-supplied `X-Forwarded-For` entries.
 *
 * A reverse proxy that appends (nginx `proxy_add_x_forwarded_for`) puts the IP
 * IT saw at the RIGHT of XFF; anything a client prepends stays on the LEFT. So
 * the real client is the entry `TRUSTED_PROXY_HOPS` from the right (peeling the
 * trusted hops) — NEVER the leftmost, which is attacker-controlled (the old bug:
 * rotating the leftmost value defeated per-IP rate limits → OTP/SMS bombing).
 *
 * The prod topology (# of trusted proxies) is a DEPLOY fact — `TRUSTED_PROXY_HOPS`
 * (default 1: the single reverse proxy that fronts the app, per docker-compose
 * `127.0.0.1:3000`). Safe-default reasoning: a hop count LOWER than reality
 * yields a trusted-infra IP (coarse but NOT attacker-controlled); a count HIGHER
 * than reality re-opens spoofing — so the default errs LOW and the operator only
 * RAISES it to match a multi-hop edge (CDN+LB). If the edge overwrites a
 * dedicated header instead of appending XFF, set `TRUSTED_REAL_IP_HEADER`.
 *
 * For a legitimate single-hop request (one XFF entry) or dev (no XFF), this
 * returns the SAME value as the old leftmost logic — only spoofed leftmost
 * entries stop working.
 */
/**
 * Структурный минимум, который нужен резолверу: что-то с `headers.get()`.
 * `Request` ему удовлетворяет, поэтому все существующие вызовы не меняются;
 * Server Component может передать `{ headers: await headers() }` (RKN-FIX-10 —
 * там `Request` недоступен, а IP для следа чтений нужен).
 */
export type HeaderCarrier = { headers: Pick<Headers, "get"> };

export function extractClientIp(req: HeaderCarrier, options?: ClientIpOptions): string | null {
  // 1. Dedicated trusted header — only if the operator confirms the edge SETS it
  //    (an overwrite-mode edge that passes client XFF through). Preferred when set.
  const realIpHeader = (options?.realIpHeader ?? env.TRUSTED_REAL_IP_HEADER)?.trim();
  if (realIpHeader) {
    const headerVal = firstNonEmpty(req.headers.get(realIpHeader));
    if (headerVal) return headerVal;
  }

  // 2. XFF: peel the trusted hops from the RIGHT. Always ≥1 trusted proxy in prod
  //    (the app binds 127.0.0.1), so the rightmost entry is proxy-appended, not
  //    client-supplied. A non-finite/≤0 configured value falls back to 1 (never
  //    NaN → never silently reading the spoofable leftmost).
  const rawHops = options?.trustedHops ?? env.TRUSTED_PROXY_HOPS;
  const hops = Number.isFinite(rawHops) ? Math.max(1, Math.floor(rawHops)) : 1;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (entries.length > 0) {
      const index = Math.max(0, entries.length - hops);
      return entries[index] ?? null;
    }
  }

  // 3. Last resort — X-Real-IP (weaker: spoofable unless the edge sets it, but a
  //    coarse key is better than none when no XFF is present).
  return firstNonEmpty(req.headers.get("x-real-ip"));
}

/** String variant with an `"unknown"` fallback — convenient for rate-limit keys. */
export function getClientIp(req: HeaderCarrier): string {
  return extractClientIp(req) ?? "unknown";
}

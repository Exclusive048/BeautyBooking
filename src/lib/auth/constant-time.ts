import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time string equality for secrets / tokens
 * (SECURITY-EXPOSURE-AUDIT-01 · B1).
 *
 * Both sides are hashed to a fixed 32-byte SHA-256 digest before comparison, so
 * the comparison is length-independent — a bare `timingSafeEqual` throws on
 * unequal-length buffers, and a length pre-check would itself leak the secret's
 * length. Returns false for any mismatch, never throws.
 *
 * Timing attacks on an HTTP secret are hard to mount in practice (network jitter
 * dwarfs the byte-level delta), which is why the finding is hygiene-grade — but
 * a constant-time compare is the correct default and costs nothing.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

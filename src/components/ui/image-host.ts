/**
 * Client-safe image host allow-list + fallback helper (QA-102-L1, FIX-12).
 *
 * Masters can carry arbitrary uploaded/external image URLs. If a focal /
 * portfolio image points at a host that is NOT configured in
 * `next.config.ts` `images.remotePatterns`, `next/image` THROWS during
 * render — which on a Server Component can break the whole route, not just
 * the one card. This module lets the shared <FocalImage> decide up-front
 * whether a `src` is safe to hand to `next/image`, and substitute a local
 * placeholder otherwise (per-card degradation instead of a route-wide break).
 *
 * No server-only imports here (Rule 13) — pure string logic, safe to import
 * from client components.
 */

/**
 * Remote hosts `next/image` is allowed to optimize.
 *
 * 🔁 MUST mirror `next.config.ts` → `images.remotePatterns`. If you add a
 * host there, add it here too (and vice-versa) — otherwise the new host
 * will silently degrade to the placeholder.
 */
export const ALLOWED_REMOTE_IMAGE_HOSTS: readonly string[] = [
  "storage.yandexcloud.net",
];

/**
 * Neutral local placeholder shown when an image host is unconfigured or the
 * image fails to load at runtime. Lives in `/public`, so it is same-origin
 * and can never itself trip the remote-host validation.
 */
export const IMAGE_FALLBACK_SRC = "/portfolio-placeholders/placeholder.svg";

/**
 * True when `next/image` can optimize `src` without throwing:
 *   - a local / same-origin path (starts with "/", incl. `/api/media/*`), or
 *   - an http(s) URL whose host is in {@link ALLOWED_REMOTE_IMAGE_HOSTS}.
 *
 * Everything else (foreign host, data:/blob:, malformed, empty) → false,
 * meaning the caller should render the placeholder instead.
 */
export function isOptimizableImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true;
  try {
    const url = new URL(src);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return ALLOWED_REMOTE_IMAGE_HOSTS.includes(url.hostname);
    }
    return false;
  } catch {
    return false;
  }
}

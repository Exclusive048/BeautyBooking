// FEAT-PROVIDER-SOCIALS — VK + Instagram community links for providers
// (studios + masters). Free-text community/page links, NOT OAuth account auth.
//
// 🔴 SECURITY: a provider-entered value becomes a PUBLIC clickable href, so it
// is an XSS/phishing vector. This module is the single normalization boundary:
// it extracts a validated handle and RECONSTRUCTS the URL from a hardcoded
// `https://<allowed-host>/` base. Consequences by construction:
//   - the stored/rendered href can only ever point at vk.com / instagram.com;
//   - a non-http(s) scheme (`javascript:`, `data:`, …) can never survive;
//   - a foreign host (`evil.com/…`) is rejected outright.
// The SAME pure function runs on the server (persist-time validation — the
// authoritative boundary) AND on the client (live cabinet preview) AND at
// public render (defense-in-depth re-validation), so all three agree.
//
// Client-safe: pure, zero server-only deps (rule 13) — importable anywhere.

export type SocialKind = "vk" | "instagram";

export type SocialNormalizeResult =
  | { status: "empty" }
  | { status: "ok"; url: string; handle: string }
  | { status: "invalid" };

// Handle charset: letters, digits, `_`, `.`, `-`. Deliberately excludes `:`,
// `/`, whitespace and every URL-structural / scheme character, so a token that
// passes can never carry a scheme or host. vk custom names + id/club/public
// prefixes and instagram usernames (which allow `.`/`_`) all fit within this.
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

// Only a scheme immediately followed by `://` counts as an explicit scheme —
// this is what lets us reject `javascript://…` while treating a bare
// `javascript:alert(1)` (no `//`) as a plain token (which then fails HANDLE_RE).
const EXPLICIT_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

const SOCIAL_CONFIG: Record<SocialKind, { base: string; hosts: readonly string[] }> = {
  vk: { base: "https://vk.com/", hosts: ["vk.com", "www.vk.com", "m.vk.com"] },
  instagram: {
    base: "https://instagram.com/",
    hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  },
};

function stripLeadingAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

/**
 * Normalize a free-text VK / Instagram input (a full URL — with or without
 * scheme / `www.` / `m.` — OR a bare `@handle` / `handle`) into a canonical,
 * guaranteed-safe `https://<host>/<handle>` URL plus the bare handle.
 *
 * - `{ status: "empty" }`   → blank input; the caller clears the field (null).
 * - `{ status: "ok", url, handle }` → safe canonical link (host + scheme locked).
 * - `{ status: "invalid" }` → hostile / foreign-host / malformed; the caller
 *                             rejects it (never stores a live href).
 */
export function normalizeSocialLink(
  kind: SocialKind,
  raw: string | null | undefined,
): SocialNormalizeResult {
  const cfg = SOCIAL_CONFIG[kind];
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { status: "empty" };

  const withoutAt = stripLeadingAt(trimmed).trim();
  if (!withoutAt) return { status: "empty" };

  let handle: string;

  // Anything with a path separator or an explicit scheme is parsed as a URL and
  // its host is validated against the allowlist. A bare token skips URL parsing.
  const looksLikeUrl = withoutAt.includes("://") || withoutAt.includes("/");
  if (looksLikeUrl) {
    const candidate = EXPLICIT_SCHEME_RE.test(withoutAt) ? withoutAt : `https://${withoutAt}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return { status: "invalid" };
    }
    // Scheme allowlist — blocks javascript: / data: / anything non-web.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { status: "invalid" };
    }
    // Host allowlist — blocks foreign hosts (evil.com/…).
    if (!cfg.hosts.includes(parsed.hostname.toLowerCase())) {
      return { status: "invalid" };
    }
    handle = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
  } else {
    // Bare token. A lone allowed-host domain ("vk.com") carries no handle.
    if (cfg.hosts.includes(withoutAt.toLowerCase())) {
      return { status: "invalid" };
    }
    handle = withoutAt;
  }

  if (!handle || !HANDLE_RE.test(handle)) {
    return { status: "invalid" };
  }

  // Reconstruct from the hardcoded safe base — the host + scheme are ours, only
  // the validated handle is user-derived.
  return { status: "ok", url: `${cfg.base}${handle}`, handle };
}

/**
 * Server persist helper: raw input → the value to store (`string` normalized
 * URL, or `null` to clear). Throws-free — returns `{ invalid: true }` so the
 * caller can map it to a clean 400. Idempotent on an already-normalized URL.
 */
export function resolveStoredSocialLink(
  kind: SocialKind,
  raw: string | null | undefined,
): { value: string | null } | { invalid: true } {
  const result = normalizeSocialLink(kind, raw);
  if (result.status === "empty") return { value: null };
  if (result.status === "ok") return { value: result.url };
  return { invalid: true };
}

/**
 * Render helper (defense-in-depth): return a safe href for a stored value, or
 * `null` if it is empty / (somehow) unsafe. Public components call this so a
 * manually-corrupted DB row can never emit a dangerous link.
 */
export function safeSocialHref(kind: SocialKind, stored: string | null | undefined): string | null {
  const result = normalizeSocialLink(kind, stored);
  return result.status === "ok" ? result.url : null;
}

/** Short display handle for the cabinet preview (e.g. `vk.com/durov`). */
export function socialDisplayLabel(kind: SocialKind, stored: string | null | undefined): string | null {
  const result = normalizeSocialLink(kind, stored);
  if (result.status !== "ok") return null;
  return result.url.replace(/^https:\/\//, "");
}

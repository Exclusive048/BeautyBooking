/**
 * SECURITY-EXPOSURE-AUDIT-01 · FIX-SECURITY-MISC-01 (Item 1)
 *
 * The single source of truth for validating a caller-supplied redirect target
 * (`?next=`, post-login landing, …). Both the server redirect helper
 * (`http/origin.ts`) and the client login page delegate here — a per-site
 * string check is exactly how the open redirect slipped in (a naive
 * "starts with `/` and not `//`" test that `/\evil` and a TAB-spliced
 * `//evil` walk straight past).
 *
 * Why this file is dependency-free (no `next/server`, no `env`): the login page
 * is a client component and cannot transitively import server-only modules
 * (CLAUDE.md rule 13). `URL` is a WHATWG global available identically in the
 * browser and Node, so the validation runs unchanged on both sides.
 *
 * The check is not string-matching — it RESOLVES the value against a sacrificial
 * origin and rejects anything that resolves elsewhere. The WHATWG parser treats
 * a backslash as `/` for special schemes and silently strips TAB/LF/CR, which is
 * precisely why those forms bypassed the old check; resolving through the parser
 * turns those tricks against the attacker.
 */

const DEFAULT_INTERNAL_PATH = "/cabinet/profile";

/**
 * An origin no real request can resolve to. If a candidate path resolves away
 * from this, it is not same-origin however it was spelled.
 */
const PROBE_ORIGIN = "https://internal.invalid";

/**
 * C0 control chars (0x00–0x1F, includes TAB/LF/CR) plus DEL (0x7F). Built from
 * a string so the source stays pure ASCII (no literal control bytes in the repo).
 */
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001F\\u007F]");

/**
 * Parse a caller-supplied redirect target into a safe, same-origin **relative**
 * path, or `null` if it is not a legitimate internal path.
 *
 * Guarantees on a non-null result: starts with `/`, is same-origin, and is the
 * parser-normalised `pathname + search + hash` (so `/\evil`-style trickery is
 * either rejected or flattened to a harmless same-origin path).
 */
export function parseInternalPath(target: string | null | undefined): string | null {
  if (!target) return null;
  const trimmed = target.trim();
  if (!trimmed) return null;

  // Control chars (incl. TAB/LF/CR) are never valid in a redirect path. The URL
  // parser strips them, turning a TAB-spliced `//evil` into a scheme-relative
  // URL — so reject them before they reach the parser.
  if (CONTROL_CHARS_RE.test(trimmed)) return null;

  // Must be a path, not an absolute or scheme-relative URL. Backslash is treated
  // as `/` for special schemes, so `/\evil` is scheme-relative — block it.
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;

  // Definitive check: resolve against a sacrificial origin. Anything that leaves
  // that origin is not an internal path.
  let probe: URL;
  try {
    probe = new URL(trimmed, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (probe.origin !== PROBE_ORIGIN) return null;

  return `${probe.pathname}${probe.search}${probe.hash}`;
}

/**
 * Same as {@link parseInternalPath} but returns a safe fallback path instead of
 * `null` when the target is invalid. Use this where a redirect must always have
 * a destination (server redirect helpers); use `parseInternalPath` where an
 * invalid value should fall through to a server-provided default (the login page).
 */
export function sanitizeInternalPath(
  target: string | null | undefined,
  fallback: string = DEFAULT_INTERNAL_PATH
): string {
  return parseInternalPath(target) ?? fallback;
}

export { DEFAULT_INTERNAL_PATH };

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { sanitizeInternalPath } from "@/lib/http/safe-redirect";

const DEFAULT_REDIRECT_PATH = "/cabinet/profile";

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function getPublicOrigin(req: Request): string {
  // SECURITY-EXPOSURE-AUDIT-01 · B4: prefer the configured canonical origin over
  // attacker-controlled `x-forwarded-host`/`x-forwarded-proto` when building
  // redirect bases (OAuth callbacks / logout). Production always sets
  // NEXT_PUBLIC_APP_URL (env.ts requires it), so host-header injection is closed
  // there; dev/test (env unset) fall back to the request headers as before.
  const configured = env.NEXT_PUBLIC_APP_URL?.trim() || env.APP_PUBLIC_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* malformed env — fall back to headers */
    }
  }

  const proto = firstHeaderValue(req.headers.get("x-forwarded-proto")) ?? "http";
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ??
    firstHeaderValue(req.headers.get("host"));

  if (!host) {
    return new URL(req.url).origin;
  }

  return `${proto}://${host}`;
}

/**
 * Validate a caller-supplied internal redirect target, falling back to a safe
 * default. Delegates to the shared, origin-resolving validator — the previous
 * "starts with `/`, not `//`" string check let `/\evil` and TAB-spliced forms
 * resolve off-origin (SECURITY-EXPOSURE-AUDIT-01 · O1).
 */
export function normalizeInternalPath(target: string): string {
  return sanitizeInternalPath(target, DEFAULT_REDIRECT_PATH);
}

export function buildSameOriginRedirectUrl(req: Request, targetPath: string): URL {
  const origin = getPublicOrigin(req);
  const path = normalizeInternalPath(targetPath);
  return new URL(path, origin);
}

export function nextRedirect(req: Request, targetPath: string, status: 302 | 303 | 307 | 308 = 302) {
  return NextResponse.redirect(buildSameOriginRedirectUrl(req, targetPath), status);
}

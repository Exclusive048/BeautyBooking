import { NextResponse } from "next/server";

const DEFAULT_REDIRECT_PATH = "/cabinet/profile";

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function getPublicOrigin(req: Request): string {
  const proto = firstHeaderValue(req.headers.get("x-forwarded-proto")) ?? "http";
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ??
    firstHeaderValue(req.headers.get("host"));

  if (!host) {
    return new URL(req.url).origin;
  }

  return `${proto}://${host}`;
}

export function normalizeInternalPath(target: string): string {
  if (!target) return DEFAULT_REDIRECT_PATH;
  const trimmed = target.trim();
  if (!trimmed) return DEFAULT_REDIRECT_PATH;

  if (/^https?:\/\//i.test(trimmed)) {
    return DEFAULT_REDIRECT_PATH;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return trimmed;
}

export function buildSameOriginRedirectUrl(req: Request, targetPath: string): URL {
  const origin = getPublicOrigin(req);
  const path = normalizeInternalPath(targetPath);
  return new URL(path, origin);
}

export function nextRedirect(req: Request, targetPath: string, status: 302 | 303 | 307 | 308 = 302) {
  return NextResponse.redirect(buildSameOriginRedirectUrl(req, targetPath), status);
}

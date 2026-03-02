import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";

type RateLimitTier =
  | "bookingCreate"
  | "reviewCreate"
  | "mediaUpload"
  | "modelOffer"
  | "modelApplication"
  | "cabinetMutation"
  | "publicApi";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function extractIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  return "unknown";
}

function resolveRateLimitTier(method: string, pathname: string): RateLimitTier | null {
  if (!pathname.startsWith("/api/")) return null;

  if (method === "POST") {
    if (pathname === "/api/bookings") return "bookingCreate";
    if (pathname === "/api/reviews") return "reviewCreate";
    if (pathname === "/api/media") return "mediaUpload";
    if (pathname === "/api/model-offers") return "modelOffer";
    if (pathname === "/api/model-applications") return "modelApplication";
  }

  if (
    MUTATION_METHODS.has(method) &&
    (pathname.startsWith("/api/cabinet/") ||
      pathname.startsWith("/api/master/") ||
      pathname.startsWith("/api/studio/"))
  ) {
    return "cabinetMutation";
  }

  return "publicApi";
}

export async function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  const pathname = normalizePathname(request.nextUrl.pathname);
  const tier = resolveRateLimitTier(method, pathname);

  if (tier) {
    const ip = extractIp(request);
    const key = `rl:${tier}:${ip}:${method}:${pathname}`;
    const result = await checkRateLimit(key, RATE_LIMITS[tier]);

    if (result.limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSeconds),
          },
        }
      );
    }
  }

  const nonce = randomBytes(16).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    ...(!isDev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  // В dev не устанавливаем CSP — нужен eval для Fast Refresh
  if (!isDev) {
    requestHeaders.set("content-security-policy", csp);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (!isDev) {
    response.headers.set("content-security-policy", csp);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
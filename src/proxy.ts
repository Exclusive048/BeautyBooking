import { randomBytes, randomUUID } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMITS } from "@/lib/rate-limit/configs";
import { verifyToken } from "@/lib/auth/jwt";

const PRODUCTION_ORIGIN = "https://beautyhub.art";
const ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, x-idempotency-key";

function getAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  if (process.env.NODE_ENV === "production") {
    if (
      requestOrigin === PRODUCTION_ORIGIN ||
      requestOrigin === `www.${PRODUCTION_ORIGIN.replace("https://", "")}`
    ) {
      return requestOrigin;
    }
    const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (envUrl && requestOrigin === envUrl) return requestOrigin;
    return null;
  }

  if (ALLOWED_DEV_ORIGINS.has(requestOrigin)) return requestOrigin;
  return requestOrigin;
}

function setCorsHeaders(response: NextResponse, origin: string): void {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "600");
}

type RateLimitTier =
  | "bookingCreate"
  | "reviewCreate"
  | "mediaUpload"
  | "modelOffer"
  | "modelApplication"
  | "cabinetMutation"
  | "publicApi";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const REFRESH_ENDPOINT_PATH = "/api/auth/refresh";
const PUBLIC_PATHS = ["/login", "/register", "/api/auth/otp", REFRESH_ENDPOINT_PATH, "/_next", "/favicon"];

function resolveRequestId(request: NextRequest): string {
  const header = request.headers.get("x-request-id");
  if (header && header.trim().length > 0) return header.trim();
  return randomUUID();
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set("x-request-id", requestId);
  return response;
}

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
  if (pathname === REFRESH_ENDPOINT_PATH) return null;

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

function isAccessTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    return Boolean(verifyToken(token, "access"));
  } catch {
    return false;
  }
}

function splitCombinedSetCookieHeader(headerValue: string): string[] {
  return headerValue
    .split(/,(?=\s*[^;,=\s]+=[^;,]*)/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headersWithGetSetCookie.getSetCookie === "function") {
    const values = headersWithGetSetCookie
      .getSetCookie()
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (values.length > 0) return values;
  }

  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return splitCombinedSetCookieHeader(combined);
}

export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const method = request.method.toUpperCase();
  const pathname = normalizePathname(request.nextUrl.pathname);

  // CORS: handle preflight for API routes
  const isApiRoute = pathname.startsWith("/api/");
  const corsOrigin = isApiRoute ? getAllowedOrigin(request.headers.get("origin")) : null;

  if (isApiRoute && method === "OPTIONS") {
    const preflightResponse = new NextResponse(null, { status: 204 });
    if (corsOrigin) setCorsHeaders(preflightResponse, corsOrigin);
    preflightResponse.headers.set("x-request-id", requestId);
    return preflightResponse;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  let refreshedSetCookies: string[] = [];

  if (!isPublicPath) {
    const accessCookieName = process.env.AUTH_COOKIE_NAME ?? "bh_session";
    const accessToken = request.cookies.get(accessCookieName)?.value;
    const accessValid = isAccessTokenValid(accessToken);

    if (!accessValid) {
      const refreshToken = request.cookies.get("bh_refresh")?.value;
      if (refreshToken) {
        const refreshUrl = new URL(REFRESH_ENDPOINT_PATH, request.url);
        const refreshRes = await fetch(refreshUrl.toString(), {
          method: "POST",
          headers: {
            cookie: request.headers.get("cookie") ?? "",
          },
        });

        if (refreshRes.ok) {
          refreshedSetCookies = readSetCookieHeaders(refreshRes.headers);
        }
      }
    }
  }

  const tier = resolveRateLimitTier(method, pathname);

  if (tier) {
    const ip = extractIp(request);
    const key = `rl:${tier}:${ip}:${method}:${pathname}`;
    const result = await checkRateLimit(key, RATE_LIMITS[tier]);

    if (result.limited) {
      return withRequestId(
        NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": String(result.retryAfterSeconds),
            },
          },
        ),
        requestId
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
  for (const setCookie of refreshedSetCookies) {
    response.headers.append("set-cookie", setCookie);
  }

  if (corsOrigin) {
    setCorsHeaders(response, corsOrigin);
  }

  return withRequestId(response, requestId);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

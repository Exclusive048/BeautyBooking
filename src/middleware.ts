import { NextRequest, NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

const ALLOWED_ORIGINS: string[] = isProd
  ? [
      process.env.NEXT_PUBLIC_APP_URL ?? "https://beautyhub.art",
      process.env.APP_PUBLIC_URL ?? "",
    ].filter(Boolean)
  : ["http://localhost:3000", "http://localhost:3001"];

const CORS_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS =
  "Content-Type, Authorization, x-idempotency-key, x-requested-with";
const CORS_MAX_AGE = "86400";

function setCorsHeaders(response: NextResponse, origin: string): void {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin") ?? "";
  const isAllowed =
    !isProd || ALLOWED_ORIGINS.includes(origin);

  // OPTIONS preflight — respond directly without forwarding to route handler
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (isAllowed && origin) {
      setCorsHeaders(response, origin);
      response.headers.set("Access-Control-Max-Age", CORS_MAX_AGE);
    }
    return response;
  }

  // Regular request — forward and attach CORS headers to the response
  const response = NextResponse.next();
  if (isAllowed && origin) {
    setCorsHeaders(response, origin);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};

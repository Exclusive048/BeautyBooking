import { NextResponse, type NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://beautyhub.art";
const ALLOWED_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const CORS_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization, x-idempotency-key";

const isProduction = process.env.NODE_ENV === "production";

function getAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  if (isProduction) {
    if (requestOrigin === PRODUCTION_ORIGIN || requestOrigin === `www.${PRODUCTION_ORIGIN.replace("https://", "")}`) {
      return requestOrigin;
    }
    const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (envUrl && requestOrigin === envUrl) {
      return requestOrigin;
    }
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const allowedOrigin = getAllowedOrigin(origin);

  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });
    if (allowedOrigin) {
      setCorsHeaders(response, allowedOrigin);
    }
    return response;
  }

  const response = NextResponse.next();
  if (allowedOrigin) {
    setCorsHeaders(response, allowedOrigin);
  }
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export async function middleware(request: NextRequest) {
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

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Обновляем/валидируем сессию при необходимости
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { clearSessionCookies, getRefreshCookieName, rotateSessionCookies } from "@/lib/auth/session";
import { nextRedirect, normalizeInternalPath } from "@/lib/http/origin";

const REFRESH_COOKIE_NAME = getRefreshCookieName();

function resolveNextPath(req: Request): string {
  const url = new URL(req.url);
  const path = normalizeInternalPath(url.searchParams.get("next") ?? "/cabinet");
  if (path === "/api/auth/refresh" || path.startsWith("/api/auth/refresh?")) {
    return "/cabinet";
  }
  return path;
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      return fail("No refresh token", 401, "UNAUTHORIZED");
    }

    const response = ok({ ok: true });
    const session = await rotateSessionCookies(response, refreshToken);
    if (!session) {
      const unauthorized = fail("Invalid refresh token", 401, "UNAUTHORIZED");
      clearSessionCookies(unauthorized);
      unauthorized.headers.set("Cache-Control", "no-store");
      return unauthorized;
    }

    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}

export async function GET(req: NextRequest) {
  return withRequestContext(req, async () => {
    const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
    const nextPath = resolveNextPath(req);

    if (!refreshToken) {
      return nextRedirect(req, `/login?next=${encodeURIComponent(nextPath)}`);
    }

    const response = nextRedirect(req, nextPath);
    const session = await rotateSessionCookies(response, refreshToken);
    if (!session) {
      const redirect = nextRedirect(req, `/login?next=${encodeURIComponent(nextPath)}`);
      clearSessionCookies(redirect);
      return redirect;
    }

    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/response";
import { withRequestContext } from "@/lib/api/with-request-context";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth/jwt";
import { setAccessSessionCookie } from "@/lib/auth/session";
import { nextRedirect, normalizeInternalPath } from "@/lib/http/origin";

const REFRESH_COOKIE_NAME = "bh_refresh";

function resolveNextPath(req: Request): string {
  const url = new URL(req.url);
  const path = normalizeInternalPath(url.searchParams.get("next") ?? "/cabinet");
  if (path === "/api/auth/refresh" || path.startsWith("/api/auth/refresh?")) {
    return "/cabinet";
  }
  return path;
}

async function issueAccessSessionFromRefresh(refreshToken: string) {
  const payload = verifyToken(refreshToken, "refresh");
  if (!payload?.sub) return null;

  const user = await prisma.userProfile.findFirst({
    where: { id: payload.sub, isDeleted: false },
    select: { id: true, phone: true, roles: true },
  });
  if (!user) return null;

  return user;
}

export async function POST(req: Request) {
  return withRequestContext(req, async () => {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
    if (!refreshToken) {
      return fail("No refresh token", 401, "UNAUTHORIZED");
    }

    const user = await issueAccessSessionFromRefresh(refreshToken);
    if (!user) {
      return fail("Invalid refresh token", 401, "UNAUTHORIZED");
    }

    const response = ok({ ok: true });
    setAccessSessionCookie(response, { sub: user.id, phone: user.phone ?? null, roles: user.roles });
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

    const user = await issueAccessSessionFromRefresh(refreshToken);
    if (!user) {
      return nextRedirect(req, `/login?next=${encodeURIComponent(nextPath)}`);
    }

    const response = nextRedirect(req, nextPath);
    setAccessSessionCookie(response, { sub: user.id, phone: user.phone ?? null, roles: user.roles });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}

import { NextResponse } from "next/server";
import { jsonFail } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser, setSessionCookies } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const jsonUtf8Headers = { "Content-Type": "application/json; charset=utf-8" };

/**
 * "Завершить все остальные сессии" — revokes every active
 * `RefreshSession` belonging to the user, then issues a fresh session
 * for the **current** request via `setSessionCookies`. Net effect:
 *
 *   - This device receives new access + refresh cookies in the
 *     response → stays logged in transparently.
 *   - All other devices' refresh tokens become inactive → forced
 *     re-login the next time they hit `/api/auth/refresh`.
 *
 * Why not "revoke except current"? The refresh cookie is path-scoped to
 * `/api/auth/refresh` and isn't sent to this route, so we can't read
 * the current `sid`. The revoke-and-reissue pattern gives the same
 * user-facing semantic without leaking refresh tokens across paths.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Unauthorized", "UNAUTHORIZED");

    const now = new Date();
    const result = await prisma.refreshSession.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    const response = NextResponse.json(
      { ok: true, data: { revokedCount: result.count } },
      { status: 200, headers: jsonUtf8Headers }
    );

    // Re-issue cookies for the current device — creates a fresh
    // RefreshSession row alongside the just-revoked ones.
    await setSessionCookies(response, {
      sub: user.id,
      phone: user.phone ?? null,
      roles: user.roles,
    });

    return response;
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/master/account/sessions/revoke-others failed", {
        requestId: getRequestId(req),
        route: "POST /api/master/account/sessions/revoke-others",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}

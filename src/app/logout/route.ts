import { cookies } from "next/headers";
import { nextRedirect } from "@/lib/http/origin";
import { clearSessionCookies, getRefreshCookieName, revokeRefreshSessionByToken } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(getRefreshCookieName())?.value;
  try {
    await revokeRefreshSessionByToken(refreshToken);
  } catch (error) {
    logError("Failed to revoke refresh session on logout", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }

  const res = nextRedirect(req, "/");
  clearSessionCookies(res);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

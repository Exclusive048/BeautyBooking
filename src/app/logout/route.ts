import { cookies } from "next/headers";
import { nextRedirect } from "@/lib/http/origin";
import { clearSessionCookies, getRefreshCookieName, revokeAndClearSessionCookies } from "@/lib/auth/session";
import { logError } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

async function logoutRequest(req: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(getRefreshCookieName())?.value;
  const res = nextRedirect(req, "/");

  try {
    await revokeAndClearSessionCookies(res, refreshToken);
  } catch (error) {
    logError("Failed to revoke refresh session on logout", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    clearSessionCookies(res);
  }

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

export async function GET(req: Request) {
  return logoutRequest(req);
}

export async function POST(req: Request) {
  return logoutRequest(req);
}

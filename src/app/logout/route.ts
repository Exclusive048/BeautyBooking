import { nextRedirect } from "@/lib/http/origin";
import { clearSessionCookies } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const res = nextRedirect(req, "/");
  clearSessionCookies(res);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

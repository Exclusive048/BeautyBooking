import { cookies } from "next/headers";
import { nextRedirect } from "@/lib/http/origin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const name = process.env.AUTH_COOKIE_NAME ?? "bh_session";

  cookieStore.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  const res = nextRedirect(req, "/");
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}

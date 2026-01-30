import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { hasMasterProfile } from "@/lib/auth/roles";
import { hasAnyStudioAccess } from "@/lib/auth/studio-guards";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const hasStudio = await hasAnyStudioAccess(user.id);
  const hasMaster = await hasMasterProfile(user.id);
  const last = hasStudio || hasMaster ? "provider" : "client";

  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/cabinet";
  const target = new URL(next, req.url);

  const res = NextResponse.redirect(target);
  res.cookies.set("bh_last_role", last, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

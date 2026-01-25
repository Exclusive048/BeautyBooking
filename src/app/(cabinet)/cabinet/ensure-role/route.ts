import { NextResponse } from "next/server";
import { AccountType } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const roles = user.roles ?? [];
  const hasStudio = roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN);
  const hasMaster = roles.includes(AccountType.MASTER);
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

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { AccountType } from "@prisma/client";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  if (role !== "client" && role !== "provider") {
    return NextResponse.json({ ok: false, error: { message: "Invalid role" } }, { status: 400 });
  }

  if (role === "provider") {
    const roles = user.roles ?? [];
    const hasStudio = roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN);
    const hasMaster = roles.includes(AccountType.MASTER);
    if (!hasStudio && !hasMaster) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  const next = url.searchParams.get("next") ?? "/cabinet";
  const target = new URL(next, req.url);

  const res = NextResponse.redirect(target);
  res.cookies.set("bh_last_role", role, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

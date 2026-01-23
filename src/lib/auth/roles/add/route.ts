import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

const ALLOWED = new Set(["MASTER", "STUDIO"]);

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? "";

  if (!ALLOWED.has(role)) {
    return NextResponse.redirect(new URL("/roles", req.url));
  }

  const nextRoles = Array.from(new Set([...(user.roles as any), role, "CLIENT"])) as any;

  await prisma.userProfile.update({
    where: { id: user.id },
    data: { roles: { set: nextRoles } },
  });

  // сразу ведём туда, где роль используется
  if (role === "MASTER") return NextResponse.redirect(new URL("/master", req.url));
  if (role === "STUDIO") return NextResponse.redirect(new URL("/studio", req.url));

  return NextResponse.redirect(new URL("/roles", req.url));
}

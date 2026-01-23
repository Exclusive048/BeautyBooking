import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const ALLOWED = new Set(["CLIENT", "MASTER", "STUDIO", "STUDIO_ADMIN"]);

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";

  if (!ALLOWED.has(type)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  await prisma.userProfile.update({
    where: { id: user.id },
    data: { accountType: type as any },
  });

  // Куда редиректим после выбора
  if (type === "MASTER") return NextResponse.redirect(new URL("/master", req.url));
  if (type === "STUDIO") return NextResponse.redirect(new URL("/studio", req.url));

  return NextResponse.redirect(new URL("/", req.url));
}

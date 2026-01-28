import { NextResponse } from "next/server";
import { MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const p = params instanceof Promise ? await params : params;

  const invite = await prisma.studioInvite.findUnique({
    where: { id: p.id },
    select: { id: true, phone: true, status: true },
  });

  if (!invite || invite.status !== MembershipStatus.PENDING) {
    return NextResponse.redirect(new URL("/cabinet", req.url));
  }

  if (!user.phone || user.phone !== invite.phone) {
    return NextResponse.redirect(new URL("/403", req.url));
  }

  await prisma.studioInvite.update({
    where: { id: invite.id },
    data: { status: MembershipStatus.REJECTED },
    select: { id: true },
  });

  return NextResponse.redirect(new URL("/cabinet", req.url));
}

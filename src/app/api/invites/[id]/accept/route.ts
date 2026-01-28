import { NextResponse } from "next/server";
import { AccountType, MembershipStatus, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { addRoleToUser } from "@/lib/auth/roles";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const p = params instanceof Promise ? await params : params;

  const invite = await prisma.studioInvite.findUnique({
    where: { id: p.id },
    select: { id: true, phone: true, studioId: true, status: true },
  });

  if (!invite || invite.status !== MembershipStatus.PENDING) {
    return NextResponse.redirect(new URL("/cabinet", req.url));
  }

  if (!user.phone || user.phone !== invite.phone) {
    return NextResponse.redirect(new URL("/403", req.url));
  }

  const existingMembership = await prisma.studioMembership.findUnique({
    where: { userId_studioId: { userId: user.id, studioId: invite.studioId } },
    select: { id: true, roles: true },
  });

  const nextRoles = existingMembership
    ? Array.from(new Set([...existingMembership.roles, StudioRole.MASTER]))
    : [StudioRole.MASTER];

  if (existingMembership) {
    await prisma.studioMembership.update({
      where: { id: existingMembership.id },
      data: { status: MembershipStatus.ACTIVE, roles: nextRoles },
      select: { id: true },
    });
  } else {
    await prisma.studioMembership.create({
      data: {
        userId: user.id,
        studioId: invite.studioId,
        status: MembershipStatus.ACTIVE,
        roles: nextRoles,
      },
      select: { id: true },
    });
  }

  await prisma.studioInvite.update({
    where: { id: invite.id },
    data: { status: MembershipStatus.ACTIVE },
    select: { id: true },
  });

  if (!user.roles.includes(AccountType.MASTER)) {
    await addRoleToUser(user.id, user.roles, AccountType.MASTER);
  }

  return NextResponse.redirect(new URL(`/cabinet/studio/${invite.studioId}`, req.url));
}

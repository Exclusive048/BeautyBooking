import { NextResponse } from "next/server";
import { AccountType, MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { addRoleToUser } from "@/lib/auth/roles";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await addRoleToUser(user.id, user.roles, AccountType.STUDIO);

  let provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.STUDIO },
    select: { id: true },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        ownerUserId: user.id,
        type: ProviderType.STUDIO,
        name: "New studio",
        tagline: "Add a description in settings",
        rating: 0,
        reviews: 0,
        priceFrom: 0,
        address: "Address not set",
        district: "District not set",
        categories: [],
        availableToday: false,
      },
      select: { id: true },
    });
  }

  const studio = await prisma.studio.upsert({
    where: { providerId: provider.id },
    update: {},
    create: { providerId: provider.id },
    select: { id: true },
  });

  const existingMembership = await prisma.studioMembership.findUnique({
    where: { userId_studioId: { userId: user.id, studioId: studio.id } },
    select: { id: true, roles: true },
  });

  const nextRoles = existingMembership
    ? Array.from(new Set([...existingMembership.roles, StudioRole.ADMIN]))
    : [StudioRole.ADMIN];

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
        studioId: studio.id,
        status: MembershipStatus.ACTIVE,
        roles: nextRoles,
      },
      select: { id: true },
    });
  }

  return NextResponse.redirect(new URL(`/cabinet/studio/${studio.id}`, req.url));
}

import { NextResponse } from "next/server";
import { AccountType, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { addRoleToUser } from "@/lib/auth/roles";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  await addRoleToUser(user.id, user.roles, AccountType.MASTER);

  let provider = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: { id: true },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        ownerUserId: user.id,
        type: ProviderType.MASTER,
        name: "New master",
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

  const existingProfile = await prisma.masterProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!existingProfile) {
    await prisma.masterProfile.create({
      data: { userId: user.id, providerId: provider.id },
      select: { id: true },
    });
  }

  return NextResponse.redirect(new URL("/cabinet/master", req.url));
}

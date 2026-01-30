import { AccountType, MembershipStatus, ProviderType, StudioRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addRoleToUser } from "@/lib/auth/roles";

type MasterProfileCreateResult =
  | { status: "created"; masterProfileId: string; providerId: string }
  | { status: "already-exists"; masterProfileId: string; providerId: string };

type StudioProfileCreateResult =
  | { status: "created"; studioId: string; providerId: string }
  | { status: "already-exists"; studioId: string; providerId: string };

type CreateProfileInput = {
  userId: string;
  roles: AccountType[];
};

export async function createMasterProfile(
  input: CreateProfileInput
): Promise<MasterProfileCreateResult> {
  const existingProfile = await prisma.masterProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, providerId: true },
  });

  if (existingProfile) {
    return {
      status: "already-exists",
      masterProfileId: existingProfile.id,
      providerId: existingProfile.providerId,
    };
  }

  await addRoleToUser(input.userId, input.roles, AccountType.MASTER);

  let provider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.MASTER },
    select: { id: true },
  });

  if (!provider) {
    provider = await prisma.provider.create({
      data: {
        ownerUserId: input.userId,
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

  const createdProfile = await prisma.masterProfile.create({
    data: { userId: input.userId, providerId: provider.id },
    select: { id: true, providerId: true },
  });

  return {
    status: "created",
    masterProfileId: createdProfile.id,
    providerId: createdProfile.providerId,
  };
}

export async function createStudioProfile(
  input: CreateProfileInput
): Promise<StudioProfileCreateResult> {
  const existingProvider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.STUDIO },
    select: { id: true, studioProfile: { select: { id: true } } },
  });

  if (existingProvider?.studioProfile) {
    return {
      status: "already-exists",
      studioId: existingProvider.studioProfile.id,
      providerId: existingProvider.id,
    };
  }

  await addRoleToUser(input.userId, input.roles, AccountType.STUDIO);

  const provider =
    existingProvider ??
    (await prisma.provider.create({
      data: {
        ownerUserId: input.userId,
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
    }));

  const studio = await prisma.studio.upsert({
    where: { providerId: provider.id },
    update: { ownerUserId: input.userId },
    create: { providerId: provider.id, ownerUserId: input.userId },
    select: { id: true },
  });

  const existingMembership = await prisma.studioMembership.findUnique({
    where: { userId_studioId: { userId: input.userId, studioId: studio.id } },
    select: { id: true, roles: true },
  });

  const nextRoles = existingMembership
    ? Array.from(new Set([...existingMembership.roles, StudioRole.OWNER]))
    : [StudioRole.OWNER];

  if (existingMembership) {
    await prisma.studioMembership.update({
      where: { id: existingMembership.id },
      data: { status: MembershipStatus.ACTIVE, roles: nextRoles },
      select: { id: true },
    });
  } else {
    await prisma.studioMembership.create({
      data: {
        userId: input.userId,
        studioId: studio.id,
        status: MembershipStatus.ACTIVE,
        roles: nextRoles,
      },
      select: { id: true },
    });
  }

  return { status: "created", studioId: studio.id, providerId: provider.id };
}

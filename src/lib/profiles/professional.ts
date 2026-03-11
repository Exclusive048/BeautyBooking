import { AccountType, MembershipStatus, ProviderType, StudioRole, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addRoleToUser } from "@/lib/auth/roles";
import { ensureUniqueUsername, generateDefaultUsername } from "@/lib/publicUsername";
import { ensureFreeSubscription } from "@/lib/billing/ensure-free-subscription";
import { logError, logInfo } from "@/lib/logging/logger";

type MasterProfileCreateResult =
  | { status: "created"; masterProfileId: string; providerId: string }
  | { status: "already-exists"; masterProfileId: string; providerId: string };

type StudioProfileCreateResult =
  | { status: "created"; studioId: string; providerId: string }
  | { status: "already-exists"; studioId: string; providerId: string };

type CreateProfileInput = {
  userId: string;
  roles: AccountType[];
  ensureFreeSubscriptionMode?: "sync" | "background";
};

function ensureFreeSubscriptionNonBlocking(userId: string, scope: SubscriptionScope, source: string): void {
  const t0 = Date.now();
  void ensureFreeSubscription(userId, scope)
    .then(() => {
      logInfo("ensureFreeSubscription completed", { userId, scope, source, ms: Date.now() - t0, mode: "background" });
    })
    .catch((error) => {
      logError("ensureFreeSubscription failed", {
        userId,
        scope,
        source,
        mode: "background",
        error: error instanceof Error ? error.stack : error,
      });
    });
}

export async function createMasterProfile(
  input: CreateProfileInput
): Promise<MasterProfileCreateResult> {
  const mode = input.ensureFreeSubscriptionMode ?? "sync";
  const lookupStartedAt = Date.now();
  const [userProfile, existingProfile] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    }),
    prisma.masterProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true, providerId: true },
    }),
  ]);
  logInfo("createMasterProfile: lookup", { userId: input.userId, ms: Date.now() - lookupStartedAt });

  if (existingProfile) {
    if (mode === "background") {
      ensureFreeSubscriptionNonBlocking(input.userId, SubscriptionScope.MASTER, "createMasterProfile:existing");
    } else {
      const t0 = Date.now();
      await ensureFreeSubscription(input.userId, SubscriptionScope.MASTER);
      logInfo("createMasterProfile: ensureFreeSubscription", {
        userId: input.userId,
        mode: "sync",
        path: "existing",
        ms: Date.now() - t0,
      });
    }
    return {
      status: "already-exists",
      masterProfileId: existingProfile.id,
      providerId: existingProfile.providerId,
    };
  }

  const roleAndProviderStartedAt = Date.now();
  const rolePromise = input.roles.includes(AccountType.MASTER)
    ? Promise.resolve(input.roles)
    : addRoleToUser(input.userId, input.roles, AccountType.MASTER);

  const [, existingProvider] = await Promise.all([
    rolePromise,
    prisma.provider.findFirst({
      where: { ownerUserId: input.userId, type: ProviderType.MASTER },
      select: { id: true },
    }),
  ]);
  logInfo("createMasterProfile: role + provider lookup", { userId: input.userId, ms: Date.now() - roleAndProviderStartedAt });

  let provider = existingProvider;

  if (!provider) {
    const usernameStartedAt = Date.now();
    const baseUsername = generateDefaultUsername({
      providerType: ProviderType.MASTER,
      firstName: userProfile?.firstName ?? null,
      lastName: userProfile?.lastName ?? null,
      allowLastName: false,
    });
    const uniqueUsername = await ensureUniqueUsername(prisma, baseUsername);
    logInfo("createMasterProfile: ensureUniqueUsername", { userId: input.userId, ms: Date.now() - usernameStartedAt });

    const providerCreateStartedAt = Date.now();
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
        publicUsername: uniqueUsername,
        publicUsernameUpdatedAt: new Date(),
      },
      select: { id: true },
    });
    logInfo("createMasterProfile: provider.create", { userId: input.userId, ms: Date.now() - providerCreateStartedAt });
  }

  const profileCreateStartedAt = Date.now();
  const createdProfile = await prisma.masterProfile.create({
    data: { userId: input.userId, providerId: provider.id },
    select: { id: true, providerId: true },
  });
  logInfo("createMasterProfile: masterProfile.create", { userId: input.userId, ms: Date.now() - profileCreateStartedAt });

  if (mode === "background") {
    ensureFreeSubscriptionNonBlocking(input.userId, SubscriptionScope.MASTER, "createMasterProfile:created");
  } else {
    const t0 = Date.now();
    await ensureFreeSubscription(input.userId, SubscriptionScope.MASTER);
    logInfo("createMasterProfile: ensureFreeSubscription", {
      userId: input.userId,
      mode: "sync",
      path: "created",
      ms: Date.now() - t0,
    });
  }

  return {
    status: "created",
    masterProfileId: createdProfile.id,
    providerId: createdProfile.providerId,
  };
}

export async function createStudioProfile(
  input: CreateProfileInput
): Promise<StudioProfileCreateResult> {
  const userProfile = await prisma.userProfile.findUnique({
    where: { id: input.userId },
    select: { firstName: true, lastName: true },
  });

  const existingProvider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.STUDIO },
    select: { id: true, studioProfile: { select: { id: true } } },
  });

  if (existingProvider?.studioProfile) {
    await ensureFreeSubscription(input.userId, SubscriptionScope.STUDIO);
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
        publicUsername: await ensureUniqueUsername(
          prisma,
          generateDefaultUsername({
            providerType: ProviderType.STUDIO,
            studioName: "New studio",
            firstName: userProfile?.firstName ?? null,
            lastName: userProfile?.lastName ?? null,
            allowLastName: false,
          })
        ),
        publicUsernameUpdatedAt: new Date(),
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

  await ensureFreeSubscription(input.userId, SubscriptionScope.STUDIO);

  return { status: "created", studioId: studio.id, providerId: provider.id };
}

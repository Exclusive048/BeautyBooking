import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/logging/logger";
import type { ProfileUpdateInput } from "@/lib/users/schemas";

export type MeProfile = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null;
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  hasMasterProfile: boolean;
  hasStudioProfile: boolean;
};

function serializeBirthDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function getMeProfile(userId: string): Promise<MeProfile | null> {
  const t0 = Date.now();
  const [profile, masterProfile, studioProvider] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roles: true,
        displayName: true,
        phone: true,
        email: true,
        externalPhotoUrl: true,
        firstName: true,
        lastName: true,
        middleName: true,
        birthDate: true,
        address: true,
        geoLat: true,
        geoLng: true,
      },
    }),
    prisma.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.STUDIO },
      select: { studioProfile: { select: { id: true } } },
    }),
  ]);
  logInfo("getMeProfile queries done", { userId, ms: Date.now() - t0 });

  if (!profile) return null;

  return {
    ...profile,
    birthDate: serializeBirthDate(profile.birthDate),
    hasMasterProfile: Boolean(masterProfile),
    hasStudioProfile: Boolean(studioProvider?.studioProfile),
  };
}

function toBirthDate(input: string | null | undefined): Date | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function updateMeProfile(
  userId: string,
  input: ProfileUpdateInput
): Promise<MeProfile> {
  const birthDate = toBirthDate(input.birthDate);

  const updated = await prisma.userProfile.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      phone: input.phone,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      address: input.address,
      ...(input.emailNotificationsEnabled !== undefined
        ? { emailNotificationsEnabled: input.emailNotificationsEnabled }
        : {}),
      ...(birthDate !== undefined ? { birthDate } : {}),
    },
    select: {
      id: true,
      roles: true,
      displayName: true,
      phone: true,
      email: true,
      externalPhotoUrl: true,
      firstName: true,
      lastName: true,
      middleName: true,
      birthDate: true,
      address: true,
      geoLat: true,
      geoLng: true,
    },
  });

  const t0 = Date.now();
  const [masterProfile, studioProvider] = await Promise.all([
    prisma.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.provider.findFirst({
      where: { ownerUserId: userId, type: ProviderType.STUDIO },
      select: { studioProfile: { select: { id: true } } },
    }),
  ]);
  logInfo("updateMeProfile relations resolved", { userId, ms: Date.now() - t0 });

  return {
    ...updated,
    birthDate: serializeBirthDate(updated.birthDate),
    hasMasterProfile: Boolean(masterProfile),
    hasStudioProfile: Boolean(studioProvider?.studioProfile),
  };
}

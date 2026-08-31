import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimPhoneForUser } from "@/lib/auth/phone-claim";
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

  // PHONE-CLAIM-01: телефон пишется ТОЛЬКО через единственный примитив —
  // кабинетная запись это заявка (phoneVerifiedAt сбрасывается при смене),
  // занятый номер → AppError 409 с курируемой строкой. Прямой `data.phone`
  // здесь запрещён: он обошёл бы и сброс отметки владения, и освобождение
  // guest-class держателя (см. lib/auth/phone-claim.ts).
  if (input.phone !== undefined) {
    await claimPhoneForUser(userId, input.phone);
  }

  const updated = await prisma.userProfile.update({
    where: { id: userId },
    data: {
      email: input.email,
      // Any email change resets verification (mirrors the client-cabinet path,
      // profile.service.ts): an email set here is unverified until the
      // email OTP flow confirms it, so it is never left flagged as verified.
      ...(input.email !== undefined ? { emailVerifiedAt: null } : {}),
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      ...(input.emailNotificationsEnabled !== undefined
        ? { emailNotificationsEnabled: input.emailNotificationsEnabled }
        : {}),
      ...(input.pushNotificationsEnabled !== undefined
        ? { pushNotificationsEnabled: input.pushNotificationsEnabled }
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

import { BookingStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

const PROFILE_ITEM_COUNT = 6;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().max(200).optional().nullable(),
  birthDate: z
    .string()
    .regex(ISO_DATE_RE, "Дата должна быть в формате YYYY-MM-DD")
    .optional()
    .nullable(),
  hideAgeYear: z.boolean().optional(),
  email: z
    .string()
    .trim()
    .email("Некорректный email")
    .max(255)
    .optional()
    .nullable(),
});

export type ProfileUpdatePatch = z.infer<typeof updateProfileSchema>;

export type ProfileDTO = {
  personal: {
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    birthDate: string | null;
    hideAgeYear: boolean;
  };
  contacts: {
    phone: string | null;
    phoneVerified: boolean;
    email: string | null;
    /**
     * Profile schema currently has no `emailVerifiedAt` column. We treat all
     * emails as unverified — the «Подтвердить» button in the UI is stubbed
     * for the upcoming profile-flows sprint that wires the OTP modal.
     */
    emailVerified: boolean;
  };
  avatar: {
    url: string | null;
  };
  linked: {
    telegram: {
      connected: boolean;
      username: string | null;
      connectedAt: string | null;
    };
    vk: {
      connected: boolean;
      connectedAt: string | null;
    };
  };
  stats: {
    visitsCount: number;
    favoritesCount: number;
    memberSince: string;
  };
  completion: {
    percent: number;
    items: {
      nameLastname: boolean;
      phoneVerified: boolean;
      emailVerified: boolean;
      birthday: boolean;
      tgLinked: boolean;
      vkLinked: boolean;
    };
  };
};

function utcDateToIsoDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolve the avatar URL by checking the AVATAR media asset (preferred) and
 * falling back to the legacy `externalPhotoUrl` (Telegram-imported pic). The
 * MediaAsset lookup is a single indexed query; we do it inline rather than
 * carving out a separate avatar service to keep `getClientProfile` one DB
 * round-trip plus a constant number of joins.
 */
async function resolveAvatarUrl(
  userId: string,
  externalPhotoUrl: string | null,
): Promise<string | null> {
  const avatarAsset = await prisma.mediaAsset.findFirst({
    where: {
      entityType: MediaEntityType.USER,
      entityId: userId,
      kind: MediaKind.AVATAR,
      status: "READY",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (avatarAsset) {
    return `/api/media/${avatarAsset.id}/file`;
  }
  return externalPhotoUrl;
}

function computeCompletion(input: {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerified: boolean;
  birthDate: Date | null;
  tgLinked: boolean;
  vkLinked: boolean;
}): ProfileDTO["completion"] {
  const items = {
    nameLastname: Boolean(input.firstName?.trim() && input.lastName?.trim()),
    phoneVerified: Boolean(input.phone),
    emailVerified: input.emailVerified,
    birthday: input.birthDate !== null,
    tgLinked: input.tgLinked,
    vkLinked: input.vkLinked,
  };
  const done = Object.values(items).filter(Boolean).length;
  const percent = Math.round((done / PROFILE_ITEM_COUNT) * 100);
  return { percent, items };
}

export async function getClientProfile(userId: string): Promise<ProfileDTO> {
  const [user, tgLink, vkLink, visitsCount, favoritesCount] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
        birthDate: true,
        hideAgeYear: true,
        phone: true,
        email: true,
        emailVerifiedAt: true,
        externalPhotoUrl: true,
        createdAt: true,
      },
    }),
    prisma.telegramLink.findUnique({
      where: { userId },
      select: { chatId: true, linkedAt: true, isEnabled: true },
    }),
    prisma.vkLink.findUnique({
      where: { userId },
      select: { vkUserId: true, linkedAt: true, isEnabled: true },
    }),
    prisma.booking.count({
      where: { clientUserId: userId, status: BookingStatus.FINISHED },
    }),
    prisma.userFavorite.count({ where: { userId } }),
  ]);

  if (!user) {
    throw new AppError("User not found", 404, "NOT_FOUND");
  }

  // We expose `telegramUsername` on UserProfile (carried from initial login)
  // but the TelegramLink table is the source of truth for connection state.
  const tgUsernameRow = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { telegramUsername: true },
  });

  const avatarUrl = await resolveAvatarUrl(userId, user.externalPhotoUrl);

  // Email verification status: backed by UserProfile.emailVerifiedAt. The
  // verify endpoint sets the timestamp; the request-verify endpoint clears
  // it (so an email change re-prompts confirmation).
  const emailVerified = Boolean(user.emailVerifiedAt);

  const completion = computeCompletion({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    emailVerified,
    birthDate: user.birthDate,
    tgLinked: Boolean(tgLink?.chatId && tgLink.isEnabled),
    vkLinked: Boolean(vkLink?.vkUserId && vkLink.isEnabled),
  });

  return {
    personal: {
      firstName: user.firstName,
      lastName: user.lastName,
      city: user.address,
      birthDate: user.birthDate ? utcDateToIsoDateKey(user.birthDate) : null,
      hideAgeYear: user.hideAgeYear,
    },
    contacts: {
      phone: user.phone,
      phoneVerified: Boolean(user.phone),
      email: user.email,
      emailVerified,
    },
    avatar: { url: avatarUrl },
    linked: {
      telegram: {
        connected: Boolean(tgLink?.chatId && tgLink.isEnabled),
        username: tgUsernameRow?.telegramUsername ?? null,
        connectedAt: tgLink?.linkedAt?.toISOString() ?? null,
      },
      vk: {
        connected: Boolean(vkLink?.vkUserId && vkLink.isEnabled),
        connectedAt: vkLink?.linkedAt?.toISOString() ?? null,
      },
    },
    stats: {
      visitsCount,
      favoritesCount,
      memberSince: user.createdAt.toISOString(),
    },
    completion,
  };
}

export async function updateClientProfile(
  userId: string,
  patch: ProfileUpdatePatch,
): Promise<ProfileDTO> {
  const data: Record<string, unknown> = {};

  if (patch.firstName !== undefined) {
    data.firstName = patch.firstName?.trim() || null;
  }
  if (patch.lastName !== undefined) {
    data.lastName = patch.lastName?.trim() || null;
  }
  if (patch.city !== undefined) {
    // `address` is the schema-level field; we expose it as `city` in the DTO
    // because the redesign uses the simpler «Город» label.
    data.address = patch.city?.trim() || null;
  }
  if (patch.hideAgeYear !== undefined) {
    data.hideAgeYear = patch.hideAgeYear;
  }
  if (patch.birthDate !== undefined) {
    data.birthDate = patch.birthDate
      ? new Date(`${patch.birthDate}T00:00:00.000Z`)
      : null;
  }
  if (patch.email !== undefined) {
    data.email = patch.email?.trim() || null;
    // Email change always resets verification — user must re-confirm.
    // Same invariant as request-verify endpoint.
    data.emailVerifiedAt = null;
  }

  if (Object.keys(data).length > 0) {
    await prisma.userProfile.update({ where: { id: userId }, data });
  }

  return getClientProfile(userId);
}

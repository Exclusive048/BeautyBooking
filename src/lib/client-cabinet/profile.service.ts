import { BookingStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { resolveLinkState } from "@/lib/auth/link-state";
import { claimPhoneForUser } from "@/lib/auth/phone-claim";
import { isTelegramEnabled } from "@/lib/env";
import { buildMediaFileUrl } from "@/lib/media/types";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { prisma } from "@/lib/prisma";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const updateProfileSchema = z.object({
  firstName: z.string().trim().max(100).optional().nullable(),
  // PHONE-CLAIM-01: заявка на номер (см. lib/auth/phone-claim.ts + rule в
  // lib/users/schemas.ts — та же модель у /api/me). Канонизация на границе
  // разбора, форма из bookingCreateSchema — второго подхода не заводим.
  phone: z
    .union([
      z.null(),
      z
        .string()
        .trim()
        .max(40)
        .transform((value) => normalizeRussianPhone(value))
        .refine((value): value is string => value !== null, {
          message: "Проверьте номер телефона: нужен формат +7 900 000-00-00.",
        }),
    ])
    .optional(),
  lastName: z.string().trim().max(100).optional().nullable(),
  city: z.string().trim().max(200).optional().nullable(),
  birthDate: z
    .string()
    .regex(ISO_DATE_RE, "Проверьте дату рождения.")
    .optional()
    .nullable(),
  hideAgeYear: z.boolean().optional(),
  email: z
    .string()
    .trim()
    .email("Проверьте адрес почты.")
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
    // FIX-LINK-STATE-CONSISTENCY-01: two orthogonal states, never merged into a
    // single `connected`. `linked` = identity (account attached); `deliveryEnabled`
    // = notifications delivered through it (delivery preference).
    telegram: {
      linked: boolean;
      deliveryEnabled: boolean;
      username: string | null;
      connectedAt: string | null;
    };
    vk: {
      linked: boolean;
      deliveryEnabled: boolean;
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
    // PWA-FIX-01: путь именно `/api/media/file/<id>`. Форма `/api/media/<id>/file`
    // была единственной в дереве и роута такого нет (`src/app/api/media/file/[id]`),
    // то есть аватар клиента отдавал 404 — «загрузили фото, а оно не показывается».
    return buildMediaFileUrl(avatarAsset.id);
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
    // PHONE-CLAIM-01: чеклист заполненности считает ПРИСУТСТВИЕ номера, а не
    // владение — подтвердить заявку в проде нечем (SMS-шлюз off), и вечный
    // недостижимый пункт делал бы 100% фиктивным. Ключ исторический
    // (`phoneVerified`), переименование сломало бы маппинг чеклиста в UI.
    phoneVerified: Boolean(input.phone),
    emailVerified: input.emailVerified,
    birthday: input.birthDate !== null,
    tgLinked: input.tgLinked,
    vkLinked: input.vkLinked,
  };
  // FIX-TELEGRAM-COPY-SWEEP: when user-facing Telegram is off the `tgLinked`
  // step isn't a real completion step (the row is hidden) — exclude it from the
  // denominator so 100% stays reachable. `items.tgLinked` is still emitted (DTO
  // type contract) but not counted when off.
  const countedEntries = Object.entries(items).filter(
    ([key]) => isTelegramEnabled || key !== "tgLinked"
  );
  const done = countedEntries.filter(([, value]) => value).length;
  const percent = Math.round((done / countedEntries.length) * 100);
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
        phoneVerifiedAt: true,
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
    throw new AppError("Пользователь не найден.", 404, "NOT_FOUND");
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

  // FIX-LINK-STATE-CONSISTENCY-01: resolve both link states via the single
  // shared predicate — isLinked (identity: account attached) vs
  // isDeliveryEnabled (delivery preference). Never merged into one boolean.
  const telegramState = resolveLinkState({ linkId: tgLink?.chatId, isEnabled: tgLink?.isEnabled });
  const vkState = resolveLinkState({ linkId: vkLink?.vkUserId, isEnabled: vkLink?.isEnabled });

  const completion = computeCompletion({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    emailVerified,
    birthDate: user.birthDate,
    // Completion counts a LINKED account (identity) — delivery preference is
    // orthogonal, so a linked-but-notifications-off account still counts.
    tgLinked: telegramState.isLinked,
    vkLinked: vkState.isLinked,
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
      // PHONE-CLAIM-01: бейдж «Подтверждён» — только доказанное владение
      // (phone-OTP), а не сам факт заполненности. Кабинетная заявка бейджа не
      // получает — подтвердить её без SMS-шлюза пока нечем.
      phoneVerified: Boolean(user.phoneVerifiedAt),
      email: user.email,
      emailVerified,
    },
    avatar: { url: avatarUrl },
    linked: {
      // FIX-LINK-STATE-CONSISTENCY-01: expose BOTH states, never a merged
      // `connected`. The card renders three states from these.
      telegram: {
        linked: telegramState.isLinked,
        deliveryEnabled: telegramState.isDeliveryEnabled,
        username: tgUsernameRow?.telegramUsername ?? null,
        connectedAt: tgLink?.linkedAt?.toISOString() ?? null,
      },
      vk: {
        linked: vkState.isLinked,
        deliveryEnabled: vkState.isDeliveryEnabled,
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
  // PHONE-CLAIM-01: телефон — только через единственный примитив заявки
  // (сброс отметки владения при смене, освобождение guest-class держателя,
  // 409 на занятый номер). Прямой `data.phone` запрещён.
  if (patch.phone !== undefined) {
    await claimPhoneForUser(userId, patch.phone);
  }

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

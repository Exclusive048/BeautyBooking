import * as cache from "@/lib/cache/cache";
import { getWelcomeDialogEnabled, isWelcomePending } from "@/lib/onboarding/welcome-dialog";
import { prisma } from "@/lib/prisma";
import { findClientAvatarFileUrl } from "@/lib/users/client-avatar";

export type MeIdentity = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
  externalPhotoUrl: string | null;
  /**
   * MOBILE-CLIENT-01 (G6): аватар клиента — то же правило, что `avatar.url`
   * кабинетного профиля (`resolveClientAvatarUrl`): загруженный USER-аватар
   * (`/api/media/file/{id}`, приватный, без кропа), иначе `externalPhotoUrl`,
   * иначе `null`. Обязательное: старые кадры кэша не читаются (ключ `me:v2:`).
   */
  avatarUrl: string | null;
  /**
   * MOBILE-CLIENT-01 (G13): владение номером доказано (`phoneVerifiedAt`) —
   * phone-OTP либо номер из VK / Яндекса. `phone` без этого флага — заявка
   * (PHONE-CLAIM-01).
   */
  phoneVerified: boolean;
  emailNotificationsEnabled: boolean;
  /**
   * FIX-B5 (вариант B): адрес от OAuth — ЗАЯВКА, не владение, поэтому
   * кабинету нужно знать состояние, чтобы честно сказать «письма не дойдут».
   * ОПЦИОНАЛЬНОЕ намеренно: кэш `MeIdentity` живёт 30 с, и в окне после
   * деплоя старый кадр поля не несёт. Потребители обязаны трактовать
   * `undefined` как «не знаю» и НЕ нагнетать: отказ в сторону тишины.
   */
  emailVerified?: boolean;
  pushNotificationsEnabled: boolean;
  /**
   * WELCOME-DIALOG-01: показать приветствие этапа тестирования. Опциональное
   * по той же причине, что `emailVerified`: старый кадр кэша поля не несёт, и
   * `undefined` значит «не показывать».
   */
  welcomePending?: boolean;
};

export const ME_CACHE_TTL_SECONDS = 30;

/**
 * MOBILE-CLIENT-01: `v2` — кадр с обязательными `avatarUrl` / `phoneVerified`.
 * Кадры прежней формы (`me:<id>`) не читаются и истекают сами за TTL, поэтому
 * новые поля не нужно делать опциональными, как `emailVerified`.
 */
function buildMeCacheKey(userId: string): string {
  return `me:v2:${userId}`;
}

export async function getCachedMeIdentity(userId: string): Promise<MeIdentity | null> {
  return cache.get<MeIdentity>(buildMeCacheKey(userId));
}

export async function setCachedMeIdentity(userId: string, user: MeIdentity): Promise<void> {
  await cache.set(buildMeCacheKey(userId), user, ME_CACHE_TTL_SECONDS);
}

export async function invalidateMeIdentityCache(userId: string): Promise<void> {
  await cache.del(buildMeCacheKey(userId));
}

export async function getMeIdentityFromDb(userId: string): Promise<MeIdentity | null> {
  const [profile, welcomeEnabled, avatarFileUrl] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roles: true,
        displayName: true,
        phone: true,
        email: true,
        externalPhotoUrl: true,
        emailNotificationsEnabled: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        pushNotificationsEnabled: true,
        welcomeSeenAt: true,
        isDeleted: true,
      },
    }),
    getWelcomeDialogEnabled(),
    // Правило `resolveClientAvatarUrl`, но запрос — параллельно с профилем.
    findClientAvatarFileUrl(userId),
  ]);

  if (!profile || profile.isDeleted) return null;
  return {
    id: profile.id,
    roles: profile.roles,
    displayName: profile.displayName,
    phone: profile.phone,
    email: profile.email,
    externalPhotoUrl: profile.externalPhotoUrl,
    avatarUrl: avatarFileUrl ?? profile.externalPhotoUrl,
    phoneVerified: profile.phoneVerifiedAt !== null,
    emailNotificationsEnabled: profile.emailNotificationsEnabled,
    emailVerified: profile.emailVerifiedAt !== null,
    pushNotificationsEnabled: profile.pushNotificationsEnabled,
    welcomePending: isWelcomePending(welcomeEnabled, profile.welcomeSeenAt),
  };
}

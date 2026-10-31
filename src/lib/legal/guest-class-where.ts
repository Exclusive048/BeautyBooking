import { AccountType, type Prisma } from "@prisma/client";

/**
 * Тот же признак «никогда не был аккаунтом», что `isGuestClassProfile`
 * (`legal/consent.ts`), но условием запроса — для отбора строк по связи
 * (склейка гостевых записей, MANUAL-BOOKING-CLIENT-LINK). Отдельный модуль без
 * `server-only` и без зависимостей, чтобы тесты, подменяющие `legal/consent`,
 * его не теряли. Поля держать в синхроне с функцией — сторож
 * `legal/guest-class-where.test.ts`.
 */
export const GUEST_CLASS_PROFILE_WHERE = {
  refreshSessions: { none: {} },
  email: null,
  emailVerifiedAt: null,
  telegramId: null,
  vkLink: { is: null },
  yandexLink: { is: null },
  roles: { equals: [AccountType.CLIENT] },
} satisfies Prisma.UserProfileWhereInput;

/**
 * Поля, по которым признак считается над уже прочитанной строкой. Их читает
 * и `isGuestClassProfile`, и всякий, кто грузит профиль связью и не хочет
 * отдельного запроса на строку (лента событий админки).
 */
export const GUEST_CLASS_PROFILE_SELECT = {
  roles: true,
  email: true,
  emailVerifiedAt: true,
  telegramId: true,
  vkLink: { select: { id: true } },
  yandexLink: { select: { id: true } },
  // include-ok: счётчик, а не выборка строк.
  _count: { select: { refreshSessions: true } },
} satisfies Prisma.UserProfileSelect;

export type GuestClassProfileRow = Prisma.UserProfileGetPayload<{
  select: typeof GUEST_CLASS_PROFILE_SELECT;
}>;

/** Единственная формула признака — над строкой `GUEST_CLASS_PROFILE_SELECT`. */
export function isGuestClassProfileRow(profile: GuestClassProfileRow): boolean {
  return (
    profile._count.refreshSessions === 0 &&
    !profile.email &&
    !profile.emailVerifiedAt &&
    !profile.telegramId &&
    !profile.vkLink &&
    !profile.yandexLink &&
    profile.roles.length === 1 &&
    profile.roles[0] === AccountType.CLIENT
  );
}

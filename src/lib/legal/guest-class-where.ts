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

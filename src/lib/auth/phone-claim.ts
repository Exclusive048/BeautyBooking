import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { isGuestClassProfile } from "@/lib/legal/consent";
import { prisma } from "@/lib/prisma";

/**
 * PHONE-CLAIM-01 — «заявка ≠ владение» для телефона (зеркало инв. #41 /
 * EMAIL-ADDRESS-OCCUPATION, файл-близнец `email-claim.ts`).
 *
 * Модель: ЗАЯВИТЬ номер может любой аутентифицированный пользователь из
 * кабинета — SMS-шлюза нет, доказать владение нечем, но телефон нужен как
 * контакт для записи и напоминаний. ВЛАДЕТЬ номером может ровно один, и
 * владение даёт только успешно введённый phone-OTP-код (`phoneVerifiedAt`).
 *
 * Отличие от email: уникальность `phone` осталась ПОЛНОЙ (`@unique`), а не
 * частичной — на полном ключе стоят `findUnique` гостевого чекаута, OTP-входа
 * и сидов. Поэтому заявка ЗАНИМАЕТ слот номера, а разрешает конфликт не
 * второй индекс, а освобождение: доказательство владения (OTP) снимает чужие
 * непроверенные заявки, кабинетная заявка снимает только guest-class строку.
 *
 * Что НЕ даёт непроверенная заявка (этим закрыт вектор
 * SECURITY-EXPOSURE-AUDIT-01 #2 — «unverified phone as matching key»):
 *  - phone-OTP-вход НЕ резолвит её как личность (см. `phone-login-profile.ts`);
 *  - гостевая бронь НЕ прикрепляется к заявителю (см. `find-or-create-guest.ts`);
 *  - студийные инвайты НЕ принимаются и НЕ показываются по ней
 *    (`invites/service.ts`, `notifications/{badge,center}.ts`).
 */

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Курируемая строка для 409 — называет и причину, и действие (FIX-C8). */
export const PHONE_TAKEN_MESSAGE =
  "Этот номер уже используется другим аккаунтом. Укажите другой номер.";

/**
 * Снимает НЕподтверждённые заявки на номер со всех профилей, кроме указанного.
 * Зовётся в момент доказательства владения (phone-OTP-вход) — прямое зеркало
 * `releaseUnverifiedEmailClaims`.
 *
 * ⚠️ Условие `phoneVerifiedAt: null` в `where` — граница безопасности, а не
 * оптимизация: без него вызов стирал бы номер у доказанного владельца.
 */
export async function releaseUnverifiedPhoneClaims(
  db: DbClient,
  normalizedPhone: string,
  exceptUserId: string | null,
): Promise<number> {
  const result = await db.userProfile.updateMany({
    where: {
      phone: normalizedPhone,
      phoneVerifiedAt: null,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    data: { phone: null },
  });
  return result.count;
}

/**
 * Кабинетная запись телефона — единственный примитив для обоих PATCH-путей
 * (`/api/me`, `/api/cabinet/user/profile`). Принимает УЖЕ канонизированный
 * номер (`normalizeRussianPhone` отрабатывает в Zod-схемах на границе разбора
 * — форма из `bookingCreateSchema`, второго подхода не заводим) либо `null`.
 *
 * Правила:
 *  - тот же номер повторно — no-op: подтверждённый номер НЕ разжаловывается
 *    сохранением без изменений;
 *  - новый номер — заявка: `phoneVerifiedAt` сбрасывается в null;
 *  - слот занят guest-class строкой (пассивный профиль гостевых броней —
 *    аккаунтом никогда не был) — заявка её освобождает: это частый честный
 *    случай «бронировал гостем, потом зарегистрировался через почту»;
 *  - слот занят установившимся аккаунтом (заявка или владение) — 409: чужую
 *    заявку кабинетная заявка НЕ выбивает (иначе перекладывание номера — grief-
 *    примитив), а владение выбивает только OTP-доказательство.
 *
 * Гонка двух одновременных заявок разрешается БД: проигравший получает P2002,
 * роуты конвертируют его в тот же 409 (`PHONE_TAKEN_MESSAGE`).
 */
export async function claimPhoneForUser(
  userId: string,
  normalizedPhone: string | null,
): Promise<void> {
  const self = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { phone: true },
  });
  if (!self) {
    throw new AppError("Пользователь не найден.", 404, "NOT_FOUND");
  }
  if (self.phone === normalizedPhone) return;

  if (normalizedPhone === null) {
    await prisma.userProfile.update({
      where: { id: userId },
      data: { phone: null, phoneVerifiedAt: null },
    });
    return;
  }

  const holder = await prisma.userProfile.findUnique({
    where: { phone: normalizedPhone },
    select: { id: true, phoneVerifiedAt: true },
  });

  if (holder && holder.id !== userId) {
    const releasable =
      holder.phoneVerifiedAt === null && (await isGuestClassProfile(holder.id));
    if (!releasable) {
      throw new AppError(PHONE_TAKEN_MESSAGE, 409, "ALREADY_EXISTS");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (holder && holder.id !== userId) {
      // Guard повторяет проверку выше на уровне where: если строка держателя
      // между чтением и транзакцией успела подтвердиться, release не тронет её,
      // а наш update упадёт P2002 → 409 у роута.
      await tx.userProfile.updateMany({
        where: { id: holder.id, phone: normalizedPhone, phoneVerifiedAt: null },
        data: { phone: null },
      });
    }
    await tx.userProfile.update({
      where: { id: userId },
      data: { phone: normalizedPhone, phoneVerifiedAt: null },
    });
  });
}

/**
 * Триаж строки, которую `findUnique({ where: { phone } })` вернул phone-OTP-входу.
 * Единственный источник ответа на два вопроса маршрута: «это регистрация?»
 * (гейт согласий ДО сжигания кода) и «в чей профиль выдавать сессию».
 */
/**
 * SESSION-SELECT-LOGIN-PATHS (2026-10-01): вход по телефону читает только поля,
 * нужные триажу и выдаче сессии, а не всю строку профиля.
 */
export const PHONE_LOGIN_PROFILE_SELECT = {
  id: true,
  phone: true,
  phoneVerifiedAt: true,
  roles: true,
} satisfies Prisma.UserProfileSelect;

export type PhoneLoginProfile = Prisma.UserProfileGetPayload<{ select: typeof PHONE_LOGIN_PROFILE_SELECT }>;

export type PhoneLoginTarget =
  /** Подтверждённый владелец возвращается — обычный вход. */
  | { kind: "OWNER"; profile: PhoneLoginProfile }
  /** Пассивный гостевой профиль — конверсия гостя в аккаунт, вход + отметка владения. */
  | { kind: "GUEST_CONVERSION"; profile: PhoneLoginProfile }
  /**
   * Номер заявлен УСТАНОВИВШИМСЯ аккаунтом без доказательства. Входить в него
   * нельзя — это и был бы перехват (владелец номера получил бы сессию в чужом
   * профиле, зеркало дыры FIX-SEC-EMAIL-IDENTITY-01). Заявка освобождается,
   * доказавший получает СВЕЖИЙ профиль — как в email-модели.
   */
  | { kind: "FOREIGN_CLAIM"; profile: PhoneLoginProfile }
  /** Номер свободен — регистрация. */
  | { kind: "NONE" };

export async function classifyPhoneLoginTarget(
  existing: PhoneLoginProfile | null,
): Promise<PhoneLoginTarget> {
  if (!existing) return { kind: "NONE" };
  if (existing.phoneVerifiedAt) return { kind: "OWNER", profile: existing };
  if (await isGuestClassProfile(existing.id)) {
    return { kind: "GUEST_CONVERSION", profile: existing };
  }
  return { kind: "FOREIGN_CLAIM", profile: existing };
}

/** Регистрация = сессию получит свежесозданный профиль → нужны согласия (RKN-FIX-01). */
export function isPhoneLoginRegistration(target: PhoneLoginTarget): boolean {
  return target.kind === "NONE" || target.kind === "FOREIGN_CLAIM";
}

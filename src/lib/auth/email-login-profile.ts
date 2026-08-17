import { AccountType, Prisma, type UserProfile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { ensureClientRoleForUser } from "@/lib/auth/roles";
import { releaseUnverifiedEmailClaims } from "@/lib/auth/email-claim";

// OTP-EMAIL-LOGIN-RACE: local P2002 constant, mirroring the other
// re-read-on-conflict sites (`detect-city.ts`, `conversation-slug.ts`).
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Resolve the {@link UserProfile} for an email-OTP login.
 *
 * Three cases, all landing on the same row a single request would:
 *  - **returning user** (`existing` non-null) → ensure the CLIENT role is present;
 *  - **first-time user** → create a fresh `[CLIENT]` profile;
 *  - **race loser** → two near-simultaneous first-time logins for the same new
 *    email both pass the caller's `findUnique` (both see no row), then both
 *    `create`; the loser hits **P2002** on `UserProfile.email @unique`. Catch it,
 *    re-read the winner's row and continue idempotently (ensuring CLIENT role).
 *
 * This is the 6th re-read-on-conflict P2002 site; it mirrors the recovery in
 * `src/lib/cities/detect-city.ts` and `src/lib/chat/conversation-slug.ts`
 * exactly (catch P2002 → re-read → continue; rethrow anything else).
 *
 * `existing` is passed in (not re-fetched here) so the caller keeps its
 * parallel `Promise.all` lookup — the normal (non-racing) path is unchanged:
 * a fresh create returns directly without an extra role round-trip.
 */
export async function resolveEmailLoginProfile(
  normalizedEmail: string,
  existing: UserProfile | null,
): Promise<UserProfile> {
  if (existing) {
    // FIX-SEC-EMAIL-IDENTITY-01 — сюда попадает только профиль, у которого
    // адрес ПОДТВЕРЖДЁН: неподтверждённый отсеивается на входе (роут передаёт
    // `existing = null`, см. `findVerifiedEmailProfile`). Отметку ставим здесь
    // же на случай будущих вызывающих — идемпотентно.
    return withClientRole(await ensureEmailVerified(existing));
  }

  try {
    // Первый успешный вход по коду с этого адреса И ЕСТЬ доказательство
    // владения — профиль создаётся сразу верифицированным.
    //
    // EMAIL-ADDRESS-OCCUPATION: освобождение чужих НЕподтверждённых заявок и
    // создание идут ОДНОЙ транзакцией. Порядок обязателен и именно такой:
    // после снятия полного `@unique` создание больше не упирается в P2002,
    // когда адрес держит чужая неподтверждённая строка, — то есть без
    // освобождения владелец получил бы профиль, а squat остался бы висеть и
    // продолжил получать сервисную почту на этот адрес.
    return await prisma.$transaction(async (tx) => {
      await releaseUnverifiedEmailClaims(tx, normalizedEmail, null);
      return tx.userProfile.create({
        data: {
          email: normalizedEmail,
          emailVerifiedAt: new Date(),
          roles: [AccountType.CLIENT],
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_VIOLATION
    ) {
      // Гонка: параллельный запрос только что создал строку — перечитываем.
      //
      // 🔴 Тот же фильтр верификации, что и на основном пути. Без него дыра
      // переезжает в гонку: строку мог создать НЕ логин (кабинетный
      // request-verify пишет адрес без доказательства), и тогда перечитанный
      // профиль — чужой и неподтверждённый. Проигравший гонку обязан получить
      // ровно то же решение, что и одиночный запрос.
      const recovered = await findVerifiedEmailProfile(normalizedEmail);
      if (recovered) {
        return withClientRole(recovered);
      }
      // Строка есть, но адрес в ней не подтверждён → это не «вход в
      // существующий». Отдаём типизированный отказ: молча создать второй
      // профиль нельзя (email @unique), войти в чужой — тем более.
      throw new AppError(
        "Не удалось войти по этому адресу. Обратитесь в поддержку.",
        409,
        "EMAIL_NOT_VERIFIED",
      );
    }
    throw error;
  }
}

/**
 * Профиль, которому адрес принадлежит доказанно. Единственная точка, где
 * решается «эта строка годится для входа по email».
 */
export async function findVerifiedEmailProfile(
  normalizedEmail: string,
): Promise<UserProfile | null> {
  return prisma.userProfile.findFirst({
    where: { email: normalizedEmail, emailVerifiedAt: { not: null } },
  });
}

/**
 * Идемпотентно проставляет отметку владения (повторный вход ничего не пишет).
 *
 * EMAIL-ADDRESS-OCCUPATION: вместе с отметкой — освобождение чужих
 * неподтверждённых заявок на этот адрес, одной транзакцией. Ветка достижима
 * только для профиля, который уже прошёл `findVerifiedEmailProfile`, то есть
 * ранний выход выше срабатывает почти всегда; но если сюда всё же передали
 * неподтверждённый профиль, освобождение обязано пройти вместе с отметкой —
 * иначе появился бы второй держатель уже подтверждённого адреса.
 */
async function ensureEmailVerified(profile: UserProfile): Promise<UserProfile> {
  if (profile.emailVerifiedAt) return profile;
  if (!profile.email) {
    return prisma.userProfile.update({
      where: { id: profile.id },
      data: { emailVerifiedAt: new Date() },
    });
  }
  const email = profile.email;
  return prisma.$transaction(async (tx) => {
    await releaseUnverifiedEmailClaims(tx, email, profile.id);
    return tx.userProfile.update({
      where: { id: profile.id },
      data: { emailVerifiedAt: new Date() },
    });
  });
}

/**
 * Ensure the profile carries the CLIENT role. `ensureClientRoleForUser`
 * returns the same array reference when CLIENT is already present, so this is
 * a no-op (no write) for a row that already has it.
 */
async function withClientRole(profile: UserProfile): Promise<UserProfile> {
  const nextRoles = await ensureClientRoleForUser(profile.id, profile.roles);
  return nextRoles === profile.roles ? profile : { ...profile, roles: nextRoles };
}
